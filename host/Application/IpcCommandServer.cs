using System;
using System.IO;
using System.IO.Pipes;
using System.Threading;
using System.Threading.Tasks;

namespace Scream.Application
{
    /// <summary>Single-instance NamedPipe IPC server & client for CLI forwarding (--settings, --menu, --exit).</summary>
    internal sealed class IpcCommandServer : IDisposable
    {
        public const string PipeName = "ScreamWallpaper_IPC_Pipe_v1";

        private readonly CancellationTokenSource _cts = new();

        public void Start(Action<string> onCommand)
        {
            var uiSync = SynchronizationContext.Current;
            Task.Run(async () =>
            {
                while (!_cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        using var server = new NamedPipeServerStream(
                            PipeName, PipeDirection.In, 1, PipeTransmissionMode.Message, PipeOptions.Asynchronous);
                        await server.WaitForConnectionAsync(_cts.Token);
                        using var reader = new StreamReader(server);
                        string? cmd = await reader.ReadLineAsync();
                        if (!string.IsNullOrEmpty(cmd))
                        {
                            string trimmed = cmd.Trim();
                            if (uiSync != null) uiSync.Post(_ => onCommand(trimmed), null);
                            else onCommand(trimmed);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch
                    {
                        try { await Task.Delay(200, _cts.Token); } catch { break; }
                    }
                }
            }, _cts.Token);
        }

        public static void SendCommand(string command)
        {
            try
            {
                using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.Out);
                client.Connect(1200);
                using var writer = new StreamWriter(client) { AutoFlush = true };
                writer.WriteLine(command);
            }
            catch
            {
                // Ignore if primary instance is shutting down
            }
        }

        public void Dispose()
        {
            _cts.Cancel();
            _cts.Dispose();
        }
    }
}
