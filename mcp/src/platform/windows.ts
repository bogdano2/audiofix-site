import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AudioPlatform } from "./base.js";
import {
  AudioDevice,
  DeviceDirection,
  DeviceFlag,
  DeviceState,
  MicTestResult,
  PlatformCapabilities,
  VolumeInfo,
} from "./types.js";

const exec = promisify(execFile);
const TIMEOUT = 20000;

// The C# interop code from Win11_Audio_Troubleshooter.ps1 — provides direct
// access to Windows Core Audio COM interfaces (IMMDeviceEnumerator, IPolicyConfig,
// IAudioMeterInformation) without any external dependencies.
const CSHARP_INTEROP = `
using System;
using System.Runtime.InteropServices;

namespace AudioHelper
{
    public enum EDataFlow : uint { eRender = 0, eCapture = 1, eAll = 2 }
    public enum ERole : uint { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
    public enum DEVICE_STATE : uint {
        ACTIVE = 0x00000001, DISABLED = 0x00000002, NOTPRESENT = 0x00000004, UNPLUGGED = 0x00000008,
        ALL = 0x0000000F
    }
    public enum STGM : uint { READ = 0x00000000 }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY {
        public Guid fmtid;
        public uint pid;
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(STGM stgmAccess, out IPropertyStore ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out uint pdwState);
    }

    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection {
        int GetCount(out uint pcDevices);
        int Item(uint nDevice, out IMMDevice ppDevice);
    }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
    }

    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        int GetCount(out uint cProps);
        int GetAt(uint iProp, out PROPERTYKEY pkey);
        int GetValue(ref PROPERTYKEY key, out PropVariant pv);
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PropVariant {
        public ushort vt;
        public ushort wReserved1, wReserved2, wReserved3;
        public IntPtr p1;
        public IntPtr p2;
        public override string ToString() {
            if (vt == 31) return Marshal.PtrToStringUni(p1);
            return "(non-string)";
        }
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioMeterInformation {
        int GetPeakValue(out float pfPeak);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioEndpointVolume {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out uint pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, IntPtr pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, IntPtr pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, IntPtr pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, IntPtr pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, IntPtr pguidEventContext);
        int GetMute([MarshalAs(UnmanagedType.Bool)] out bool pbMute);
        int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
        int VolumeStepUp(IntPtr pguidEventContext);
        int VolumeStepDown(IntPtr pguidEventContext);
        int QueryHardwareSupport(out uint pdwHardwareSupportMask);
        int GetVolumeRange(out float pflVolumeMindB, out float pflVolumeMaxdB, out float pflVolumeIncrementdB);
    }

    [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig {
        int GetMixFormat(); int GetDeviceFormat(); int ResetDeviceFormat(); int SetDeviceFormat();
        int GetProcessingPeriod(); int SetProcessingPeriod(); int GetShareMode(); int SetShareMode();
        int GetPropertyValue(); int SetPropertyValue();
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, ERole eRole);
    }

    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumerator { }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    public class PolicyConfigClient { }

    public static class AudioApi
    {
        private static readonly Guid IID_IAudioMeterInformation = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");
        private static readonly Guid IID_IAudioEndpointVolume = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");

        public static PROPERTYKEY PKEY_Device_FriendlyName = new PROPERTYKEY {
            fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14
        };

        public static IMMDeviceEnumerator GetEnumerator() {
            return (IMMDeviceEnumerator)(new MMDeviceEnumerator());
        }

        public static string GetDeviceName(IMMDevice device) {
            IPropertyStore store;
            device.OpenPropertyStore(STGM.READ, out store);
            var key = PKEY_Device_FriendlyName;
            PropVariant pv;
            store.GetValue(ref key, out pv);
            return pv.ToString();
        }

        public static string GetDeviceId(IMMDevice device) {
            string id;
            device.GetId(out id);
            return id;
        }

        public static uint GetDeviceState(IMMDevice device) {
            uint state;
            device.GetState(out state);
            return state;
        }

        public static float GetPeakLevel(IMMDevice device) {
            try {
                object activated;
                device.Activate(IID_IAudioMeterInformation, 0x17, IntPtr.Zero, out activated);
                var meter = (IAudioMeterInformation)activated;
                float peak;
                meter.GetPeakValue(out peak);
                return peak;
            } catch { return -1f; }
        }

        public static float GetVolume(IMMDevice device) {
            try {
                object activated;
                device.Activate(IID_IAudioEndpointVolume, 0x17, IntPtr.Zero, out activated);
                var vol = (IAudioEndpointVolume)activated;
                float level;
                vol.GetMasterVolumeLevelScalar(out level);
                return level;
            } catch { return -1f; }
        }

        public static bool GetMute(IMMDevice device) {
            try {
                object activated;
                device.Activate(IID_IAudioEndpointVolume, 0x17, IntPtr.Zero, out activated);
                var vol = (IAudioEndpointVolume)activated;
                bool muted;
                vol.GetMute(out muted);
                return muted;
            } catch { return false; }
        }

        public static void SetVolume(IMMDevice device, float level) {
            object activated;
            device.Activate(IID_IAudioEndpointVolume, 0x17, IntPtr.Zero, out activated);
            var vol = (IAudioEndpointVolume)activated;
            vol.SetMasterVolumeLevelScalar(level, IntPtr.Zero);
        }

        public static void SetMute(IMMDevice device, bool muted) {
            object activated;
            device.Activate(IID_IAudioEndpointVolume, 0x17, IntPtr.Zero, out activated);
            var vol = (IAudioEndpointVolume)activated;
            vol.SetMute(muted, IntPtr.Zero);
        }

        public static void SetDefaultDevice(string deviceId) {
            var policy = (IPolicyConfig)(new PolicyConfigClient());
            policy.SetDefaultEndpoint(deviceId, ERole.eConsole);
            policy.SetDefaultEndpoint(deviceId, ERole.eMultimedia);
            policy.SetDefaultEndpoint(deviceId, ERole.eCommunications);
        }
    }
}
`;

