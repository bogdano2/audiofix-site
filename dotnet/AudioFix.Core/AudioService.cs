using System.Runtime.InteropServices;
using AudioFix.Core.Interop;
using AudioFix.Core.Models;

namespace AudioFix.Core;

public sealed class AudioService : IDisposable
{
    private readonly IMMDeviceEnumerator _enumerator;
    private bool _disposed;

    public AudioService()
    {
        var type = Type.GetTypeFromCLSID(ClsIds.MMDeviceEnumerator)
            ?? throw new InvalidOperationException("Could not create MMDeviceEnumerator");
        _enumerator = (IMMDeviceEnumerator)Activator.CreateInstance(type)!;
    }

    public List<AudioDevice> ListDevices(DeviceDirection? direction = null, bool includeDisabled = false)
    {
        var results = new List<AudioDevice>();
        var flows = direction switch
        {
            DeviceDirection.Output => new[] { EDataFlow.Render },
            DeviceDirection.Input => new[] { EDataFlow.Capture },
            null => new[] { EDataFlow.Render, EDataFlow.Capture },
            _ => throw new ArgumentOutOfRangeException(nameof(direction)),
        };

        var stateMask = includeDisabled ? DEVICE_STATE.All : DEVICE_STATE.Active;

        foreach (var flow in flows)
        {
            var dir = flow == EDataFlow.Render ? DeviceDirection.Output : DeviceDirection.Input;
            string? defaultId = GetDefaultDeviceId(flow);

            _enumerator.EnumAudioEndpoints(flow, stateMask, out var collection);
            collection.GetCount(out uint count);

            for (uint i = 0; i < count; i++)
            {
                collection.Item(i, out var device);
                device.GetId(out string id);
                device.GetState(out var state);
                string name = GetDeviceName(device);
                var flags = DetectFlags(name, id);

                results.Add(new AudioDevice(
                    Id: id,
                    Name: name,
                    Direction: dir,
                    State: MapState(state),
                    IsDefault: id == defaultId,
                    Flags: flags
                ));

                Marshal.ReleaseComObject(device);
            }
            Marshal.ReleaseComObject(collection);
        }

        return results;
    }

    public AudioDevice? GetDefault(DeviceDirection direction)
    {
        var flow = direction == DeviceDirection.Output ? EDataFlow.Render : EDataFlow.Capture;
        try
        {
            _enumerator.GetDefaultAudioEndpoint(flow, ERole.Console, out var device);
            device.GetId(out string id);
            device.GetState(out var state);
            string name = GetDeviceName(device);
            var flags = DetectFlags(name, id);
            Marshal.ReleaseComObject(device);

            return new AudioDevice(id, name, direction, MapState(state), true, flags);
        }
        catch (COMException)
        {
            return null;
        }
    }

    public void SetDefault(string deviceId)
    {
        var policyConfig = (IPolicyConfig)new PolicyConfigClient();
        try
        {
            policyConfig.SetDefaultEndpoint(deviceId, ERole.Console);
            policyConfig.SetDefaultEndpoint(deviceId, ERole.Multimedia);
            policyConfig.SetDefaultEndpoint(deviceId, ERole.Communications);
        }
        finally
        {
            Marshal.ReleaseComObject(policyConfig);
        }
    }

    public VolumeInfo GetVolume(DeviceDirection direction)
    {
        var flow = direction == DeviceDirection.Output ? EDataFlow.Render : EDataFlow.Capture;
        _enumerator.GetDefaultAudioEndpoint(flow, ERole.Console, out var device);
        string name = GetDeviceName(device);
        var volume = GetEndpointVolume(device);
        try
        {
            volume.GetMasterVolumeLevelScalar(out float level);
            volume.GetMute(out bool muted);
            return new VolumeInfo((int)(level * 100), muted, name);
        }
        finally
        {
            Marshal.ReleaseComObject(volume);
            Marshal.ReleaseComObject(device);
        }
    }

