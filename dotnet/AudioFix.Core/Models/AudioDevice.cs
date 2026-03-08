namespace AudioFix.Core.Models;

public enum DeviceDirection { Output, Input }

public enum DeviceState { Active, Disabled, Unplugged, NotPresent }

[Flags]
public enum DeviceFlags
{
    None = 0,
    StereoMix = 1 << 0,
    Hdmi = 1 << 1,
    Spdif = 1 << 2,
    Virtual = 1 << 3,
    Usb = 1 << 4,
    Bluetooth = 1 << 5,
    Webcam = 1 << 6,
}

public sealed record AudioDevice(
    string Id,
    string Name,
    DeviceDirection Direction,
    DeviceState State,
    bool IsDefault,
    DeviceFlags Flags
);

public sealed record VolumeInfo(
    int Volume,
    bool Muted,
    string DeviceName
);

public sealed record MicTestResult(
    double PeakLevel,
    double AverageLevel,
    bool DetectedActivity
);

public sealed record DiagnosticIssue(
    string Severity, // "error", "warning", "info"
    string Message
);

public sealed record DirectionReport(
    AudioDevice? DefaultDevice,
    AudioDevice[] ActiveDevices,
    AudioDevice[] DisabledDevices,
    int Volume,
    bool Muted,
    DiagnosticIssue[] Issues,
    string[] Recommendations
);

public sealed record DiagnosticReport(
    string Platform,
    DirectionReport Output,
    DirectionReport Input
);
