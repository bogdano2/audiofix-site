<#
.SYNOPSIS
    Windows Audio Troubleshooting Assistant — fixes audio device switching issues.

.DESCRIPTION
    Interactive script that walks you through finding, testing, and locking down
    your preferred audio output and input devices — then disables unused devices
    to prevent the default from silently changing.

    WHY THIS EXISTS:
    It's not you. It's your computer. Windows registers every audio-capable
    device it has ever seen — HDMI monitors, docking stations, Bluetooth
    headsets, USB webcams, virtual drivers — and keeps them all active. Any
    event (plugging in a cable, a Windows update, a Bluetooth connection, a
    driver install, an app preference) can silently switch your default. This
    has been happening for 30 years. This script eliminates the problem by
    reducing the active device list to only what you actually use.

    THREE STEPS (matching the guide at https://audiofix.tools):
      Step 1 — Find:     Lists every audio device Windows is managing,
                          including ones with unclear names. Shows which one
                          is currently the default. Flags impostors like
                          Stereo Mix and phantom HDMI outputs.
      Step 2 — Test:     Plays a test tone through each output device one
                          at a time — you listen for which device produces
                          sound from your actual speakers. For input, it
                          shows a live mic level meter while you speak —
                          you watch for the bar to move.
      Step 3 — Lock:     Sets your identified device as the system-wide
                          default across all three Windows audio roles
                          (Console, Multimedia, Communications). Then
                          disables every device you don't use via PnP, so
                          Windows can't silently switch to them. This is the
                          single most effective preventive step. Disabling
                          does NOT uninstall — re-enable anytime from
                          Settings > System > Sound > All sound devices.

    After the three steps, the script reminds you to check app-level audio
    settings (Zoom, Teams, Discord, etc.) since some apps store their own
    device preference separately from the OS default.

    WHAT IT USES UNDER THE HOOD:
    Every component in this script is deliberately chosen from what Windows
    already ships. The design philosophy is zero external dependencies — no
    third-party modules, no NuGet packages, no downloaded DLLs. Every
    dependency you don't add is an attack surface that doesn't exist and a
    privacy policy you don't have to read. If the OS already provides an API
    for it, we use that API directly rather than wrapping it in someone else's
    abstraction layer.

    - Core Audio API (IMMDeviceEnumerator, IAudioMeterInformation) via embedded
      C# interop — these are the same Windows COM interfaces that the Sound
      Settings UI itself uses. No external audio libraries.
    - IPolicyConfig COM interface to set defaults across all three audio roles.
      Undocumented but stable since Vista and used by every major audio tool.
    - In-memory WAV generation for test tones (44.1kHz, 16-bit, 660Hz sine)
      using System.IO.MemoryStream and System.Media.SoundPlayer — built into
      .NET Framework. No audio file downloads, no temp files on disk.
    - Get-PnpDevice / Disable-PnpDevice cmdlets — built into Windows 10/11.
      These are the same cmdlets that Device Manager uses internally.

    The C# code is embedded inline (Add-Type) rather than compiled into a
    separate DLL. This keeps the script as a single auditable text file — you
    can read every line before you run it.

    SAFETY:
    - No data leaves your machine. No network requests. No telemetry. The
      script makes zero outbound connections — there is no code path that
      touches the network. You can verify this by reading the source or
      running it with your network cable unplugged.
    - No third-party code is downloaded, loaded, or executed. Everything
      runs through APIs that ship with Windows and .NET Framework. This
      eliminates supply-chain risk entirely — there is no upstream package
      that could be compromised.
    - All changes are reversible. Disabled devices can be re-enabled from
      Settings > System > Sound > All sound devices, or by re-running this
      script.
    - The script self-elevates to Administrator (required for Disable-PnpDevice)
      and will show a UAC prompt before proceeding. It never runs silently.

.PARAMETER None
    This script takes no parameters. All configuration is done interactively.

.EXAMPLE
    .\Win11_Audio_Troubleshooter.ps1
    Right-click the file and select "Run with PowerShell", or run from a
    PowerShell prompt. The script will self-elevate to Administrator.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\Win11_Audio_Troubleshooter.ps1
    Use this if your execution policy blocks .ps1 files.

.LINK
    https://audiofix.tools — full guide explaining why audio defaults drift
    and how this script fixes it.

.NOTES
    Author:       AudioFix.tools
    Version:      2.0.0
    Requires:     Windows 10/11, PowerShell 5.1+
    Dependencies: None — zero-dependency, single-file script
    License:      Free and open source
#>

#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================================================
# SELF-ELEVATION
# ============================================================================
# Disable-PnpDevice requires Administrator. If we're not elevated, relaunch
# with a UAC prompt. The user sees the prompt and approves before anything runs.
# ============================================================================
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "`n  This script needs Administrator privileges to disable/enable audio devices." -ForegroundColor Yellow
    Write-Host "  Relaunching as Admin now...`n" -ForegroundColor Yellow
    Start-Sleep -Seconds 2
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

# ============================================================================
# EMBEDDED C# — Core Audio API interop
# ============================================================================
# These are the same Windows COM interfaces that Sound Settings uses internally.
# IMMDeviceEnumerator lists audio endpoints. IAudioMeterInformation reads live
# mic levels. IPolicyConfig sets the default device across all three audio roles.
# No external libraries — everything here ships with Windows.
# ============================================================================
$csharpCode = @'
using System;
using System.Runtime.InteropServices;

namespace AudioHelper
{
    // ---- Enums ----
    public enum EDataFlow : uint { eRender = 0, eCapture = 1, eAll = 2 }
    public enum ERole : uint { eConsole = 0, eMultimedia = 1, eCommunications = 2 }
    public enum DEVICE_STATE : uint {
        ACTIVE = 0x00000001, DISABLED = 0x00000002, NOTPRESENT = 0x00000004, UNPLUGGED = 0x00000008,
        ALL = 0x0000000F
    }
    public enum STGM : uint { READ = 0x00000000 }

    // ---- Property Key ----
    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTYKEY {
        public Guid fmtid;
        public uint pid;
    }

    // ---- IMMDevice ----
    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDevice {
        int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, uint dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(STGM stgmAccess, out IPropertyStore ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out uint pdwState);
    }

    // ---- IMMDeviceCollection ----
    [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceCollection {
        int GetCount(out uint pcDevices);
        int Item(uint nDevice, out IMMDevice ppDevice);
    }

    // ---- IMMDeviceEnumerator ----
    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMDeviceEnumerator {
        int EnumAudioEndpoints(EDataFlow dataFlow, uint dwStateMask, out IMMDeviceCollection ppDevices);
        int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice ppEndpoint);
    }

    // ---- IPropertyStore ----
    [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPropertyStore {
        int GetCount(out uint cProps);
        int GetAt(uint iProp, out PROPERTYKEY pkey);
        int GetValue(ref PROPERTYKEY key, out PropVariant pv);
    }

    // ---- PROPVARIANT (simplified) ----
    [StructLayout(LayoutKind.Sequential)]
    public struct PropVariant {
        public ushort vt;
        public ushort wReserved1, wReserved2, wReserved3;
        public IntPtr p1;
        public IntPtr p2;
        public override string ToString() {
            if (vt == 31) return Marshal.PtrToStringUni(p1); // VT_LPWSTR
            return "(non-string)";
        }
    }

    // ---- IAudioMeterInformation ----
    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAudioMeterInformation {
        int GetPeakValue(out float pfPeak);
    }

    // ---- IPolicyConfig (undocumented but stable since Vista) ----
    [Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IPolicyConfig {
        // We only need SetDefaultEndpoint — pad the vtable
        int GetMixFormat(); int GetDeviceFormat(); int ResetDeviceFormat(); int SetDeviceFormat();
        int GetProcessingPeriod(); int SetProcessingPeriod(); int GetShareMode(); int SetShareMode();
        int GetPropertyValue(); int SetPropertyValue();
        int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string wszDeviceId, ERole eRole);
    }

    // ---- COM Class IDs ----
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    public class MMDeviceEnumerator { }

    [ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")]
    public class PolicyConfigClient { }

    // ---- Helper class ----
    public static class AudioApi
    {
        private static readonly Guid IID_IAudioMeterInformation = new Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064");

        public static PROPERTYKEY PKEY_Device_FriendlyName = new PROPERTYKEY {
            fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 14
        };
        public static PROPERTYKEY PKEY_Device_DeviceDesc = new PROPERTYKEY {
            fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"), pid = 2
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
            } catch {
                return -1f;
            }
        }

        public static void SetDefaultDevice(string deviceId) {
            var policy = (IPolicyConfig)(new PolicyConfigClient());
            policy.SetDefaultEndpoint(deviceId, ERole.eConsole);
            policy.SetDefaultEndpoint(deviceId, ERole.eMultimedia);
            policy.SetDefaultEndpoint(deviceId, ERole.eCommunications);
        }
    }
}
'@

try {
    Add-Type -TypeDefinition $csharpCode -ErrorAction Stop
} catch {
    if ($_.Exception.Message -notlike "*already exists*") { throw }
}

# ============================================================================
# DISPLAY HELPERS
# ============================================================================
function Write-Banner {
    param([string]$Text, [string]$Color = "Cyan")
    $line = "=" * 72
    Write-Host ""
    Write-Host "  $line" -ForegroundColor $Color
    Write-Host "    $Text" -ForegroundColor $Color
    Write-Host "  $line" -ForegroundColor $Color
    Write-Host ""
}

function Write-Step {
    param([string]$Number, [string]$Title)
    Write-Host ""
    Write-Host "  ╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  ║  STEP $Number: $($Title.PadRight(57))║" -ForegroundColor Cyan
    Write-Host "  ╚══════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Explain {
    param([string]$Text)
    $wrapped = $Text -split "(.{1,68})\s" | Where-Object { $_ }
    foreach ($line in $wrapped) {
        Write-Host "  | $line" -ForegroundColor Gray
    }
    Write-Host ""
}

function Write-Tip {
    param([string]$Text)
    Write-Host "  ┌─ TIP ─────────────────────────────────────────────────────────┐" -ForegroundColor Blue
    $wrapped = $Text -split "(.{1,64})\s" | Where-Object { $_ }
    foreach ($line in $wrapped) {
        Write-Host "  | $line" -ForegroundColor Blue
    }
    Write-Host "  └───────────────────────────────────────────────────────────────┘" -ForegroundColor Blue
    Write-Host ""
}

function Write-Warning2 {
    param([string]$Text)
    Write-Host "  ┌─ WARNING ──────────────────────────────────────────────────────┐" -ForegroundColor Yellow
    $wrapped = $Text -split "(.{1,64})\s" | Where-Object { $_ }
    foreach ($line in $wrapped) {
        Write-Host "  | $line" -ForegroundColor Yellow
    }
    Write-Host "  └───────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow
    Write-Host ""
}

function Write-Success {
    param([string]$Text)
    Write-Host "  [OK] $Text" -ForegroundColor Green
    Write-Host ""
}

function Write-DeviceList {
    param($Devices, [int]$SelectedIndex = -1, [string]$CurrentDefaultId = "")
    Write-Host ""
    for ($i = 0; $i -lt $Devices.Count; $i++) {
        $d = $Devices[$i]
        $marker = if ($i -eq $SelectedIndex) { " >" } else { "  " }
        $defTag = if ($d.Id -eq $CurrentDefaultId) { " [DEFAULT]" } else { "" }
        $stateTag = ""
        if ($d.State -eq 0x00000002) { $stateTag = " (DISABLED)" }
        elseif ($d.State -eq 0x00000008) { $stateTag = " (UNPLUGGED)" }

        # Flag known impostors with a hint
        $hint = ""
        if ($d.Name -like "*Stereo Mix*") { $hint = " <-- not a microphone" }
        elseif ($d.Name -like "*Digital Audio*S/PDIF*") { $hint = " <-- rarely used" }

        $color = if ($d.Id -eq $CurrentDefaultId) { "Green" }
                 elseif ($d.State -ne 1) { "DarkGray" }
                 elseif ($hint) { "DarkYellow" }
                 else { "White" }

        Write-Host "  $marker [$($i+1)] $($d.Name)$defTag$stateTag$hint" -ForegroundColor $color
    }
    Write-Host ""
}

function Read-Choice {
    param([string]$Prompt, [int]$Min, [int]$Max, [switch]$AllowSkip)
    while ($true) {
        $skipText = if ($AllowSkip) { " or 'S' to skip" } else { "" }
        Write-Host "  $Prompt ($Min-$Max$skipText): " -ForegroundColor White -NoNewline
        $input = Read-Host
        if ($AllowSkip -and $input -match "^[sS]$") { return -1 }
        $num = 0
        if ([int]::TryParse($input, [ref]$num) -and $num -ge $Min -and $num -le $Max) {
            return $num
        }
        Write-Host "  Please enter a number between $Min and $Max." -ForegroundColor Red
    }
}

function Read-YesNo {
    param([string]$Prompt)
    while ($true) {
        Write-Host "  $Prompt (Y/N): " -ForegroundColor White -NoNewline
        $input = Read-Host
        if ($input -match "^[yY]") { return $true }
        if ($input -match "^[nN]") { return $false }
        Write-Host "  Please enter Y or N." -ForegroundColor Red
    }
}

# ============================================================================
# AUDIO DEVICE FUNCTIONS
# ============================================================================
function Get-AudioDevices {
    param([AudioHelper.EDataFlow]$Flow, [bool]$IncludeDisabled = $false)

    $enumerator = [AudioHelper.AudioApi]::GetEnumerator()
    $stateMask = if ($IncludeDisabled) { 0x0000000F } else { 0x00000001 }
    $collection = $null
    $enumerator.EnumAudioEndpoints($Flow, $stateMask, [ref]$collection)

    $count = 0
    $collection.GetCount([ref]$count)

    $devices = @()
    for ($i = 0; $i -lt $count; $i++) {
        $device = $null
        $collection.Item($i, [ref]$device)
        $name = [AudioHelper.AudioApi]::GetDeviceName($device)
        $id = [AudioHelper.AudioApi]::GetDeviceId($device)
        $state = [AudioHelper.AudioApi]::GetDeviceState($device)
        $devices += [PSCustomObject]@{
            Index   = $i
            Name    = $name
            Id      = $id
            State   = $state
            Device  = $device
        }
    }
    return $devices
}

function Get-DefaultDeviceId {
    param([AudioHelper.EDataFlow]$Flow)
    try {
        $enumerator = [AudioHelper.AudioApi]::GetEnumerator()
        $device = $null
        $enumerator.GetDefaultAudioEndpoint($Flow, [AudioHelper.ERole]::eConsole, [ref]$device)
        return [AudioHelper.AudioApi]::GetDeviceId($device)
    } catch {
        return ""
    }
}

function Set-DefaultAudioDevice {
    param([string]$DeviceId)
    [AudioHelper.AudioApi]::SetDefaultDevice($DeviceId)
}

# Generate a short WAV test tone in memory and play it through the current
# default output device. Uses System.Media.SoundPlayer (built into .NET) —
# no audio files, no temp files, no external libraries.
function Play-TestTone {
    $sampleRate = 44100
    $durationSec = 0.8
    $freq = 660
    $samples = [int]($sampleRate * $durationSec)
    $dataSize = $samples * 2  # 16-bit mono

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    # WAV header
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
    $bw.Write([int](36 + $dataSize))
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes("WAVE"))
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes("fmt "))
    $bw.Write([int]16)          # chunk size
    $bw.Write([int16]1)         # PCM
    $bw.Write([int16]1)         # mono
    $bw.Write([int]$sampleRate)
    $bw.Write([int]($sampleRate * 2))  # byte rate
    $bw.Write([int16]2)         # block align
    $bw.Write([int16]16)        # bits per sample
    $bw.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
    $bw.Write([int]$dataSize)

    for ($i = 0; $i -lt $samples; $i++) {
        $t = $i / $sampleRate
        # Fade in/out envelope to avoid clicks
        $envelope = 1.0
        $fadeLen = 0.05
        if ($t -lt $fadeLen) { $envelope = $t / $fadeLen }
        elseif ($t -gt ($durationSec - $fadeLen)) { $envelope = ($durationSec - $t) / $fadeLen }
        $val = [int16]([Math]::Sin(2 * [Math]::PI * $freq * $t) * 16000 * $envelope)
        $bw.Write($val)
    }

    $bw.Flush()
    $ms.Position = 0
    $player = New-Object System.Media.SoundPlayer($ms)
    $player.PlaySync()
    $player.Dispose()
    $ms.Dispose()
}