const ADD_TYPE = `
try { Add-Type -TypeDefinition @'
${CSHARP_INTEROP}
'@ -ErrorAction Stop } catch { if ($_.Exception.Message -notlike "*already exists*") { throw } }
`;

function detectFlags(name: string): DeviceFlag[] {
  const flags: DeviceFlag[] = [];
  if (/stereo mix/i.test(name)) flags.push("stereo-mix");
  if (/hdmi|display audio|nvidia high definition/i.test(name)) flags.push("hdmi");
  if (/s\/pdif|digital audio/i.test(name)) flags.push("spdif");
  if (/usb pnp/i.test(name)) flags.push("usb");
  if (/bluetooth/i.test(name)) flags.push("bluetooth");
  if (/webcam|camera/i.test(name)) flags.push("webcam");
  return flags;
}

function parseState(state: number): DeviceState {
  if (state === 1) return "active";
  if (state === 2) return "disabled";
  if (state === 8) return "unplugged";
  return "not_present";
}

async function runPS(script: string): Promise<string> {
  const { stdout } = await exec(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
    { timeout: TIMEOUT }
  );
  return stdout.trim();
}

export class WindowsAudioPlatform extends AudioPlatform {
  readonly name = "windows";
  readonly capabilities: PlatformCapabilities = {
    canDisableDevices: true,
    canSetDefaultByRole: true,
    canPlayTestTone: true,
    canMonitorMicLevel: true,
    canControlVolume: true,
  };

  async listDevices(
    direction: DeviceDirection | "all",
    includeDisabled: boolean
  ): Promise<AudioDevice[]> {
    const stateMask = includeDisabled ? "0x0F" : "0x01";
    const flows =
      direction === "all"
        ? ["eRender", "eCapture"]
        : direction === "output"
        ? ["eRender"]
        : ["eCapture"];

    const script = `
${ADD_TYPE}
$enum = [AudioHelper.AudioApi]::GetEnumerator()
$results = @()
$defaultOut = $null; $defaultIn = $null
try { $d = $null; $enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::eRender, [AudioHelper.ERole]::eConsole, [ref]$d) | Out-Null; if ($d) { $defaultOut = [AudioHelper.AudioApi]::GetDeviceId($d) } } catch {}
try { $d = $null; $enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::eCapture, [AudioHelper.ERole]::eConsole, [ref]$d) | Out-Null; if ($d) { $defaultIn = [AudioHelper.AudioApi]::GetDeviceId($d) } } catch {}
${flows
  .map(
    (flow) => `
$col = $null
$enum.EnumAudioEndpoints([AudioHelper.EDataFlow]::${flow}, ${stateMask}, [ref]$col) | Out-Null
if ($col) {
  $count = 0; $col.GetCount([ref]$count) | Out-Null
  for ($i = 0; $i -lt $count; $i++) {
    $dev = $null; $col.Item($i, [ref]$dev) | Out-Null
    if ($dev) {
      $id = [AudioHelper.AudioApi]::GetDeviceId($dev)
      $name = [AudioHelper.AudioApi]::GetDeviceName($dev)
      $state = [AudioHelper.AudioApi]::GetDeviceState($dev)
      $dir = if ("${flow}" -eq "eRender") { "output" } else { "input" }
      $isDef = if ($dir -eq "output") { $id -eq $defaultOut } else { $id -eq $defaultIn }
      $results += @{ id=$id; name=$name; state=[int]$state; direction=$dir; isDefault=$isDef }
    }
  }
}
`
  )
  .join("\n")}
$results | ConvertTo-Json -Compress
`;

    const output = await runPS(script);
    if (!output || output === "null") return [];

    const raw = JSON.parse(output);
    const items = Array.isArray(raw) ? raw : [raw];

    return items.map((d: any) => ({
      id: d.id,
      name: d.name,
      direction: d.direction as DeviceDirection,
      state: parseState(d.state),
      isDefault: d.isDefault,
      flags: detectFlags(d.name),
    }));
  }

