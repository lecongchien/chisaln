using System;
using System.Drawing;
using System.Drawing.Drawing2D;

namespace Scream.Presentation
{
    /// <summary>Generates the branded Scream tray and window icon cleanly via GDI+.</summary>
    internal static class AppIconFactory
    {
        public static Icon CreateBrandedIcon()
        {
            using var bmp = new Bitmap(32, 32);
            using (var g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.Transparent);

                using var bgBrush = new LinearGradientBrush(
                    new Rectangle(2, 2, 28, 28),
                    Color.FromArgb(56, 182, 255),
                    Color.FromArgb(0, 112, 224),
                    135f);
                g.FillEllipse(bgBrush, 2, 2, 28, 28);

                using var wavePen = new Pen(Color.FromArgb(230, 255, 255, 255), 2.1f)
                {
                    StartCap = LineCap.Round,
                    EndCap = LineCap.Round
                };
                g.DrawArc(wavePen, 6, 12, 20, 12, 18, 144);

                using var moonBrush = new SolidBrush(Color.FromArgb(245, 255, 255, 255));
                g.FillEllipse(moonBrush, 11, 7, 10, 10);
                using var cutBrush = new SolidBrush(Color.FromArgb(255, 24, 142, 242));
                g.FillEllipse(cutBrush, 14, 6, 8, 8);
            }
            IntPtr hIcon = bmp.GetHicon();
            return Icon.FromHandle(hIcon);
        }
    }
}