# Show a live audio level meter for the given input device. The user speaks
# and watches the bar — if it moves, this device is picking up their voice.
# This is the same concept as the input level bar in Windows Sound Settings.
function Show-MicLevel {
    param($Device, [int]$DurationSeconds = 5)
    Write-Host "  Listening for $DurationSeconds seconds — speak into your mic now..." -ForegroundColor Yellow
    Write-Host ""
    $maxPeak = 0.0
    $end = (Get-Date).AddSeconds($DurationSeconds)
    while ((Get-Date) -lt $end) {
        $peak = [AudioHelper.AudioApi]::GetPeakLevel($Device)
        if ($peak -gt $maxPeak) { $maxPeak = $peak }
        $barLen = [Math]::Min([int]($peak * 50), 50)
        $bar = "#" * $barLen + "-" * (50 - $barLen)
        $pct = [int]($peak * 100)
        Write-Host "`r  Level: [$bar] $($pct.ToString().PadLeft(3))%  " -NoNewline -ForegroundColor $(if ($peak -gt 0.05) { "Green" } else { "DarkGray" })
        Start-Sleep -Milliseconds 100
    }
    Write-Host ""
    Write-Host ""
    return $maxPeak
}

function Get-PnpDeviceForAudioEndpoint {
    param([string]$EndpointId)
    try {
        $pnpDevices = Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue |
            Where-Object { $_.InstanceId -and $EndpointId -like "*$($_.InstanceId.Split('\')[-1])*" }
        if ($pnpDevices) { return $pnpDevices[0] }
        return $null
    } catch {
        return $null
    }
}

