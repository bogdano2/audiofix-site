using System.Runtime.InteropServices;

namespace AudioFix.Core.Interop;

// GUIDs for Windows Core Audio COM interfaces
internal static class ClsIds
{
    public static readonly Guid MMDeviceEnumerator = new("BCDE0395-E52F-467C-8E3D-C4579291692E");
}

internal static class IIds
{
    public static readonly Guid IMMDeviceEnumerator = new("A95664D2-9614-4F35-A746-DE8DB63617E6");
    public static readonly Guid IMMDevice = new("D666063F-1587-4E43-81F1-B948E807363F");
    public static readonly Guid IMMDeviceCollection = new("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E");
    public static readonly Guid IAudioEndpointVolume = new("5CDF2C82-841E-4546-9722-0CF74078229A");
    public static readonly Guid IAudioMeterInformation = new("C02216F6-8C67-4B5B-9D00-D008E73E0064");
    public static readonly Guid IPropertyStore = new("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    public static readonly Guid IPolicyConfig = new("F8679F50-850A-41CF-9C72-430F290290C8");
}

internal enum EDataFlow : uint { Render = 0, Capture = 1, All = 2 }
internal enum ERole : uint { Console = 0, Multimedia = 1, Communications = 2 }
internal enum DEVICE_STATE : uint
{
    Active = 0x00000001,
    Disabled = 0x00000002,
    NotPresent = 0x00000004,
    Unplugged = 0x00000008,
    All = 0x0000000F,
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPERTYKEY
{
    public Guid fmtid;
    public uint pid;

    public static readonly PROPERTYKEY PKEY_Device_FriendlyName = new()
    {
        fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),
        pid = 14,
    };

    public static readonly PROPERTYKEY PKEY_DeviceInterface_FriendlyName = new()
    {
        fmtid = new Guid("026E516E-B814-414B-8384-BD8F1E93A76B"),
        pid = 2,
    };

    public static readonly PROPERTYKEY PKEY_Device_DeviceDesc = new()
    {
        fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"),
        pid = 2,
    };
}

[StructLayout(LayoutKind.Sequential)]
internal struct PROPVARIANT
{
    public ushort vt;
    public ushort wReserved1;
    public ushort wReserved2;
    public ushort wReserved3;
    public IntPtr Data1;
    public IntPtr Data2;
}

[ComImport]
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator
{
    int EnumAudioEndpoints(EDataFlow dataFlow, DEVICE_STATE stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
    // remaining methods omitted — not needed
}

[ComImport]
[Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceCollection
{
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
}

[ComImport]
[Guid("D666063F-1587-4E43-81F1-B948E807363F")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice
{
    int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    int OpenPropertyStore(uint stgmAccess, out IPropertyStore properties);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out DEVICE_STATE state);
}

[ComImport]
[Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPropertyStore
{
    int GetCount(out uint count);
    int GetAt(uint index, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT value);
    // SetValue and Commit omitted
}

[ComImport]
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume
{
    // Methods in vtable order — we only need a few but must declare stubs for correct offsets
    int RegisterControlChangeNotify(IntPtr pNotify);
    int UnregisterControlChangeNotify(IntPtr pNotify);
    int GetChannelCount(out uint channelCount);
    int SetMasterVolumeLevel(float levelDB, ref Guid eventContext);
    int SetMasterVolumeLevelScalar(float level, ref Guid eventContext);
    int GetMasterVolumeLevel(out float levelDB);
    int GetMasterVolumeLevelScalar(out float level);
    int SetChannelVolumeLevel(uint channel, float levelDB, ref Guid eventContext);
    int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid eventContext);
    int GetChannelVolumeLevel(uint channel, out float levelDB);
    int GetChannelVolumeLevelScalar(uint channel, out float level);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid eventContext);
    int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
    // remaining methods omitted
}

[ComImport]
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioMeterInformation
{
    int GetPeakValue(out float peak);
    // remaining methods omitted
}

// IPolicyConfig — undocumented but stable since Vista. Used to set default device.
[ComImport]
[Guid("F8679F50-850A-41CF-9C72-430F290290C8")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IPolicyConfig
{
    int GetMixFormat(string deviceId, IntPtr ppFormat);
    int GetDeviceFormat(string deviceId, [MarshalAs(UnmanagedType.Bool)] bool bDefault, IntPtr ppFormat);
    int ResetDeviceFormat(string deviceId);
    int SetDeviceFormat(string deviceId, IntPtr pEndpointFormat, IntPtr pMixFormat);
    int GetProcessingPeriod(string deviceId, [MarshalAs(UnmanagedType.Bool)] bool bDefault, IntPtr defaultPeriod, IntPtr minPeriod);
    int SetProcessingPeriod(string deviceId, IntPtr period);
    int GetShareMode(string deviceId, IntPtr pMode);
    int SetShareMode(string deviceId, IntPtr mode);
    int GetPropertyValue(string deviceId, [MarshalAs(UnmanagedType.Bool)] bool bStore, ref PROPERTYKEY key, out PROPVARIANT value);
    int SetPropertyValue(string deviceId, [MarshalAs(UnmanagedType.Bool)] bool bStore, ref PROPERTYKEY key, ref PROPVARIANT value);
    int SetDefaultEndpoint(string deviceId, ERole role);
    int SetEndpointVisibility(string deviceId, [MarshalAs(UnmanagedType.Bool)] bool visible);
}

// PolicyConfigClient CLSID
[ComImport]
[Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
internal class PolicyConfigClient { }