    public void SetVolume(DeviceDirection direction, int? volume = null, bool? muted = null)
    {
        var flow = direction == DeviceDirection.Output ? EDataFlow.Render : EDataFlow.Capture;
        _enumerator.GetDefaultAudioEndpoint(flow, ERole.Console, out var device);
        var vol = GetEndpointVolume(device);
        var ctx = Guid.Empty;
        try
        {
            if (volume.HasValue)
                vol.SetMasterVolumeLevelScalar(Math.Clamp(volume.Value, 0, 100) / 100f, ref ctx);
            if (muted.HasValue)
                vol.SetMute(muted.Value, ref ctx);
        }
        finally
        {
            Marshal.ReleaseComObject(vol);
            Marshal.ReleaseComObject(device);
        }
    }

    public MicTestResult MonitorMicLevel(string deviceId, int durationSeconds)
    {
        var device = GetDeviceById(deviceId);
        if (device == null)
            return new MicTestResult(0, 0, false);

        var iid = IIds.IAudioMeterInformation;
        device.Activate(ref iid, 0x17 /* CLSCTX_ALL */, IntPtr.Zero, out var obj);
        var meter = (IAudioMeterInformation)obj;

        double peak = 0, sum = 0;
        int samples = 0;
        var end = DateTime.UtcNow.AddSeconds(durationSeconds);

        while (DateTime.UtcNow < end)
        {
            meter.GetPeakValue(out float val);
            if (val > peak) peak = val;
            sum += val;
            samples++;
            Thread.Sleep(100);
        }

        Marshal.ReleaseComObject(meter);
        Marshal.ReleaseComObject(device);

        double avg = samples > 0 ? sum / samples : 0;
        return new MicTestResult(peak, avg, peak > 0.01);
    }

    public void PlayTestTone(int frequencyHz = 660, double durationSeconds = 0.8)
    {
        // Generate WAV in memory, write to temp, play with system
        int sampleRate = 44100;
        int sampleCount = (int)(sampleRate * durationSeconds);
        int dataLen = sampleCount * 2;
        var buf = new byte[44 + dataLen];

        // WAV header
        WriteString(buf, 0, "RIFF");
        WriteInt32LE(buf, 4, dataLen + 36);
        WriteString(buf, 8, "WAVEfmt ");
        WriteInt32LE(buf, 16, 16);
        WriteInt16LE(buf, 20, 1); // PCM
        WriteInt16LE(buf, 22, 1); // Mono
        WriteInt32LE(buf, 24, sampleRate);
        WriteInt32LE(buf, 28, sampleRate * 2);
        WriteInt16LE(buf, 32, 2);
        WriteInt16LE(buf, 34, 16);
        WriteString(buf, 36, "data");
        WriteInt32LE(buf, 40, dataLen);

        for (int i = 0; i < sampleCount; i++)
        {
            double t = (double)i / sampleRate;
            double env = Math.Min(1.0, Math.Min(t / 0.01, (durationSeconds - t) / 0.05));
            short val = (short)(Math.Sin(2.0 * Math.PI * frequencyHz * t) * 20000 * env);
            buf[44 + i * 2] = (byte)(val & 0xFF);
            buf[44 + i * 2 + 1] = (byte)((val >> 8) & 0xFF);
        }

        var tmpPath = Path.Combine(Path.GetTempPath(), "audiofix-tone.wav");
        File.WriteAllBytes(tmpPath, buf);

        try
        {
            using var player = new System.Media.SoundPlayer(tmpPath);
            player.PlaySync();
        }
        finally
        {
            try { File.Delete(tmpPath); } catch { }
        }
    }

    public void SetDeviceEnabled(string deviceId, bool enabled)
    {
        var policyConfig = (IPolicyConfig)new PolicyConfigClient();
        try
        {
            policyConfig.SetEndpointVisibility(deviceId, enabled);
        }
        finally
        {
            Marshal.ReleaseComObject(policyConfig);
        }
    }