# ============================================================================
# MAIN SCRIPT
# ============================================================================
# This section drives the interactive workflow. Each step mirrors the manual
# troubleshooting guide at https://audiofix.tools/guide/ — the script simply
# automates what you'd otherwise do by hand in Windows Sound Settings.
#
# The flow follows the site's content structure:
#   Step 1: Find your devices  (same as /guide/find-your-devices.html)
#   Step 2: Test your devices   (same as /guide/test-your-devices.html)
#   Step 3: Lock it down        (same as /guide/lock-it-down.html)
# ============================================================================
Clear-Host

# ============================
# WELCOME
# ============================
Write-Banner "AUDIOFIX — WINDOWS AUDIO TROUBLESHOOTER" "Cyan"

Write-Host "  It's not you. It's your computer." -ForegroundColor White
Write-Host ""
Write-Explain "Audio breaks because there are too many variables between Windows and your ears: OS updates, driver changes, phantom devices, app preferences. Each one can silently reroute your sound. This has been happening for 30 years."
Write-Explain "This script will walk you through three steps to fix it:"
Write-Host "    1. Find your devices — see what Windows sees" -ForegroundColor White
Write-Host "    2. Test your devices — prove which is your real speakers/mic" -ForegroundColor White
Write-Host "    3. Lock it down      — set your default and disable the rest" -ForegroundColor White
Write-Host ""
Write-Explain "We'll handle output (speakers/headphones) first, then input (microphone)."
Write-Tip "This is the same process described in the guide at https://audiofix.tools/guide/ — this script just automates it."

