using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using Scream.Application;
using Scream.Infrastructure;

namespace Scream
{
    /// <summary>Composition root & CLI entrypoint (--autostart, --settings, --menu, --exit).</summary>
    internal static class Program
    {
        private const string MutexName = "Global\\ScreamWallpaper_SingleInstance_v1";

        [STAThread]
        private static void Main(string[] args)
        {
            bool hasExit = Array.IndexOf(args, "--exit") >= 0;
            bool hasMenu = Array.IndexOf(args, "--menu") >= 0;
            bool hasSettings = Array.IndexOf(args, "--settings") >= 0;
            bool isAutostart = Array.IndexOf(args, "--autostart") >= 0;

            using var mutex = new Mutex(true, MutexName, out bool isFirstInstance);
            if (!isFirstInstance)
            {
                string cmd = hasExit ? "--exit" : hasMenu ? "--menu" : "--settings";
                IpcCommandServer.SendCommand(cmd);
                return;
            }

            if (hasExit) return;

            System.Windows.Forms.Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            System.Windows.Forms.Application.EnableVisualStyles();
            System.Windows.Forms.Application.SetCompatibleTextRenderingDefault(false);

            string webDir = ResolveWebDir();
            if (!Directory.Exists(webDir))
            {
                MessageBox.Show(
                    "Không tìm thấy thư mục giao diện web:\n" + webDir,
                    "Scream", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            ISettingsRepository store = new SettingsRepository(webDir);
            bool openSettings = hasSettings || !isAutostart;
            System.Windows.Forms.Application.Run(new WallpaperCoordinator(store, openSettings));
        }

        private static string ResolveWebDir()
        {
            string baseDir = AppContext.BaseDirectory;
            string direct = Path.Combine(baseDir, "web");
            if (Directory.Exists(direct)) return direct;

            string? dir = baseDir;
            for (int i = 0; i < 5 && dir != null; i++)
            {
                string candidate = Path.Combine(dir, "web");
                if (Directory.Exists(candidate)) return candidate;
                dir = Directory.GetParent(dir)?.FullName;
            }
            return direct;
        }
    }
}
