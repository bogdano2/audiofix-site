using AudioFix.Core.Models;

namespace AudioFix.Core;

public static class DiagnosticsEngine
{
    public static DiagnosticReport Run(AudioService audio)
    {
        var outputDevices = audio.ListDevices(DeviceDirection.Output, includeDisabled: true);
        var inputDevices = audio.ListDevices(DeviceDirection.Input, includeDisabled: true);

        VolumeInfo? outputVol = null, inputVol = null;
        try { outputVol = audio.GetVolume(DeviceDirection.Output); } catch { }
        try { inputVol = audio.GetVolume(DeviceDirection.Input); } catch { }

        return new DiagnosticReport(
            Platform: "windows",
            Output: Analyze(outputDevices, outputVol),
            Input: Analyze(inputDevices, inputVol)
        );
    }

    private static DirectionReport Analyze(List<AudioDevice> devices, VolumeInfo? vol)
    {
        var active = devices.Where(d => d.State == DeviceState.Active).ToArray();
        var disabled = devices.Where(d => d.State == DeviceState.Disabled).ToArray();
        var defaultDev = devices.FirstOrDefault(d => d.IsDefault);
        int volume = vol?.Volume ?? 0;
        bool muted = vol?.Muted ?? false;

        var issues = new List<DiagnosticIssue>();
        var recs = new List<string>();

        if (devices.Count == 0)
        {
            issues.Add(new("error", "No audio devices found"));
            recs.Add("Check that audio hardware is connected and drivers are installed");
        }

        if (defaultDev == null && devices.Count > 0)
        {
            issues.Add(new("error", "No default device is set"));
            recs.Add("Set a default audio device");
        }

        if (muted)
        {
            issues.Add(new("warning", "Audio is currently muted"));
            recs.Add("Unmute to restore audio");
        }

        if (volume < 10 && !muted)
        {
            issues.Add(new("warning", $"Volume is very low ({volume}%)"));
            recs.Add("Increase volume to at least 25%");
        }

        if (active.Length > 3)
        {
            issues.Add(new("info", $"{active.Length} active devices detected — this increases the chance of audio switching unexpectedly"));
            recs.Add("Disable unused audio devices to prevent the OS from switching to them automatically");
        }

        var stereoMix = active.FirstOrDefault(d => d.Flags.HasFlag(DeviceFlags.StereoMix));
        if (stereoMix != null)
        {
            issues.Add(new("info", $"Stereo Mix (\"{stereoMix.Name}\") is active — this is rarely needed and can cause confusion"));
            recs.Add("Disable Stereo Mix unless you specifically need it for audio recording/routing");
        }

        if (issues.Count == 0)
        {
            recs.Add("Audio configuration looks healthy — no issues detected");
        }

        return new DirectionReport(defaultDev, active, disabled, volume, muted, issues.ToArray(), recs.ToArray());
    }
}