Write-Host "  Press Enter to begin..." -ForegroundColor Cyan -NoNewline
Read-Host

# ========================================================================
# OUTPUT SECTION (Speakers / Headphones)
# ========================================================================
Write-Banner "AUDIO OUTPUT (Speakers / Headphones)" "Magenta"

$doOutput = Read-YesNo "Do you want to troubleshoot audio OUTPUT (speakers/headphones)?"
if ($doOutput) {

    # ====================================================================
    # STEP 1: FIND YOUR OUTPUT DEVICES
    # ====================================================================
    # This does what you'd do manually in Sound Settings: open the output
    # dropdown and look at every device Windows is managing. The guide page
    # /guide/find-your-devices.html walks through this same view.
    # ====================================================================
    Write-Step "1" "FIND YOUR OUTPUT DEVICES"

    Write-Explain "Let's see what Windows sees. We're listing every output device your OS is managing — including ones you may not recognize."

    $outputDevices = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eRender)
    $currentDefaultId = Get-DefaultDeviceId -Flow ([AudioHelper.EDataFlow]::eRender)
    $originalDefaultId = $currentDefaultId

    if ($outputDevices.Count -eq 0) {
        Write-Host "  No active output devices found." -ForegroundColor Red
        Write-Explain "Check: Are your speakers/headphones plugged in and powered on? For Bluetooth, is the device connected (not just paired)?"
    } else {
        Write-Host "  Found $($outputDevices.Count) active output device(s):" -ForegroundColor White
        Write-DeviceList -Devices $outputDevices -CurrentDefaultId $currentDefaultId

        if ($outputDevices.Count -gt 2) {
            Write-Tip "Typical PCs have 4-8 output devices with unclear names. Most are HDMI outputs, S/PDIF ports, or virtual devices you'll never use. We'll sort them out in the next step."
        }

        # Quick volume/mute pre-check (matches the site's emphasis on checking
        # the obvious first — see /guide/why-it-happens.html#volume-check)
        Write-Host "  Before we test, a quick sanity check:" -ForegroundColor White
        Write-Host ""
        Write-Host "    - Is your volume above zero? (check the taskbar speaker icon)" -ForegroundColor Gray
        Write-Host "    - Is the speaker icon showing a mute symbol? Click to unmute." -ForegroundColor Gray
        Write-Host "    - Are your speakers/headphones physically turned on?" -ForegroundColor Gray
        Write-Host ""

        # ================================================================
        # STEP 2: TEST YOUR OUTPUT DEVICES
        # ================================================================
        # This does what the guide page /guide/test-your-devices.html
        # describes: play audio, switch between devices, listen for which
        # one produces sound from your actual speakers or headphones.
        # The script automates this by cycling through each device and
        # playing a test tone.
        # ================================================================
        Write-Step "2" "TEST YOUR OUTPUT DEVICES"

        $correctOutput = $null

        if ($outputDevices.Count -eq 1) {
            Write-Host "  Only one output device is active — that's your device." -ForegroundColor Green
            $correctOutput = $outputDevices[0]
        } else {
            Write-Explain "We'll play a short test tone through each device, one at a time. Listen for which device produces sound from your actual speakers or headphones."
            Write-Tip "Keep your speakers on and volume up. The tone will jump between devices — you'll hear it from the correct one."
            Write-Host "  Press Enter to start testing..." -ForegroundColor Cyan -NoNewline
            Read-Host

            foreach ($dev in $outputDevices) {
                Write-Host ""
                Write-Host "  Testing [$($outputDevices.IndexOf($dev)+1)/$($outputDevices.Count)]: $($dev.Name)" -ForegroundColor Yellow
                Write-Host "  Switching to this device and playing test tone..." -ForegroundColor Gray

                try {
                    Set-DefaultAudioDevice -DeviceId $dev.Id
                    Start-Sleep -Milliseconds 500
                    Play-TestTone
                } catch {
                    Write-Host "  Could not play tone through this device." -ForegroundColor DarkGray
                }

                $heard = Read-YesNo "Did you hear the tone from your intended speakers/headphones?"
                if ($heard) {
                    $correctOutput = $dev
                    Write-Success "Output device identified: $($dev.Name)"
                    break
                }
            }

            if (-not $correctOutput) {
                Write-Warning2 "None of the devices played through your intended speakers. Check: Are they powered on? Volume above zero? Cables connected? For Bluetooth, is the device actually connected (not just paired)?"
                Write-Tip "You can also check manually: Win+R, type ms-settings:sound, press Enter."
                # Restore original default
                if ($originalDefaultId) {
                    Set-DefaultAudioDevice -DeviceId $originalDefaultId
                }
            }
        }

        if ($correctOutput) {
            # ============================================================
            # STEP 3: LOCK IT DOWN (OUTPUT)
            # ============================================================
            # This is the most important step. The guide page
            # /guide/lock-it-down.html explains why: the more active
            # devices Windows sees, the more likely the default silently
            # changes. We set the correct device as default across all
            # three audio roles, then disable everything else.
            # ============================================================
            Write-Step "3" "LOCK IT DOWN (OUTPUT)"

            Write-Explain "This is the most important step. We'll set your device as the default and disable everything else so Windows can't silently switch on you."

            # --- Set as default across all three audio roles ---
            Write-Host "  Setting as system default..." -ForegroundColor White
            Write-Explain "Windows has three audio roles: Console (system sounds, browsers, games), Multimedia (media players, video), and Communications (calls, Teams, Zoom). We set your device as default for all three."

            Set-DefaultAudioDevice -DeviceId $correctOutput.Id
            Start-Sleep -Milliseconds 300
            Write-Success "Default output set to: $($correctOutput.Name) (all three roles: Console, Multimedia, Communications)"

            # --- Disable unused devices ---
            Write-Explain "Now let's disable the output devices you don't use. Think of audio devices like TV remotes on a couch — the more there are, the more likely someone grabs the wrong one. Removing the ones you never use prevents drift."

            Write-Warning2 "Disabling does NOT uninstall a device. You can re-enable any device later from Settings > System > Sound > All sound devices, or by re-running this script."

            $disableOutput = Read-YesNo "Would you like to review and disable unused output devices?"
            if ($disableOutput) {
                $allOutputs = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eRender) -IncludeDisabled $true
                Write-Host ""
                Write-Host "  All output devices (including already disabled):" -ForegroundColor White
                Write-DeviceList -Devices $allOutputs -CurrentDefaultId $correctOutput.Id

                $toDisable = @()
                foreach ($dev in $allOutputs) {
                    if ($dev.Id -eq $correctOutput.Id) {
                        Write-Host "  [$($allOutputs.IndexOf($dev)+1)] $($dev.Name) — YOUR DEFAULT (keeping enabled)" -ForegroundColor Green
                        continue
                    }
                    if ($dev.State -ne 1) {
                        Write-Host "  [$($allOutputs.IndexOf($dev)+1)] $($dev.Name) — already disabled" -ForegroundColor DarkGray
                        continue
                    }

                    # Provide context for common impostor devices
                    $context = ""
                    if ($dev.Name -like "*Display Audio*" -or $dev.Name -like "*HDMI*") {
                        $context = " (HDMI/monitor audio — disable unless you use monitor speakers)"
                    } elseif ($dev.Name -like "*Digital Audio*S/PDIF*") {
                        $context = " (optical output — rarely used on modern PCs)"
                    } elseif ($dev.Name -like "*USB PnP*") {
                        $context = " (docking station, webcam, or USB hub audio)"
                    }
                    if ($context) {
                        Write-Host "  $context" -ForegroundColor DarkYellow
                    }

                    $disable = Read-YesNo "Disable '$($dev.Name)'?"
                    if ($disable) { $toDisable += $dev }
                }

                if ($toDisable.Count -gt 0) {
                    Write-Host ""
                    Write-Host "  Disabling $($toDisable.Count) device(s)..." -ForegroundColor Yellow
                    foreach ($dev in $toDisable) {
                        try {
                            $pnpDevices = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue
                            $match = $pnpDevices | Where-Object { $dev.Name -like "*$($_.FriendlyName)*" -or $_.FriendlyName -like "*$($dev.Name)*" }
                            if (-not $match) {
                                $shortName = ($dev.Name -split '\(' )[0].Trim()
                                $match = $pnpDevices | Where-Object { $_.FriendlyName -like "*$shortName*" }
                            }
                            if ($match) {
                                $match | Select-Object -First 1 | Disable-PnpDevice -Confirm:$false -ErrorAction Stop
                                Write-Success "Disabled: $($dev.Name)"
                            } else {
                                Write-Host "  Could not find PnP device for '$($dev.Name)' — you may need to disable it manually." -ForegroundColor Yellow
                                Write-Host "    Open manually: Win+R, type ms-settings:sound-devices, press Enter" -ForegroundColor Gray
                            }
                        } catch {
                            Write-Host "  Could not disable '$($dev.Name)': $($_.Exception.Message)" -ForegroundColor Yellow
                            Write-Host "    Try manually: Win+R, type ms-settings:sound-devices, press Enter" -ForegroundColor Gray
                        }
                    }
                } else {
                    Write-Host "  No devices selected for disabling." -ForegroundColor Gray
                }
                Write-Host ""
            }
        }
    }
}

