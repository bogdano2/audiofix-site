import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";
import {
  DiagnosticReport,
  DirectionReport,
  DiagnosticIssue,
  AudioDevice,
} from "../platform/types.js";

export const diagnoseSchema = z.object({});

function analyzeDirection(
  devices: AudioDevice[],
  defaultDevice: AudioDevice | null,
  volume: number,
  muted: boolean
): DirectionReport {
  const active = devices.filter((d) => d.state === "active");
  const disabled = devices.filter((d) => d.state === "disabled");
  const issues: DiagnosticIssue[] = [];
  const recommendations: string[] = [];

  // No devices at all
  if (devices.length === 0) {
    issues.push({ severity: "error", message: "No audio devices found" });
    recommendations.push(
      "Check that audio hardware is connected and drivers are installed"
    );
    return { defaultDevice, activeDevices: active, disabledDevices: disabled, volume, muted, issues, recommendations };
  }

  // No default
  if (!defaultDevice) {
    issues.push({ severity: "error", message: "No default device is set" });
    recommendations.push("Set a default audio device");
  }

  // Muted
  if (muted) {
    issues.push({ severity: "warning", message: "Audio is currently muted" });
    recommendations.push("Unmute to restore audio");
  }

  // Volume too low
  if (volume < 10 && !muted) {
    issues.push({
      severity: "warning",
      message: `Volume is very low (${volume}%)`,
    });
    recommendations.push("Increase volume to at least 25%");
  }

  // Too many active devices (drift risk)
  if (active.length > 3) {
    issues.push({
      severity: "info",
      message: `${active.length} active devices detected — this increases the chance of audio switching unexpectedly`,
    });
    recommendations.push(
      "Disable unused audio devices to prevent the OS from switching to them automatically"
    );
  }

  // Stereo Mix enabled (common problem on Windows)
  const stereoMix = active.find((d) => d.flags.includes("stereo-mix"));
  if (stereoMix) {
    issues.push({
      severity: "info",
      message: `Stereo Mix ("${stereoMix.name}") is active — this is rarely needed and can cause confusion`,
    });
    recommendations.push("Disable Stereo Mix unless you specifically need it for audio recording/routing");
  }

  if (issues.length === 0) {
    recommendations.push("Audio configuration looks healthy — no issues detected");
  }

  return { defaultDevice, activeDevices: active, disabledDevices: disabled, volume, muted, issues, recommendations };
}

export async function diagnose(platform: AudioPlatform): Promise<DiagnosticReport> {
  const [outputDevices, inputDevices] = await Promise.all([
    platform.listDevices("output", true),
    platform.listDevices("input", true),
  ]);

  const outputDefault = outputDevices.find((d) => d.isDefault) ?? null;
  const inputDefault = inputDevices.find((d) => d.isDefault) ?? null;

  let outputVol = 0, outputMuted = false;
  let inputVol = 0, inputMuted = false;

  if (platform.capabilities.canControlVolume) {
    try {
      const ov = await platform.getVolume("output");
      outputVol = ov.volume;
      outputMuted = ov.muted;
    } catch { /* device may not exist */ }

    try {
      const iv = await platform.getVolume("input");
      inputVol = iv.volume;
      inputMuted = iv.muted;
    } catch { /* device may not exist */ }
  }

  return {
    platform: platform.name,
    output: analyzeDirection(outputDevices, outputDefault, outputVol, outputMuted),
    input: analyzeDirection(inputDevices, inputDefault, inputVol, inputMuted),
  };
}
