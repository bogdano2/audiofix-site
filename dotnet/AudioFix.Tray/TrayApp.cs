using System.Runtime.InteropServices;
using AudioFix.Core;
using AudioFix.Core.Models;
using static AudioFix.Tray.NativeMethods;

namespace AudioFix.Tray;

internal sealed class TrayApp : IDisposable
{
    // Menu command IDs
    private const int CMD_MUTE = 1000;
    private const int CMD_TEST_TONE = 1001;
    private const int CMD_DIAGNOSE = 1002;
    private const int CMD_EXIT = 1003;
    private const int CMD_OUTPUT_BASE = 2000; // 2000+ for output devices
    private const int CMD_INPUT_BASE = 3000;  // 3000+ for input devices

    private readonly AudioService _audio;
    private IntPtr _hWnd;
    private NOTIFYICONDATA _nid;
    private WndProc? _wndProcDelegate; // prevent GC
    private bool _disposed;

    // Cached device lists (refreshed on menu open)
    private List<AudioDevice> _outputDevices = [];
    private List<AudioDevice> _inputDevices = [];

    public TrayApp()
    {
        _audio = new AudioService();
    }

    public void Run()
    {
        var hInstance = GetModuleHandleW(IntPtr.Zero);
        _wndProcDelegate = WndProcHandler;

        var wc = new WNDCLASSEX
        {
            cbSize = (uint)Marshal.SizeOf<WNDCLASSEX>(),
            lpfnWndProc = _wndProcDelegate,
            hInstance = hInstance,
            lpszClassName = "AudioFixTray",
        };

        RegisterClassExW(ref wc);

        _hWnd = CreateWindowExW(0, "AudioFixTray", "AudioFix", 0,
            0, 0, 0, 0, IntPtr.Zero, IntPtr.Zero, hInstance, IntPtr.Zero);

        // Add tray icon
        _nid = new NOTIFYICONDATA
        {
            cbSize = (uint)Marshal.SizeOf<NOTIFYICONDATA>(),
            hWnd = _hWnd,
            uID = 1,
            uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP,
            uCallbackMessage = WM_TRAYICON,
            hIcon = LoadIconW(IntPtr.Zero, (IntPtr)IDI_APPLICATION),
            szTip = "AudioFix — Click to manage audio devices",
            szInfo = "",
            szInfoTitle = "",
        };
        Shell_NotifyIconW(NIM_ADD, ref _nid);

        // Show balloon on start if elevated
        if (_audio.IsElevated())
        {
            ShowBalloon("AudioFix", "Running with admin privileges. All features available.");
        }

        // Message loop
        while (GetMessageW(out var msg, IntPtr.Zero, 0, 0))
        {
            TranslateMessage(ref msg);
            DispatchMessageW(ref msg);
        }
    }

    private IntPtr WndProcHandler(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam)
    {
        switch (msg)
        {
            case WM_TRAYICON:
                int eventId = (int)lParam & 0xFFFF;
                if (eventId == WM_RBUTTONUP)
                    ShowContextMenu();
                else if (eventId == WM_LBUTTONDBLCLK)
                    RunDiagnostics();
                return IntPtr.Zero;

            case WM_COMMAND:
                HandleCommand((int)(wParam & 0xFFFF));
                return IntPtr.Zero;

            case WM_DESTROY:
                Shell_NotifyIconW(NIM_DELETE, ref _nid);
                PostQuitMessage(0);
                return IntPtr.Zero;
        }

        return DefWindowProcW(hWnd, msg, wParam, lParam);
    }