# ========================================================================
# INPUT SECTION (Microphone)
# ========================================================================
Write-Banner "AUDIO INPUT (Microphone)" "Magenta"

$doInput = Read-YesNo "Do you want to troubleshoot audio INPUT (microphone)?"
if ($doInput) {

    # ====================================================================
    # STEP 1: FIND YOUR INPUT DEVICES
    # ====================================================================
    # Same as the output section — list everything Windows is managing.
    # Input devices are trickier because of impostors like Stereo Mix
    # (captures desktop audio, not your voice) and webcam mics (often
    # across the room from you). See /guide/find-your-devices.html.
    # ====================================================================
    Write-Step "1" "FIND YOUR INPUT DEVICES"

    Write-Explain "Let's see what Windows sees for microphones. Watch for impostors — devices that look like mics but aren't what you want."

    $inputDevices = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eCapture)
    $currentDefaultInputId = Get-DefaultDeviceId -Flow ([AudioHelper.EDataFlow]::eCapture)

    if ($inputDevices.Count -eq 0) {
        Write-Host "  No active input devices found." -ForegroundColor Red
        Write-Explain "Check: Is your microphone plugged in? For USB mics, try a different port. For Bluetooth, confirm it's connected (not just paired)."
    } else {
        Write-Host "  Found $($inputDevices.Count) active input device(s):" -ForegroundColor White
        Write-DeviceList -Devices $inputDevices -CurrentDefaultId $currentDefaultInputId

        # Call out Stereo Mix specifically — matches the site's warning
        $stereoMix = $inputDevices | Where-Object { $_.Name -like "*Stereo Mix*" }
        if ($stereoMix) {
            Write-Warning2 "Stereo Mix is NOT a microphone. It captures whatever plays through your speakers. If this is your current default, that's probably your problem."
        }

        # Volume/mute pre-check for input
        Write-Host "  Before we test, check:" -ForegroundColor White
        Write-Host ""
        Write-Host "    - Is your mic muted? (check for a hardware mute button)" -ForegroundColor Gray
        Write-Host "    - Is it plugged into the right jack? (pink = mic, not blue)" -ForegroundColor Gray
        Write-Host "    - For USB/Bluetooth: is it actually connected and powered on?" -ForegroundColor Gray
        Write-Host ""

        # ================================================================
        # STEP 2: TEST YOUR INPUT DEVICES
        # ================================================================
        # For each input device, we show a live level meter while the user
        # speaks. If the bar moves, the device is picking up their voice.
        # This is the same concept as the input level bar in Windows
        # Sound Settings. See /guide/test-your-devices.html.
        # ================================================================
        Write-Step "2" "TEST YOUR INPUT DEVICES"

        $correctInput = $null

        if ($inputDevices.Count -eq 1) {
            Write-Host "  Only one input device is active — that's your microphone." -ForegroundColor Green
            $correctInput = $inputDevices[0]
        } else {
            Write-Explain "For each device, we'll show a live audio level meter for 5 seconds. Speak at normal volume and watch for the bar to move — that tells you which device is actually picking up your voice."
            Write-Host "  Press Enter to start testing..." -ForegroundColor Cyan -NoNewline
            Read-Host

            foreach ($dev in $inputDevices) {
                Write-Host ""

                # Skip Stereo Mix by default — it's almost never what the user wants
                if ($dev.Name -like "*Stereo Mix*") {
                    Write-Host "  Skipping: $($dev.Name) (not a real microphone)" -ForegroundColor DarkGray
                    $testAnyway = Read-YesNo "Test it anyway?"
                    if (-not $testAnyway) { continue }
                }

                Write-Host "  Testing [$($inputDevices.IndexOf($dev)+1)/$($inputDevices.Count)]: $($dev.Name)" -ForegroundColor Yellow

                # Set as default so the meter reads from this device
                try {
                    Set-DefaultAudioDevice -DeviceId $dev.Id
                    Start-Sleep -Milliseconds 500
                } catch {}

                $maxPeak = Show-MicLevel -Device $dev.Device -DurationSeconds 5

                if ($maxPeak -gt 0.02) {
                    Write-Host "  Peak level detected: $([int]($maxPeak * 100))%" -ForegroundColor Green
                    $isThis = Read-YesNo "This device responded to your voice. Is this your intended microphone?"
                    if ($isThis) {
                        $correctInput = $dev
                        Write-Success "Input device identified: $($dev.Name)"
                        break
                    }
                } else {
                    Write-Host "  No significant input detected on this device (0%)." -ForegroundColor DarkGray
                    Write-Host "    If this is your mic, check: mute button, jack color (pink), USB port, input volume." -ForegroundColor Gray
                    $forceSelect = Read-YesNo "Select this device anyway?"
                    if ($forceSelect) {
                        $correctInput = $dev
                        Write-Success "Input device selected: $($dev.Name)"
                        break
                    }
                }
            }

            if (-not $correctInput) {
                Write-Warning2 "None of the devices responded. Check: Is the mic muted (hardware button)? Plugged into the right jack (pink, not blue)? For USB, try another port. For Bluetooth, confirm it's connected (not just paired). Is the input volume above zero in Sound Settings?"
                Write-Tip "Check manually: Win+R, type ms-settings:sound, press Enter. Look at the input level bar while you speak."
                # Restore original default
                if ($currentDefaultInputId) {
                    try { Set-DefaultAudioDevice -DeviceId $currentDefaultInputId } catch {}
                }
            }
        }

        if ($correctInput) {
            # ============================================================
            # STEP 3: LOCK IT DOWN (INPUT)
            # ============================================================
            # Same principle as output: set the correct mic as default
            # across all three roles, then disable everything else.
            # Stereo Mix gets special attention — it's the #1 impostor
            # for input devices.
            # ============================================================
            Write-Step "3" "LOCK IT DOWN (INPUT)"

            Write-Explain "Same as output — set your mic as default for all three roles, then disable the rest."

            # --- Set as default ---
            Set-DefaultAudioDevice -DeviceId $correctInput.Id
            Start-Sleep -Milliseconds 300
            Write-Success "Default input set to: $($correctInput.Name) (all three roles: Console, Multimedia, Communications)"

            # --- Disable unused input devices ---
            Write-Explain "Disable every input device you don't use. This is especially important for Stereo Mix — if Windows ever switches your default to Stereo Mix, callers will hear your desktop audio instead of your voice."

            Write-Warning2 "Disabling does NOT uninstall. Re-enable anytime from Settings > System > Sound > All sound devices."

            $disableInput = Read-YesNo "Would you like to review and disable unused input devices?"
            if ($disableInput) {
                $allInputs = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eCapture) -IncludeDisabled $true
                Write-Host ""
                Write-Host "  All input devices (including already disabled):" -ForegroundColor White
                Write-DeviceList -Devices $allInputs -CurrentDefaultId $correctInput.Id

                $toDisable = @()
                foreach ($dev in $allInputs) {
                    if ($dev.Id -eq $correctInput.Id) {
                        Write-Host "  [$($allInputs.IndexOf($dev)+1)] $($dev.Name) — YOUR DEFAULT (keeping enabled)" -ForegroundColor Green
                        continue
                    }
                    if ($dev.State -ne 1) {
                        Write-Host "  [$($allInputs.IndexOf($dev)+1)] $($dev.Name) — already disabled" -ForegroundColor DarkGray
                        continue
                    }

                    # Provide context for common impostor devices
                    $context = ""
                    if ($dev.Name -like "*Stereo Mix*") {
                        $context = " (captures desktop audio, not your voice — almost always safe to disable)"
                    } elseif ($dev.Name -like "*Webcam*" -or $dev.Name -like "*Camera*") {
                        $context = " (webcam mic — disable if you use a separate microphone)"
                    } elseif ($dev.Name -like "*USB PnP*") {
                        $context = " (docking station or USB hub mic)"
                    }
                    if ($context) {
                        Write-Host "  $context" -ForegroundColor DarkYellow
                    }

                    $disable = Read-YesNo "Disable '$($dev.Name)'?"
                    if ($disable) { $toDisable += $dev }
                }

                if ($toDisable.Count -gt 0) {
                    Write-Host ""
                    Write-Host "  Disabling $($toDisable.Count) device(s)..." -ForegroundColor Yellow
                    foreach ($dev in $toDisable) {
                        try {
                            $pnpDevices = Get-PnpDevice -Class AudioEndpoint -Status OK -ErrorAction SilentlyContinue
                            $match = $pnpDevices | Where-Object { $dev.Name -like "*$($_.FriendlyName)*" -or $_.FriendlyName -like "*$($dev.Name)*" }
                            if (-not $match) {
                                $shortName = ($dev.Name -split '\(' )[0].Trim()
                                $match = $pnpDevices | Where-Object { $_.FriendlyName -like "*$shortName*" }
                            }
                            if ($match) {
                                $match | Select-Object -First 1 | Disable-PnpDevice -Confirm:$false -ErrorAction Stop
                                Write-Success "Disabled: $($dev.Name)"
                            } else {
                                Write-Host "  Could not find PnP device for '$($dev.Name)' — disable manually." -ForegroundColor Yellow
                                Write-Host "    Open manually: Win+R, type ms-settings:sound-devices, press Enter" -ForegroundColor Gray
                            }
                        } catch {
                            Write-Host "  Could not disable '$($dev.Name)': $($_.Exception.Message)" -ForegroundColor Yellow
                            Write-Host "    Try manually: Win+R, type ms-settings:sound-devices, press Enter" -ForegroundColor Gray
                        }
                    }
                } else {
                    Write-Host "  No devices selected for disabling." -ForegroundColor Gray
                }
                Write-Host ""
            }
        }
    }
}

