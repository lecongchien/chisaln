using System;
using System.IO;

namespace Scream.Infrastructure
{
    /// <summary>Thread-safe rotating file logger stored in the application data folder.</summary>
    internal static class AppLog
    {
        private static readonly object Gate = new();
        private static string? _logPath;

        public static void Init(string dataDir)
        {
            Directory.CreateDirectory(dataDir);
            _logPath = Path.Combine(dataDir, "host.log");
            try
            {
                if (File.Exists(_logPath) && new FileInfo(_logPath).Length > 256 * 1024)
                {
                    File.WriteAllText(_logPath, "");
                }
            }
            catch { }
        }

        public static void Write(string message)
        {
            if (string.IsNullOrEmpty(_logPath)) return;
            try
            {
                lock (Gate)
                {
                    File.AppendAllText(_logPath, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff}] {message}{Environment.NewLine}");
                }
            }
            catch { }
        }
    }
}