  async getDefault(direction: DeviceDirection): Promise<AudioDevice | null> {
    const devices = await this.listDevices(direction, false);
    return devices.find((d) => d.isDefault) ?? null;
  }

  async setDefault(deviceId: string): Promise<void> {
    const script = `
${ADD_TYPE}
[AudioHelper.AudioApi]::SetDefaultDevice($env:AUDIOFIX_DEVICE_ID)
`;
    await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: TIMEOUT, env: { ...process.env, AUDIOFIX_DEVICE_ID: deviceId } }
    );
  }

  async playTestTone(deviceId: string): Promise<void> {
    // Temporarily switch default, play 660Hz tone, restore original
    const script = `
${ADD_TYPE}
$enum = [AudioHelper.AudioApi]::GetEnumerator()
$origDev = $null
try { $enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::eRender, [AudioHelper.ERole]::eConsole, [ref]$origDev) | Out-Null } catch {}
$origId = if ($origDev) { [AudioHelper.AudioApi]::GetDeviceId($origDev) } else { $null }

$targetId = $env:AUDIOFIX_DEVICE_ID
[AudioHelper.AudioApi]::SetDefaultDevice($targetId)
Start-Sleep -Milliseconds 200

# Generate and play 660Hz tone
$sr = 44100; $dur = 0.8; $freq = 660; $samples = [int]($sr * $dur)
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$dataLen = $samples * 2
$bw.Write([byte[]]@(0x52,0x49,0x46,0x46)); $bw.Write([int]($dataLen+36))
$bw.Write([byte[]]@(0x57,0x41,0x56,0x45,0x66,0x6D,0x74,0x20))
$bw.Write([int]16); $bw.Write([short]1); $bw.Write([short]1)
$bw.Write([int]$sr); $bw.Write([int]($sr*2)); $bw.Write([short]2); $bw.Write([short]16)
$bw.Write([byte[]]@(0x64,0x61,0x74,0x61)); $bw.Write([int]$dataLen)
for ($i = 0; $i -lt $samples; $i++) {
  $t = $i / $sr
  $env = [Math]::Min(1, [Math]::Min($t / 0.01, ($dur - $t) / 0.05))
  $val = [int]([Math]::Sin(2 * [Math]::PI * $freq * $t) * 20000 * $env)
  $bw.Write([short]$val)
}
$ms.Position = 0
$player = New-Object System.Media.SoundPlayer($ms)
$player.PlaySync()
$player.Dispose(); $bw.Dispose(); $ms.Dispose()

if ($origId -and ($origId -ne $targetId)) {
  [AudioHelper.AudioApi]::SetDefaultDevice($origId)
}
`;
    await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: TIMEOUT, env: { ...process.env, AUDIOFIX_DEVICE_ID: deviceId } }
    );
  }

  async monitorMicLevel(
    deviceId: string,
    durationSeconds: number
  ): Promise<MicTestResult> {
    const script = `
${ADD_TYPE}
$enum = [AudioHelper.AudioApi]::GetEnumerator()
$origDev = $null
try { $enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::eCapture, [AudioHelper.ERole]::eConsole, [ref]$origDev) | Out-Null } catch {}
$origId = if ($origDev) { [AudioHelper.AudioApi]::GetDeviceId($origDev) } else { $null }

$targetId = $env:AUDIOFIX_DEVICE_ID
[AudioHelper.AudioApi]::SetDefaultDevice($targetId)
Start-Sleep -Milliseconds 200

# Find the target device and poll its meter
$col = $null
$enum.EnumAudioEndpoints([AudioHelper.EDataFlow]::eCapture, 0x01, [ref]$col) | Out-Null
$targetDev = $null
$count = 0; $col.GetCount([ref]$count) | Out-Null
for ($i = 0; $i -lt $count; $i++) {
  $dev = $null; $col.Item($i, [ref]$dev) | Out-Null
  if ($dev -and ([AudioHelper.AudioApi]::GetDeviceId($dev) -eq $targetId)) { $targetDev = $dev; break }
}

$peak = 0.0; $sum = 0.0; $readings = 0
if ($targetDev) {
  $duration = [int]$env:AUDIOFIX_DURATION
  $end = (Get-Date).AddSeconds($duration)
  while ((Get-Date) -lt $end) {
    $level = [AudioHelper.AudioApi]::GetPeakLevel($targetDev)
    if ($level -ge 0) {
      if ($level -gt $peak) { $peak = $level }
      $sum += $level
      $readings++
    }
    Start-Sleep -Milliseconds 100
  }
}

if ($origId -and ($origId -ne $targetId)) {
  [AudioHelper.AudioApi]::SetDefaultDevice($origId)
}

$avg = if ($readings -gt 0) { $sum / $readings } else { 0 }
@{ peak=$peak; average=$avg; readings=$readings } | ConvertTo-Json -Compress
`;
    const { stdout } = await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        timeout: (durationSeconds + 10) * 1000,
        env: {
          ...process.env,
          AUDIOFIX_DEVICE_ID: deviceId,
          AUDIOFIX_DURATION: String(durationSeconds),
        },
      }
    );

    const result = JSON.parse(stdout.trim());
    return {
      peakLevel: result.peak,
      averageLevel: result.average,
      detectedActivity: result.peak > 0.01,
    };
  }

  async getVolume(direction: DeviceDirection): Promise<VolumeInfo> {
    const flow = direction === "output" ? "eRender" : "eCapture";
    const script = `
${ADD_TYPE}
$enum = [AudioHelper.AudioApi]::GetEnumerator()
$dev = $null
$enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::${flow}, [AudioHelper.ERole]::eConsole, [ref]$dev) | Out-Null
if ($dev) {
  $name = [AudioHelper.AudioApi]::GetDeviceName($dev)
  $vol = [AudioHelper.AudioApi]::GetVolume($dev)
  $muted = [AudioHelper.AudioApi]::GetMute($dev)
  @{ volume=[int]($vol * 100); muted=$muted; deviceName=$name } | ConvertTo-Json -Compress
} else {
  @{ volume=0; muted=$false; deviceName="(none)" } | ConvertTo-Json -Compress
}
`;
    const output = await runPS(script);
    return JSON.parse(output);
  }

  async setVolume(
    direction: DeviceDirection,
    volume?: number,
    muted?: boolean
  ): Promise<void> {
    const flow = direction === "output" ? "eRender" : "eCapture";
    const setVol = volume !== undefined ? `[AudioHelper.AudioApi]::SetVolume($dev, ${volume / 100})` : "";
    const setMute = muted !== undefined ? `[AudioHelper.AudioApi]::SetMute($dev, $${muted})` : "";

    const script = `
${ADD_TYPE}
$enum = [AudioHelper.AudioApi]::GetEnumerator()
$dev = $null
$enum.GetDefaultAudioEndpoint([AudioHelper.EDataFlow]::${flow}, [AudioHelper.ERole]::eConsole, [ref]$dev) | Out-Null
if ($dev) {
  ${setVol}
  ${setMute}
}
`;
    await runPS(script);
  }

  async enableDevice(deviceId: string): Promise<void> {
    const script = `
$pnp = Get-PnpDevice -Class AudioEndpoint -Status Error, Degraded, Unknown -ErrorAction SilentlyContinue |
  Where-Object { $_.FriendlyName -and $_.Status -ne 'OK' }
$match = $pnp | Where-Object { $_.InstanceId -eq $env:AUDIOFIX_DEVICE_ID -or $_.FriendlyName -like "*$($env:AUDIOFIX_DEVICE_ID)*" } | Select-Object -First 1
if ($match) {
  Enable-PnpDevice -InstanceId $match.InstanceId -Confirm:$false
  "Enabled: $($match.FriendlyName)"
} else {
  "Error: Device not found or already enabled"
}
`;
    const output = await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: TIMEOUT, env: { ...process.env, AUDIOFIX_DEVICE_ID: deviceId } }
    );
    if (output.stdout.includes("Error:")) {
      throw new Error(output.stdout.trim());
    }
  }

  async disableDevice(deviceId: string): Promise<void> {
    const script = `
$pnp = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue
$match = $pnp | Where-Object { $_.InstanceId -eq $env:AUDIOFIX_DEVICE_ID -or $_.FriendlyName -like "*$($env:AUDIOFIX_DEVICE_ID)*" } | Select-Object -First 1
if ($match) {
  Disable-PnpDevice -InstanceId $match.InstanceId -Confirm:$false
  "Disabled: $($match.FriendlyName)"
} else {
  "Error: Device not found or already disabled"
}
`;
    const output = await exec(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: TIMEOUT, env: { ...process.env, AUDIOFIX_DEVICE_ID: deviceId } }
    );
    if (output.stdout.includes("Error:")) {
      throw new Error(output.stdout.trim());
    }
  }
}