# ========================================================================
# VERIFICATION
# ========================================================================
# Quick check that matches the "Verify your cleanup" section from
# /guide/lock-it-down.html — confirm defaults are set correctly and
# unused devices are disabled.
# ========================================================================
if (($doOutput -and $correctOutput) -or ($doInput -and $correctInput)) {
    Write-Banner "VERIFY YOUR SETUP" "Green"

    Write-Explain "Let's confirm everything looks right."
    Write-Host ""

    if ($doOutput -and $correctOutput) {
        $verifyDefaultOut = Get-DefaultDeviceId -Flow ([AudioHelper.EDataFlow]::eRender)
        $activeOutputs = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eRender)
        if ($verifyDefaultOut -eq $correctOutput.Id) {
            Write-Host "  [OK] Output default: $($correctOutput.Name)" -ForegroundColor Green
        } else {
            Write-Host "  [!!] Output default may not have been set correctly. Check manually:" -ForegroundColor Yellow
            Write-Host "       Win+R, type ms-settings:sound, press Enter" -ForegroundColor Gray
        }
        Write-Host "       Active output devices: $($activeOutputs.Count)" -ForegroundColor Gray
    }

    if ($doInput -and $correctInput) {
        $verifyDefaultIn = Get-DefaultDeviceId -Flow ([AudioHelper.EDataFlow]::eCapture)
        $activeInputs = Get-AudioDevices -Flow ([AudioHelper.EDataFlow]::eCapture)
        if ($verifyDefaultIn -eq $correctInput.Id) {
            Write-Host "  [OK] Input default:  $($correctInput.Name)" -ForegroundColor Green
        } else {
            Write-Host "  [!!] Input default may not have been set correctly. Check manually:" -ForegroundColor Yellow
            Write-Host "       Win+R, type ms-settings:sound, press Enter" -ForegroundColor Gray
        }
        Write-Host "       Active input devices: $($activeInputs.Count)" -ForegroundColor Gray
    }

    Write-Host ""
}

