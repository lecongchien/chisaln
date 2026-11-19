using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Scream.Infrastructure
{
    /// <summary>
    /// Reads desktop icon bounding rectangles (icon + caption, LVIR_BOUNDS) in physical screen pixels
    /// from Explorer's SysListView32 without reading file names or file contents.
    /// </summary>
    internal sealed class IconReader : IDisposable
    {
        private IntPtr _listView;
        private IntPtr _proc;
        private IntPtr _remoteMem;
        private readonly int _rectSize = Marshal.SizeOf<Native.RECT>();

        public static IntPtr FindDesktopListView()
        {
            IntPtr defView = IntPtr.Zero;
            IntPtr progman = Native.FindWindow("Progman", null);
            if (progman != IntPtr.Zero)
            {
                defView = Native.FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            }

            if (defView == IntPtr.Zero)
            {
                Native.EnumWindows((hWnd, _) =>
                {
                    IntPtr found = Native.FindWindowEx(hWnd, IntPtr.Zero, "SHELLDLL_DefView", null);
                    if (found != IntPtr.Zero)
                    {
                        defView = found;
                        return false;
                    }
                    return true;
                }, IntPtr.Zero);
            }

            return defView == IntPtr.Zero
                ? IntPtr.Zero
                : Native.FindWindowEx(defView, IntPtr.Zero, "SysListView32", null);
        }

        private bool EnsureOpened()
        {
            if (_listView != IntPtr.Zero && _proc != IntPtr.Zero && _remoteMem != IntPtr.Zero && Native.IsWindow(_listView))
            {
                return true;
            }

            Close();
            _listView = FindDesktopListView();
            if (_listView == IntPtr.Zero) return false;

            Native.GetWindowThreadProcessId(_listView, out uint pid);
            if (pid == 0) return false;

            _proc = Native.OpenProcess(
                Native.PROCESS_VM_OPERATION | Native.PROCESS_VM_READ | Native.PROCESS_VM_WRITE,
                false, pid);
            if (_proc == IntPtr.Zero) return false;

            _remoteMem = Native.VirtualAllocEx(
                _proc, IntPtr.Zero, new IntPtr(64),
                Native.MEM_COMMIT | Native.MEM_RESERVE,
                Native.PAGE_READWRITE);

            if (_remoteMem == IntPtr.Zero)
            {
                Close();
                return false;
            }

            return true;
        }

        public List<Native.RECT>? Read(out bool visible)
        {
            visible = false;
            if (!EnsureOpened()) return null;

            visible = Native.IsWindowVisible(_listView);
            var rects = new List<Native.RECT>();
            if (!visible) return rects;

            int count = (int)Native.SendMessage(_listView, Native.LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero);
            if (count <= 0) return rects;
            if (count > 2048) count = 2048; // Defensive upper bound

            var origin = new Native.POINT { X = 0, Y = 0 };
            Native.ClientToScreen(_listView, ref origin);

            for (int i = 0; i < count; i++)
            {
                // Left = 0 => LVIR_BOUNDS (full bounding box covering icon + label text)
                var rect = new Native.RECT { Left = 0, Top = 0, Right = 0, Bottom = 0 };
                if (!Native.WriteProcessMemory(_proc, _remoteMem, ref rect, _rectSize, out _))
                {
                    Close();
                    return null;
                }

                Native.SendMessage(_listView, Native.LVM_GETITEMRECT, new IntPtr(i), _remoteMem);

                if (!Native.ReadProcessMemory(_proc, _remoteMem, out rect, _rectSize, out _))
                {
                    Close();
                    return null;
                }

                rect.Left += origin.X;
                rect.Right += origin.X;
                rect.Top += origin.Y;
                rect.Bottom += origin.Y;

                if (rect.Right > rect.Left && rect.Bottom > rect.Top)
                {
                    rects.Add(rect);
                }
            }

            return rects;
        }

        public void Close()
        {
            if (_remoteMem != IntPtr.Zero && _proc != IntPtr.Zero)
            {
                Native.VirtualFreeEx(_proc, _remoteMem, IntPtr.Zero, Native.MEM_RELEASE);
            }
            if (_proc != IntPtr.Zero)
            {
                Native.CloseHandle(_proc);
            }
            _remoteMem = IntPtr.Zero;
            _proc = IntPtr.Zero;
            _listView = IntPtr.Zero;
        }

        public void Dispose()
        {
            Close();
        }
    }
}
