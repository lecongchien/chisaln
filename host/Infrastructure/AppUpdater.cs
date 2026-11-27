using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Scream.Infrastructure
{
    /// <summary>Immutable snapshot of the auto-updater state projected to Settings UI and System Tray.</summary>
    internal sealed class UpdateStatusSnapshot
    {
        public string State { get; init; } = "idle";
        public string CurrentVersion { get; init; } = "1.0.0";
        public string LatestVersion { get; init; } = "";
        public int Progress { get; init; }
        public long DownloadedBytes { get; init; }
        public long TotalBytes { get; init; }
        public string ErrorCode { get; init; } = "";
        public string Message { get; init; } = "";
        public bool CanInstall { get; init; }
        public bool IsDevBuild { get; init; }
        public bool AutoUpdate { get; init; } = true;
        public bool UserInitiated { get; init; }
        public string LastCheckedUtc { get; init; } = "";
    }

    /// <summary>
    /// Zero-dependency Windows auto-updater that polls a public release manifest (latest.json),
    /// validates SHA-256 checksums, and applies silent Inno Setup or portable updates cleanly.
    /// </summary>
    internal sealed class AppUpdater : IDisposable
    {
        private const string DefaultManifestUrl =
            "https://github.com/lecongchien/chisaln/releases/latest/download/latest.json";

        private static readonly TimeSpan InitialCheckDelay = TimeSpan.FromSeconds(15);
        private static readonly TimeSpan PeriodicCheckInterval = TimeSpan.FromHours(4);
        private static readonly TimeSpan ManifestTimeout = TimeSpan.FromSeconds(20);
        private static readonly TimeSpan DownloadTimeout = TimeSpan.FromMinutes(10);

        private readonly string _updatesDir;
        private readonly SynchronizationContext? _uiContext;
        private readonly Action _requestAppExit;
        private readonly HttpClient _http;
        private readonly SemaphoreSlim _gate = new(1, 1);
        private readonly CancellationTokenSource _lifetimeCts = new();
        private readonly System.Threading.Timer _scheduleTimer;

        private readonly string _manifestUrl;
        private readonly bool _allowLocalHttp;
        private readonly bool _isDevBuild;
        private readonly bool _isInstalledViaSetup;

        private bool _autoUpdateEnabled;
        private bool _disposed;
        private string _failedAutoVersion = "";
        private ManifestInfo? _latestManifest;
        private string? _downloadedPackagePath;
        private bool _downloadedIsPortable;
        private string _downloadedVersion = "";
        private UpdateStatusSnapshot _snapshot;

        public event Action<UpdateStatusSnapshot>? StateChanged;

        public string CurrentVersion { get; }
        public UpdateStatusSnapshot Snapshot => _snapshot;

        public AppUpdater(
            string dataDir,
            bool autoUpdateEnabled,
            Action requestAppExit)
        {
            _updatesDir = Path.Combine(dataDir, "updates");
            Directory.CreateDirectory(_updatesDir);

            _uiContext = SynchronizationContext.Current;
            _requestAppExit = requestAppExit;
            _autoUpdateEnabled = autoUpdateEnabled;

            CurrentVersion = ReadCurrentVersion();
            (_manifestUrl, _allowLocalHttp) = ResolveManifestUrl();
            _isDevBuild = DetectDevBuild();
            _isInstalledViaSetup = DetectInstalledSetup();

            var handler = new SocketsHttpHandler
            {
                AllowAutoRedirect = true,
                AutomaticDecompression = System.Net.DecompressionMethods.All,
                PooledConnectionLifetime = TimeSpan.FromMinutes(5)
            };
            _http = new HttpClient(handler)
            {
                Timeout = Timeout.InfiniteTimeSpan
            };
            _http.DefaultRequestHeaders.UserAgent.ParseAdd($"Scream/{CurrentVersion} (Windows; x64)");
            _http.DefaultRequestHeaders.Accept.ParseAdd("application/json");

            _snapshot = new UpdateStatusSnapshot
            {
                State = "idle",
                CurrentVersion = CurrentVersion,
                IsDevBuild = _isDevBuild,
                AutoUpdate = _autoUpdateEnabled
            };

            CleanupStaleFiles();

            _scheduleTimer = new System.Threading.Timer(
                _ => _ = RunScheduledCheckAsync(),
                null,
                InitialCheckDelay,
                PeriodicCheckInterval);
        }

        public void SetAutoUpdateEnabled(bool enabled)
        {
            _autoUpdateEnabled = enabled;
            Publish(CloneWith(autoUpdate: enabled));

            if (enabled && _snapshot.State is "available" or "readyToInstall" && !_isDevBuild)
            {
                _ = DownloadAndInstallAsync(silentRelaunch: true, userInitiated: false);
            }
        }

        private async Task RunScheduledCheckAsync()
        {
            if (_disposed || !_autoUpdateEnabled) return;
            await CheckForUpdatesAsync(userInitiated: false).ConfigureAwait(false);
        }

        public async Task CheckForUpdatesAsync(bool userInitiated)
        {
            if (_disposed) return;
            if (!await _gate.WaitAsync(0).ConfigureAwait(false))
            {
                return;
            }

            bool shouldAutoDownload = false;
            try
            {
                if (_disposed) return;

                Publish(new UpdateStatusSnapshot
                {
                    State = "checking",
                    CurrentVersion = CurrentVersion,
                    LatestVersion = _snapshot.LatestVersion,
                    IsDevBuild = _isDevBuild,
                    AutoUpdate = _autoUpdateEnabled,
                    UserInitiated = userInitiated,
                    LastCheckedUtc = _snapshot.LastCheckedUtc
                });

                var manifest = await FetchManifestAsync(_lifetimeCts.Token).ConfigureAwait(false);
                string checkedAt = DateTime.UtcNow.ToString("O");

                if (manifest == null || string.IsNullOrWhiteSpace(manifest.Version))
                {
                    Publish(new UpdateStatusSnapshot
                    {
                        State = "error",
                        CurrentVersion = CurrentVersion,
                        ErrorCode = "manifest",
                        Message = "Invalid update manifest.",
                        IsDevBuild = _isDevBuild,
                        AutoUpdate = _autoUpdateEnabled,
                        UserInitiated = userInitiated,
                        LastCheckedUtc = checkedAt
                    });
                    return;
                }

                bool hasNewer = CompareVersions(manifest.Version, CurrentVersion) > 0;
                if (!hasNewer)
                {
                    _latestManifest = null;
                    Publish(new UpdateStatusSnapshot
                    {
                        State = "upToDate",
                        CurrentVersion = CurrentVersion,
                        LatestVersion = manifest.Version,
                        IsDevBuild = _isDevBuild,
                        AutoUpdate = _autoUpdateEnabled,
                        UserInitiated = userInitiated,
                        LastCheckedUtc = checkedAt
                    });
                    return;
                }

                var pkg = SelectWindowsPackage(manifest);
                if (pkg == null)
                {
                    Publish(new UpdateStatusSnapshot
                    {
                        State = "error",
                        CurrentVersion = CurrentVersion,
                        LatestVersion = manifest.Version,
                        ErrorCode = "manifest",
                        Message = "No Windows package found in manifest.",
                        IsDevBuild = _isDevBuild,
                        AutoUpdate = _autoUpdateEnabled,
                        UserInitiated = userInitiated,
                        LastCheckedUtc = checkedAt
                    });
                    return;
                }

                _latestManifest = manifest;

                bool alreadyReady = !string.IsNullOrEmpty(_downloadedPackagePath)
                    && File.Exists(_downloadedPackagePath)
                    && string.Equals(_downloadedVersion, manifest.Version, StringComparison.OrdinalIgnoreCase);

                Publish(new UpdateStatusSnapshot
                {
                    State = alreadyReady ? "readyToInstall" : "available",
                    CurrentVersion = CurrentVersion,
                    LatestVersion = manifest.Version,
                    Progress = alreadyReady ? 100 : 0,
                    TotalBytes = pkg.Value.Size,
                    CanInstall = true,
                    IsDevBuild = _isDevBuild,
                    AutoUpdate = _autoUpdateEnabled,
                    UserInitiated = userInitiated,
                    LastCheckedUtc = checkedAt
                });

                if (_autoUpdateEnabled
                    && !userInitiated
                    && !_isDevBuild
                    && !string.Equals(_failedAutoVersion, manifest.Version, StringComparison.OrdinalIgnoreCase))
                {
                    shouldAutoDownload = true;
                }
            }
            catch (OperationCanceledException)
            {
                if (!_disposed)
                {
                    Publish(new UpdateStatusSnapshot
                    {
                        State = "error",
                        CurrentVersion = CurrentVersion,
                        ErrorCode = "network",
                        Message = "Update check timed out.",
                        IsDevBuild = _isDevBuild,
                        AutoUpdate = _autoUpdateEnabled,
                        UserInitiated = userInitiated,
                        LastCheckedUtc = _snapshot.LastCheckedUtc
                    });
                }
            }
            catch (Exception ex)
            {
                AppLog.Write($"AppUpdater: Check failed: {ex.Message}");
                if (!_disposed)
                {
                    Publish(new UpdateStatusSnapshot
                    {
                        State = "error",
                        CurrentVersion = CurrentVersion,
                        ErrorCode = "network",
                        Message = ex.Message,
                        IsDevBuild = _isDevBuild,
                        AutoUpdate = _autoUpdateEnabled,
                        UserInitiated = userInitiated,
                        LastCheckedUtc = _snapshot.LastCheckedUtc
                    });
                }
            }
            finally
            {
                _gate.Release();
            }

            if (shouldAutoDownload && !_disposed)
            {
                await DownloadAndInstallAsync(silentRelaunch: true, userInitiated: false).ConfigureAwait(false);
            }
        }

        public async Task DownloadAndInstallAsync(bool silentRelaunch, bool userInitiated)
        {
            if (_disposed) return;

            if (_latestManifest == null)
            {
                await CheckForUpdatesAsync(userInitiated).ConfigureAwait(false);
                if (_latestManifest == null) return;
            }

            if (!await _gate.WaitAsync(0).ConfigureAwait(false))
            {
                return;
            }

            try
            {
                if (_disposed || _latestManifest == null) return;

                var manifest = _latestManifest;
                var selected = SelectWindowsPackage(manifest);
                if (selected == null)
                {
                    PublishError("manifest", "No Windows package available.", manifest.Version, userInitiated);
                    return;
                }

                var (url, expectedSha256, expectedSize, isPortable) = selected.Value;
                if (!IsAllowedUrl(url))
                {
                    PublishError("manifest", "Untrusted update download URL.", manifest.Version, userInitiated);
                    return;
                }

                string ext = isPortable ? ".zip" : ".exe";
                string safeVer = SanitizeFileName(manifest.Version);
                string targetFile = Path.Combine(_updatesDir, $"Scream-v{safeVer}-update{ext}");

                bool needDownload = true;
                if (File.Exists(targetFile) && !string.IsNullOrWhiteSpace(expectedSha256))
                {
                    string existingHash = await ComputeSha256Async(targetFile, _lifetimeCts.Token).ConfigureAwait(false);
                    if (string.Equals(existingHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
                    {
                        needDownload = false;
                    }
                    else
                    {
                        TryDeleteFile(targetFile);
                    }
                }

                if (needDownload)
                {
                    await DownloadFileWithProgressAsync(
                        url,
                        targetFile,
                        manifest.Version,
                        expectedSize,
                        userInitiated,
                        _lifetimeCts.Token).ConfigureAwait(false);

                    if (!string.IsNullOrWhiteSpace(expectedSha256))
                    {
                        string actualHash = await ComputeSha256Async(targetFile, _lifetimeCts.Token).ConfigureAwait(false);
                        if (!string.Equals(actualHash, expectedSha256, StringComparison.OrdinalIgnoreCase))
                        {
                            TryDeleteFile(targetFile);
                            AppLog.Write($"AppUpdater: SHA-256 mismatch for v{manifest.Version}. Expected {expectedSha256}, got {actualHash}");
                            if (!userInitiated) _failedAutoVersion = manifest.Version;
                            PublishError("checksum", "SHA-256 verification failed.", manifest.Version, userInitiated);
                            return;
                        }
                    }
                }

                _downloadedPackagePath = targetFile;
                _downloadedIsPortable = isPortable;
                _downloadedVersion = manifest.Version;

                Publish(new UpdateStatusSnapshot
                {
                    State = "installing",
                    CurrentVersion = CurrentVersion,
                    LatestVersion = manifest.Version,
                    Progress = 100,
                    DownloadedBytes = expectedSize,
                    TotalBytes = expectedSize,
                    CanInstall = false,
                    IsDevBuild = _isDevBuild,
                    AutoUpdate = _autoUpdateEnabled,
                    UserInitiated = userInitiated,
                    LastCheckedUtc = _snapshot.LastCheckedUtc
                });

                bool launched = isPortable
                    ? LaunchPortableSelfUpdate(targetFile, silentRelaunch)
                    : LaunchInnoSetupSilentUpdate(targetFile, silentRelaunch);

                if (!launched)
                {
                    if (!userInitiated) _failedAutoVersion = manifest.Version;
                    PublishError("install", "Could not start the update installer.", manifest.Version, userInitiated);
                    return;
                }

                AppLog.Write($"AppUpdater: Launched v{manifest.Version} installer (portable={isPortable}, silentRelaunch={silentRelaunch}); shutting down current instance.");
                PostToUi(_requestAppExit);
            }
            catch (OperationCanceledException)
            {
                if (!_disposed)
                {
                    PublishError("network", "Download cancelled or timed out.", _latestManifest?.Version ?? "", userInitiated);
                }
            }
            catch (Exception ex)
            {
                AppLog.Write($"AppUpdater: Download/Install failed: {ex.Message}");
                if (!userInitiated && _latestManifest != null)
                {
                    _failedAutoVersion = _latestManifest.Version;
                }
                if (!_disposed)
                {
                    PublishError("install", ex.Message, _latestManifest?.Version ?? "", userInitiated);
                }
            }
            finally
            {
                _gate.Release();
            }
        }

        private async Task<ManifestInfo?> FetchManifestAsync(CancellationToken outerToken)
        {
            if (!IsAllowedUrl(_manifestUrl))
            {
                throw new InvalidOperationException("Manifest URL must use HTTPS.");
            }

            using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerToken);
            cts.CancelAfter(ManifestTimeout);

            // Cache-busting query prevents CDN stale manifests right after publishing a tag
            string sep = _manifestUrl.Contains('?') ? "&" : "?";
            string reqUrl = $"{_manifestUrl}{sep}t={DateTimeOffset.UtcNow.ToUnixTimeSeconds()}";

            using var req = new HttpRequestMessage(HttpMethod.Get, reqUrl);
            req.Headers.CacheControl = new System.Net.Http.Headers.CacheControlHeaderValue { NoCache = true };

            using var resp = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false);
            resp.EnsureSuccessStatusCode();

            await using var stream = await resp.Content.ReadAsStreamAsync(cts.Token).ConfigureAwait(false);
            using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cts.Token).ConfigureAwait(false);
            var root = doc.RootElement;

            string version = root.TryGetProperty("version", out var vEl) ? (vEl.GetString() ?? "").Trim() : "";
            string tag = root.TryGetProperty("tag", out var tEl) ? (tEl.GetString() ?? "").Trim() : "";
            if (string.IsNullOrEmpty(version) && !string.IsNullOrEmpty(tag))
            {
                version = tag.TrimStart('v', 'V');
            }

            string setupUrl = "", setupSha = "", portableUrl = "", portableSha = "";
            long setupSize = 0, portableSize = 0;

            if (root.TryGetProperty("windows", out var winEl) && winEl.ValueKind == JsonValueKind.Object)
            {
                setupUrl = GetString(winEl, "setupUrl");
                setupSha = GetString(winEl, "setupSha256");
                setupSize = GetLong(winEl, "setupSize");
                portableUrl = GetString(winEl, "portableUrl");
                portableSha = GetString(winEl, "portableSha256");
                portableSize = GetLong(winEl, "portableSize");
            }

            return new ManifestInfo(version, tag, setupUrl, setupSha, setupSize, portableUrl, portableSha, portableSize);
        }

        private (string Url, string Sha256, long Size, bool IsPortable)? SelectWindowsPackage(ManifestInfo m)
        {
            // Prefer Portable self-update only when running an extracted non-dev Portable build
            if (!_isInstalledViaSetup && !_isDevBuild && !string.IsNullOrWhiteSpace(m.PortableUrl))
            {
                return (m.PortableUrl, m.PortableSha256, m.PortableSize, true);
            }
            if (!string.IsNullOrWhiteSpace(m.SetupUrl))
            {
                return (m.SetupUrl, m.SetupSha256, m.SetupSize, false);
            }
            if (!string.IsNullOrWhiteSpace(m.PortableUrl))
            {
                return (m.PortableUrl, m.PortableSha256, m.PortableSize, true);
            }
            return null;
        }

        private async Task DownloadFileWithProgressAsync(
            string url,
            string destPath,
            string latestVersion,
            long fallbackSize,
            bool userInitiated,
            CancellationToken outerToken)
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(outerToken);
            cts.CancelAfter(DownloadTimeout);

            string tempPart = destPath + ".part";
            TryDeleteFile(tempPart);

            Publish(new UpdateStatusSnapshot
            {
                State = "downloading",
                CurrentVersion = CurrentVersion,
                LatestVersion = latestVersion,
                Progress = 0,
                DownloadedBytes = 0,
                TotalBytes = fallbackSize,
                IsDevBuild = _isDevBuild,
                AutoUpdate = _autoUpdateEnabled,
                UserInitiated = userInitiated,
                LastCheckedUtc = _snapshot.LastCheckedUtc
            });

            using var resp = await _http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cts.Token).ConfigureAwait(false);
            resp.EnsureSuccessStatusCode();

            long total = resp.Content.Headers.ContentLength ?? fallbackSize;
            long received = 0;
            int lastPct = -1;
            var sw = Stopwatch.StartNew();

            await using (var src = await resp.Content.ReadAsStreamAsync(cts.Token).ConfigureAwait(false))
            await using (var dst = new FileStream(tempPart, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
            {
                byte[] buffer = new byte[81920];
                int read;
                while ((read = await src.ReadAsync(buffer.AsMemory(0, buffer.Length), cts.Token).ConfigureAwait(false)) > 0)
                {
                    await dst.WriteAsync(buffer.AsMemory(0, read), cts.Token).ConfigureAwait(false);
                    received += read;

                    int pct = total > 0 ? (int)Math.Clamp(received * 100L / total, 0, 100) : 0;
                    if (pct != lastPct && (sw.ElapsedMilliseconds >= 140 || pct == 100))
                    {
                        lastPct = pct;
                        sw.Restart();
                        Publish(new UpdateStatusSnapshot
                        {
                            State = "downloading",
                            CurrentVersion = CurrentVersion,
                            LatestVersion = latestVersion,
                            Progress = pct,
                            DownloadedBytes = received,
                            TotalBytes = total,
                            IsDevBuild = _isDevBuild,
                            AutoUpdate = _autoUpdateEnabled,
                            UserInitiated = userInitiated,
                            LastCheckedUtc = _snapshot.LastCheckedUtc
                        });
                    }
                }
            }

            if (File.Exists(destPath)) File.Delete(destPath);
            File.Move(tempPart, destPath);
        }

        private bool LaunchInnoSetupSilentUpdate(string setupExePath, bool silentRelaunch)
        {
            try
            {
                string silentFlag = silentRelaunch ? " /SCREAM_SILENT_LAUNCH=1" : "";
                string args = $"/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /CLOSEAPPLICATIONS{silentFlag}";
                var psi = new ProcessStartInfo
                {
                    FileName = setupExePath,
                    Arguments = args,
                    UseShellExecute = true,
                    WorkingDirectory = _updatesDir
                };
                Process.Start(psi);
                return true;
            }
            catch (Exception ex)
            {
                AppLog.Write($"AppUpdater: Failed to launch Inno Setup: {ex.Message}");
                return false;
            }
        }

        private bool LaunchPortableSelfUpdate(string zipPath, bool silentRelaunch)
        {
            try
            {
                string stageDir = Path.Combine(_updatesDir, $"stage-{Guid.NewGuid():N}");
                Directory.CreateDirectory(stageDir);
                ZipFile.ExtractToDirectory(zipPath, stageDir, overwriteFiles: true);

                string targetDir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
                string exeName = Path.GetFileName(Environment.ProcessPath ?? "Scream.exe");
                if (string.IsNullOrWhiteSpace(exeName)) exeName = "Scream.exe";

                string scriptPath = Path.Combine(_updatesDir, "apply-portable-update.ps1");
                string relaunchArg = silentRelaunch ? "--autostart" : "";
                int pid = Environment.ProcessId;

                string psScript =
                    "param([int]$OldPid, [string]$StageDir, [string]$TargetDir, [string]$ExeName, [string]$RelaunchArg)\r\n" +
                    "$deadline = (Get-Date).AddSeconds(20)\r\n" +
                    "while ((Get-Date) -lt $deadline) {\r\n" +
                    "  if (-not (Get-Process -Id $OldPid -ErrorAction SilentlyContinue)) { break }\r\n" +
                    "  Start-Sleep -Milliseconds 200\r\n" +
                    "}\r\n" +
                    "Start-Sleep -Milliseconds 350\r\n" +
                    "Copy-Item -Path (Join-Path $StageDir '*') -Destination $TargetDir -Recurse -Force\r\n" +
                    "$exePath = Join-Path $TargetDir $ExeName\r\n" +
                    "if (Test-Path $exePath) {\r\n" +
                    "  if ([string]::IsNullOrEmpty($RelaunchArg)) {\r\n" +
                    "    Start-Process -FilePath $exePath\r\n" +
                    "  } else {\r\n" +
                    "    Start-Process -FilePath $exePath -ArgumentList $RelaunchArg\r\n" +
                    "  }\r\n" +
                    "}\r\n" +
                    "Remove-Item -Path $StageDir -Recurse -Force -ErrorAction SilentlyContinue\r\n";

                File.WriteAllText(scriptPath, psScript);

                var psi = new ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                psi.ArgumentList.Add("-NoProfile");
                psi.ArgumentList.Add("-ExecutionPolicy");
                psi.ArgumentList.Add("Bypass");
                psi.ArgumentList.Add("-File");
                psi.ArgumentList.Add(scriptPath);
                psi.ArgumentList.Add(pid.ToString());
                psi.ArgumentList.Add(stageDir);
                psi.ArgumentList.Add(targetDir);
                psi.ArgumentList.Add(exeName);
                psi.ArgumentList.Add(relaunchArg);

                Process.Start(psi);
                return true;
            }
            catch (Exception ex)
            {
                AppLog.Write($"AppUpdater: Portable self-update failed: {ex.Message}");
                return false;
            }
        }

        private void PublishError(string code, string message, string latestVersion, bool userInitiated)
        {
            Publish(new UpdateStatusSnapshot
            {
                State = "error",
                CurrentVersion = CurrentVersion,
                LatestVersion = latestVersion,
                ErrorCode = code,
                Message = message,
                CanInstall = _latestManifest != null,
                IsDevBuild = _isDevBuild,
                AutoUpdate = _autoUpdateEnabled,
                UserInitiated = userInitiated,
                LastCheckedUtc = _snapshot.LastCheckedUtc
            });
        }

        private UpdateStatusSnapshot CloneWith(bool? autoUpdate = null)
        {
            var s = _snapshot;
            return new UpdateStatusSnapshot
            {
                State = s.State,
                CurrentVersion = s.CurrentVersion,
                LatestVersion = s.LatestVersion,
                Progress = s.Progress,
                DownloadedBytes = s.DownloadedBytes,
                TotalBytes = s.TotalBytes,
                ErrorCode = s.ErrorCode,
                Message = s.Message,
                CanInstall = s.CanInstall,
                IsDevBuild = s.IsDevBuild,
                AutoUpdate = autoUpdate ?? s.AutoUpdate,
                UserInitiated = s.UserInitiated,
                LastCheckedUtc = s.LastCheckedUtc
            };
        }

        private void Publish(UpdateStatusSnapshot next)
        {
            _snapshot = next;
            PostToUi(() =>
            {
                if (!_disposed) StateChanged?.Invoke(next);
            });
        }

        private void PostToUi(Action action)
        {
            if (_uiContext != null)
            {
                _uiContext.Post(_ => action(), null);
            }
            else
            {
                action();
            }
        }

        private bool IsAllowedUrl(string url)
        {
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
            if (uri.Scheme == Uri.UriSchemeHttps) return true;
            if (_allowLocalHttp && uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback) return true;
            return false;
        }

        private static (string Url, bool AllowLocalHttp) ResolveManifestUrl()
        {
            string? envUrl = Environment.GetEnvironmentVariable("SCREAM_UPDATE_URL");
            if (!string.IsNullOrWhiteSpace(envUrl))
            {
                return (envUrl.Trim(), true);
            }

            var asm = Assembly.GetExecutingAssembly();
            var meta = asm.GetCustomAttributes<AssemblyMetadataAttribute>()
                .FirstOrDefault(a => string.Equals(a.Key, "ScreamUpdateManifestUrl", StringComparison.OrdinalIgnoreCase));
            if (!string.IsNullOrWhiteSpace(meta?.Value))
            {
                return (meta.Value.Trim(), false);
            }

            return (DefaultManifestUrl, false);
        }

        private static string ReadCurrentVersion()
        {
            var asm = Assembly.GetExecutingAssembly();
            string? info = asm.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
            if (!string.IsNullOrWhiteSpace(info))
            {
                int plus = info.IndexOf('+');
                if (plus > 0) info = info[..plus];
                return info.TrimStart('v', 'V');
            }

            var v = asm.GetName().Version;
            if (v != null)
            {
                return $"{v.Major}.{v.Minor}.{Math.Max(0, v.Build)}";
            }
            return "1.0.0";
        }

        internal static int CompareVersions(string a, string b)
        {
            static (int[] Nums, string Pre) Parse(string raw)
            {
                string s = (raw ?? "").Trim().TrimStart('v', 'V');
                int plus = s.IndexOf('+');
                if (plus >= 0) s = s[..plus];

                string pre = "";
                int dash = s.IndexOf('-');
                if (dash >= 0)
                {
                    pre = s[(dash + 1)..];
                    s = s[..dash];
                }

                string[] parts = s.Split('.', StringSplitOptions.RemoveEmptyEntries);
                int[] nums = new int[Math.Max(3, parts.Length)];
                for (int i = 0; i < parts.Length; i++)
                {
                    _ = int.TryParse(parts[i], out nums[i]);
                }
                return (nums, pre);
            }

            var pa = Parse(a);
            var pb = Parse(b);
            int len = Math.Max(pa.Nums.Length, pb.Nums.Length);
            for (int i = 0; i < len; i++)
            {
                int va = i < pa.Nums.Length ? pa.Nums[i] : 0;
                int vb = i < pb.Nums.Length ? pb.Nums[i] : 0;
                if (va != vb) return va.CompareTo(vb);
            }

            bool aPre = !string.IsNullOrEmpty(pa.Pre);
            bool bPre = !string.IsNullOrEmpty(pb.Pre);
            if (aPre && !bPre) return -1;
            if (!aPre && bPre) return 1;
            return string.Compare(pa.Pre, pb.Pre, StringComparison.OrdinalIgnoreCase);
        }

        private static bool DetectDevBuild()
        {
            if (Debugger.IsAttached) return true;
            string? dir = AppContext.BaseDirectory;
            for (int i = 0; i < 6 && !string.IsNullOrEmpty(dir); i++)
            {
                if (File.Exists(Path.Combine(dir, "Scream.csproj"))) return true;
                dir = Directory.GetParent(dir)?.FullName;
            }
            return false;
        }

        private static bool DetectInstalledSetup()
        {
            string baseDir = AppContext.BaseDirectory;
            if (File.Exists(Path.Combine(baseDir, "unins000.exe"))) return true;

            string defaultInstallDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Programs", "Scream");
            return string.Equals(
                Path.GetFullPath(baseDir).TrimEnd('\\', '/'),
                Path.GetFullPath(defaultInstallDir).TrimEnd('\\', '/'),
                StringComparison.OrdinalIgnoreCase);
        }

        private void CleanupStaleFiles()
        {
            try
            {
                foreach (string file in Directory.GetFiles(_updatesDir))
                {
                    var info = new FileInfo(file);
                    if (file.EndsWith(".part", StringComparison.OrdinalIgnoreCase)
                        || (DateTime.UtcNow - info.LastWriteTimeUtc) > TimeSpan.FromHours(12))
                    {
                        TryDeleteFile(file);
                    }
                }
                foreach (string dir in Directory.GetDirectories(_updatesDir, "stage-*"))
                {
                    try { Directory.Delete(dir, true); } catch { }
                }
            }
            catch { }
        }

        private static async Task<string> ComputeSha256Async(string filePath, CancellationToken ct)
        {
            await using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
            byte[] hash = await SHA256.HashDataAsync(fs, ct).ConfigureAwait(false);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }

        private static string GetString(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out var p) && p.ValueKind == JsonValueKind.String ? (p.GetString() ?? "").Trim() : "";

        private static long GetLong(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out var p) && p.TryGetInt64(out long v) ? v : 0;

        private static string SanitizeFileName(string raw)
        {
            char[] invalid = Path.GetInvalidFileNameChars();
            return new string(raw.Where(c => !invalid.Contains(c)).ToArray());
        }

        private static void TryDeleteFile(string path)
        {
            try { if (File.Exists(path)) File.Delete(path); } catch { }
        }

        public void Dispose()
        {
            if (_disposed) return;
            _disposed = true;
            _scheduleTimer.Dispose();
            try { _lifetimeCts.Cancel(); } catch { }
            _lifetimeCts.Dispose();
            _http.Dispose();
            _gate.Dispose();
        }

        private sealed record ManifestInfo(
            string Version,
            string Tag,
            string SetupUrl,
            string SetupSha256,
            long SetupSize,
            string PortableUrl,
            string PortableSha256,
            long PortableSize);
    }
}