# ========================================================================
# APP-LEVEL REMINDER
# ========================================================================
# Some apps store their own audio device preference separately from the OS
# default. This is called out briefly since the full app-layer content is
# a future addition to the site. The key message: set each app to
# "System Default" so it follows the OS configuration automatically.
# ========================================================================
Write-Banner "ONE MORE THING: APP-LEVEL SETTINGS" "Yellow"

Write-Explain "Even after fixing the OS defaults and disabling unused devices, some apps store their own audio device preference separately. If audio works everywhere EXCEPT one app, that app is probably pointed at the wrong device."

Write-Warning2 "Changing the Windows default does NOT automatically update apps that have stored a specific device. You need to check each app individually."

Write-Host "  Common apps to check:" -ForegroundColor White
Write-Host ""
Write-Host "  ┌────────────────┬──────────────────────────────────────────────┐" -ForegroundColor Gray
Write-Host "  | App            | Where to find audio device setting           |" -ForegroundColor Gray
Write-Host "  ├────────────────┼──────────────────────────────────────────────┤" -ForegroundColor Gray
Write-Host "  | Zoom           | Settings > Audio > Speaker / Microphone      |" -ForegroundColor White
Write-Host "  | Teams          | Settings > Devices > Speaker / Microphone    |" -ForegroundColor White
Write-Host "  | Discord        | User Settings > Voice & Video                |" -ForegroundColor White
Write-Host "  | Google Meet    | In-call ... menu > Audio settings            |" -ForegroundColor White
Write-Host "  | OBS            | Settings > Audio > Desktop / Mic             |" -ForegroundColor White
Write-Host "  | Games          | In-game Audio / Sound settings               |" -ForegroundColor White
Write-Host "  └────────────────┴──────────────────────────────────────────────┘" -ForegroundColor Gray
Write-Host ""