    private void ShowContextMenu()
    {
        // Refresh device lists
        try
        {
            _outputDevices = _audio.ListDevices(DeviceDirection.Output, includeDisabled: false);
            _inputDevices = _audio.ListDevices(DeviceDirection.Input, includeDisabled: false);
        }
        catch { }

        var hMenu = CreatePopupMenu();

        // Output devices submenu
        var hOutputMenu = CreatePopupMenu();
        for (int i = 0; i < _outputDevices.Count && i < 50; i++)
        {
            var dev = _outputDevices[i];
            uint flags = MF_STRING;
            if (dev.IsDefault) flags |= MF_CHECKED;
            AppendMenuW(hOutputMenu, flags, (nuint)(CMD_OUTPUT_BASE + i), dev.Name);
        }
        if (_outputDevices.Count == 0)
            AppendMenuW(hOutputMenu, MF_STRING | MF_GRAYED, 0, "(no devices)");
        AppendMenuW(hMenu, MF_POPUP, (nuint)hOutputMenu, "Output Device");

        // Input devices submenu
        var hInputMenu = CreatePopupMenu();
        for (int i = 0; i < _inputDevices.Count && i < 50; i++)
        {
            var dev = _inputDevices[i];
            uint flags = MF_STRING;
            if (dev.IsDefault) flags |= MF_CHECKED;
            AppendMenuW(hInputMenu, flags, (nuint)(CMD_INPUT_BASE + i), dev.Name);
        }
        if (_inputDevices.Count == 0)
            AppendMenuW(hInputMenu, MF_STRING | MF_GRAYED, 0, "(no devices)");
        AppendMenuW(hMenu, MF_POPUP, (nuint)hInputMenu, "Input Device");

        AppendMenuW(hMenu, MF_SEPARATOR, 0, null);

        // Volume info
        try
        {
            var vol = _audio.GetVolume(DeviceDirection.Output);
            string volText = $"Volume: {vol.Volume}%{(vol.Muted ? " (MUTED)" : "")}";
            AppendMenuW(hMenu, MF_STRING | MF_GRAYED, 0, volText);
        }
        catch { }

        AppendMenuW(hMenu, MF_STRING, (nuint)CMD_MUTE, "Mute / Unmute");
        AppendMenuW(hMenu, MF_STRING, (nuint)CMD_TEST_TONE, "Play Test Tone");

        AppendMenuW(hMenu, MF_SEPARATOR, 0, null);
        AppendMenuW(hMenu, MF_STRING, (nuint)CMD_DIAGNOSE, "Run Diagnostics...");

        AppendMenuW(hMenu, MF_SEPARATOR, 0, null);

        string elevated = _audio.IsElevated() ? "Elevated: Yes" : "Elevated: No (some features limited)";
        AppendMenuW(hMenu, MF_STRING | MF_GRAYED, 0, elevated);

        AppendMenuW(hMenu, MF_SEPARATOR, 0, null);
        AppendMenuW(hMenu, MF_STRING, (nuint)CMD_EXIT, "Exit");

        // Show menu at cursor
        GetCursorPos(out var pt);
        SetForegroundWindow(_hWnd);
        int cmd = TrackPopupMenu(hMenu, TPM_RIGHTBUTTON | TPM_RETURNCMD, pt.X, pt.Y, 0, _hWnd, IntPtr.Zero);
        if (cmd > 0) HandleCommand(cmd);

        DestroyMenu(hMenu);
    }

    private void HandleCommand(int cmdId)
    {
        try
        {
            if (cmdId == CMD_EXIT)
            {
                DestroyWindow(_hWnd);
                return;
            }

            if (cmdId == CMD_MUTE)
            {
                var vol = _audio.GetVolume(DeviceDirection.Output);
                _audio.SetVolume(DeviceDirection.Output, muted: !vol.Muted);
                ShowBalloon("AudioFix", vol.Muted ? "Unmuted" : "Muted");
                return;
            }

            if (cmdId == CMD_TEST_TONE)
            {
                Task.Run(() =>
                {
                    try { _audio.PlayTestTone(); }
                    catch { ShowBalloon("AudioFix", "Failed to play test tone"); }
                });
                return;
            }

            if (cmdId == CMD_DIAGNOSE)
            {
                RunDiagnostics();
                return;
            }

            // Output device selection
            if (cmdId >= CMD_OUTPUT_BASE && cmdId < CMD_OUTPUT_BASE + _outputDevices.Count)
            {
                var dev = _outputDevices[cmdId - CMD_OUTPUT_BASE];
                _audio.SetDefault(dev.Id);
                ShowBalloon("AudioFix", $"Default output set to {dev.Name}");
                return;
            }

            // Input device selection
            if (cmdId >= CMD_INPUT_BASE && cmdId < CMD_INPUT_BASE + _inputDevices.Count)
            {
                var dev = _inputDevices[cmdId - CMD_INPUT_BASE];
                _audio.SetDefault(dev.Id);
                ShowBalloon("AudioFix", $"Default input set to {dev.Name}");
                return;
            }
        }
        catch (Exception ex)
        {
            ShowBalloon("AudioFix — Error", ex.Message);
        }
    }

    private void RunDiagnostics()
    {
        try
        {
            var report = DiagnosticsEngine.Run(_audio);
            var lines = new List<string>();

            lines.Add("═══ OUTPUT ═══");
            FormatDirection(lines, report.Output);
            lines.Add("");
            lines.Add("═══ INPUT ═══");
            FormatDirection(lines, report.Input);

            NativeMethods.MessageBoxW(IntPtr.Zero, string.Join("\n", lines), "AudioFix — Diagnostics", 0x40 /* MB_ICONINFORMATION */);
        }
        catch (Exception ex)
        {
            NativeMethods.MessageBoxW(IntPtr.Zero, $"Error: {ex.Message}", "AudioFix", 0x10 /* MB_ICONERROR */);
        }
    }

    private static void FormatDirection(List<string> lines, DirectionReport report)
    {
        lines.Add($"Default: {report.DefaultDevice?.Name ?? "(none)"}");
        lines.Add($"Volume: {report.Volume}%{(report.Muted ? " (MUTED)" : "")}");
        lines.Add($"Active devices: {report.ActiveDevices.Length}");

        foreach (var issue in report.Issues)
            lines.Add($"  [{issue.Severity.ToUpper()}] {issue.Message}");

        foreach (var rec in report.Recommendations)
            lines.Add($"  → {rec}");
    }

    private void ShowBalloon(string title, string text)
    {
        _nid.uFlags = NIF_INFO;
        _nid.szInfoTitle = title;
        _nid.szInfo = text;
        _nid.dwInfoFlags = 1; // NIIF_INFO
        Shell_NotifyIconW(NIM_MODIFY, ref _nid);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            Shell_NotifyIconW(NIM_DELETE, ref _nid);
            _audio.Dispose();
            _disposed = true;
        }
    }
}
