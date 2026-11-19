using System;
using System.Collections.Generic;
using System.Windows.Forms;

namespace Scream.Infrastructure
{
    /// <summary>Win32 global hotkey receiver supporting multiple registered shortcuts.</summary>
    internal sealed class GlobalHotkeyManager : NativeWindow, IDisposable
    {
        private readonly Dictionary<int, Action> _handlers = new();

        public GlobalHotkeyManager()
        {
            CreateHandle(new CreateParams());
        }

        public bool Register(int id, uint modifiers, Keys key, Action onPressed)
        {
            if (_handlers.ContainsKey(id)) return true;
            if (Native.RegisterHotKey(Handle, id, modifiers, (uint)key))
            {
                _handlers[id] = onPressed;
                return true;
            }
            return false;
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == Native.WM_HOTKEY && _handlers.TryGetValue(m.WParam.ToInt32(), out var cb))
            {
                cb();
                return;
            }
            base.WndProc(ref m);
        }

        public void Dispose()
        {
            foreach (int id in _handlers.Keys)
            {
                Native.UnregisterHotKey(Handle, id);
            }
            _handlers.Clear();
            if (Handle != IntPtr.Zero)
            {
                DestroyHandle();
            }
        }
    }
}