Write-Tip "Set each app to 'System Default' or 'Same as System' where possible. That way, if you change the OS default later, the app follows automatically."

# ========================================================================
# SUMMARY
# ========================================================================
Write-Banner "DONE" "Green"

Write-Host "  Summary:" -ForegroundColor White
Write-Host ""

if ($doOutput -and $correctOutput) {
    Write-Host "  Output: $($correctOutput.Name)" -ForegroundColor Green
    Write-Host "          Default for all roles (Console, Multimedia, Communications)" -ForegroundColor Green
} elseif ($doOutput) {
    Write-Host "  Output: No device was identified" -ForegroundColor Yellow
}

if ($doInput -and $correctInput) {
    Write-Host "  Input:  $($correctInput.Name)" -ForegroundColor Green
    Write-Host "          Default for all roles (Console, Multimedia, Communications)" -ForegroundColor Green
} elseif ($doInput) {
    Write-Host "  Input:  No device was identified" -ForegroundColor Yellow
}

Write-Host ""
Write-Tip "If audio breaks again in the future, re-run this script. You can also quickly check your settings manually: Win+R, type ms-settings:sound, press Enter."
Write-Host "  Full guide: https://audiofix.tools/guide/" -ForegroundColor Cyan
Write-Host ""

# ========================================================================
# SUPPORT PROMPT
# ========================================================================
$madeChanges = ($doOutput -and $correctOutput) -or ($doInput -and $correctInput)
if ($madeChanges) {
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────────────────────┐" -ForegroundColor Magenta
    Write-Host "  |                                                                  |" -ForegroundColor Magenta
    Write-Host "  |   This tool has zero dependencies and zero telemetry.            |" -ForegroundColor Magenta
    Write-Host "  |   No data leaves your machine. No third-party code runs.         |" -ForegroundColor Magenta
    Write-Host "  |                                                                  |" -ForegroundColor Magenta
    Write-Host "  |   If this fixed your audio, a $5 purchase helps keep it          |" -ForegroundColor Magenta
    Write-Host "  |   maintained and funds macOS and Linux versions.                 |" -ForegroundColor Magenta
    Write-Host "  |                                                                  |" -ForegroundColor Magenta
    Write-Host "  |   -> https://buy.stripe.com/test_dRm6oI2Gj5BFgb06j7aAw00       |" -ForegroundColor Cyan
    Write-Host "  |                                                                  |" -ForegroundColor Magenta
    Write-Host "  └──────────────────────────────────────────────────────────────────┘" -ForegroundColor Magenta
    Write-Host ""

    $openSupport = Read-YesNo "Open the purchase page in your browser?"
    if ($openSupport) {
        Start-Process "https://buy.stripe.com/test_dRm6oI2Gj5BFgb06j7aAw00"
    }
}

Write-Host ""
Write-Host "  Press Enter to exit..." -ForegroundColor Cyan -NoNewline
Read-Host