    public bool IsElevated()
    {
        using var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
        var principal = new System.Security.Principal.WindowsPrincipal(identity);
        return principal.IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator);
    }

    // --- private helpers ---

    private IMMDevice? GetDeviceById(string deviceId)
    {
        _enumerator.EnumAudioEndpoints(EDataFlow.All, DEVICE_STATE.Active, out var collection);
        collection.GetCount(out uint count);
        for (uint i = 0; i < count; i++)
        {
            collection.Item(i, out var dev);
            dev.GetId(out string id);
            if (id == deviceId)
            {
                Marshal.ReleaseComObject(collection);
                return dev;
            }
            Marshal.ReleaseComObject(dev);
        }
        Marshal.ReleaseComObject(collection);
        return null;
    }

    private string? GetDefaultDeviceId(EDataFlow flow)
    {
        try
        {
            _enumerator.GetDefaultAudioEndpoint(flow, ERole.Console, out var device);
            device.GetId(out string id);
            Marshal.ReleaseComObject(device);
            return id;
        }
        catch (COMException)
        {
            return null;
        }
    }

    private static string GetDeviceName(IMMDevice device)
    {
        try
        {
            device.OpenPropertyStore(0 /* STGM_READ */, out var props);
            var key = PROPERTYKEY.PKEY_Device_FriendlyName;
            props.GetValue(ref key, out var pv);
            Marshal.ReleaseComObject(props);
            if (pv.Data1 != IntPtr.Zero)
                return Marshal.PtrToStringUni(pv.Data1) ?? "Unknown";
        }
        catch { }
        return "Unknown";
    }

    private static IAudioEndpointVolume GetEndpointVolume(IMMDevice device)
    {
        var iid = IIds.IAudioEndpointVolume;
        device.Activate(ref iid, 0x17, IntPtr.Zero, out var obj);
        return (IAudioEndpointVolume)obj;
    }

    private static Models.DeviceState MapState(DEVICE_STATE state) => state switch
    {
        DEVICE_STATE.Active => Models.DeviceState.Active,
        DEVICE_STATE.Disabled => Models.DeviceState.Disabled,
        DEVICE_STATE.Unplugged => Models.DeviceState.Unplugged,
        DEVICE_STATE.NotPresent => Models.DeviceState.NotPresent,
        _ => Models.DeviceState.Active,
    };

    private static DeviceFlags DetectFlags(string name, string id)
    {
        var flags = DeviceFlags.None;
        var lower = $"{name} {id}".ToLowerInvariant();
        if (lower.Contains("stereo mix") || lower.Contains("wave out mix") || lower.Contains("what u hear"))
            flags |= DeviceFlags.StereoMix;
        if (lower.Contains("hdmi") || lower.Contains("displayport"))
            flags |= DeviceFlags.Hdmi;
        if (lower.Contains("spdif") || lower.Contains("s/pdif") || lower.Contains("optical") || lower.Contains("toslink"))
            flags |= DeviceFlags.Spdif;
        if (lower.Contains("usb"))
            flags |= DeviceFlags.Usb;
        if (lower.Contains("bluetooth") || lower.Contains("hands-free"))
            flags |= DeviceFlags.Bluetooth;
        if (lower.Contains("webcam") || lower.Contains("camera"))
            flags |= DeviceFlags.Webcam;
        if (lower.Contains("virtual") || lower.Contains("voicemeeter") || lower.Contains("vb-audio") || lower.Contains("cable"))
            flags |= DeviceFlags.Virtual;
        return flags;
    }

    private static void WriteString(byte[] buf, int offset, string s)
    {
        for (int i = 0; i < s.Length; i++) buf[offset + i] = (byte)s[i];
    }
    private static void WriteInt32LE(byte[] buf, int offset, int v)
    {
        buf[offset] = (byte)v; buf[offset + 1] = (byte)(v >> 8);
        buf[offset + 2] = (byte)(v >> 16); buf[offset + 3] = (byte)(v >> 24);
    }
    private static void WriteInt16LE(byte[] buf, int offset, short v)
    {
        buf[offset] = (byte)v; buf[offset + 1] = (byte)(v >> 8);
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            Marshal.ReleaseComObject(_enumerator);
            _disposed = true;
        }
    }
}
