import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AudioPlatform } from "./base.js";
import {
  AudioDevice,
  DeviceDirection,
  DeviceState,
  MicTestResult,
  PlatformCapabilities,
  VolumeInfo,
} from "./types.js";

const exec = promisify(execFile);
const TIMEOUT = 15000;

async function hasSwitchAudioSource(): Promise<boolean> {
  try {
    await exec("which", ["SwitchAudioSource"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function runOsascript(script: string): Promise<string> {
  const { stdout } = await exec("osascript", ["-e", script], { timeout: TIMEOUT });
  return stdout.trim();
}

export class MacOSAudioPlatform extends AudioPlatform {
  readonly name = "macos";
  readonly capabilities: PlatformCapabilities = {
    canDisableDevices: false,
    canSetDefaultByRole: false,
    canPlayTestTone: true,
    canMonitorMicLevel: false, // Limited — returns volume setting, not live level
    canControlVolume: true,
  };

  async listDevices(
    direction: DeviceDirection | "all",
    _includeDisabled: boolean
  ): Promise<AudioDevice[]> {
    const hasSAS = await hasSwitchAudioSource();
    const devices: AudioDevice[] = [];

    if (hasSAS) {
      const types =
        direction === "all"
          ? ["output", "input"]
          : [direction];

      for (const type of types) {
        const { stdout } = await exec(
          "SwitchAudioSource",
          ["-a", "-t", type, "-f", "json"],
          { timeout: TIMEOUT }
        );

        // SwitchAudioSource outputs one JSON object per line
        const lines = stdout.trim().split("\n").filter(Boolean);
        const currentName = await this.getCurrentDeviceName(type as DeviceDirection);

        for (const line of lines) {
          try {
            const d = JSON.parse(line);
            devices.push({
              id: d.uid || d.name,
              name: d.name,
              direction: type as DeviceDirection,
              state: "active" as DeviceState,
              isDefault: d.name === currentName,
              flags: [],
            });
          } catch {
            // Skip unparseable lines
          }
        }
      }
    } else {
      // Fallback: system_profiler
      const { stdout } = await exec(
        "system_profiler",
        ["SPAudioDataType", "-json"],
        { timeout: TIMEOUT }
      );
      const data = JSON.parse(stdout);
      const items = data?.SPAudioDataType || [];

      for (const item of items) {
        if (item.coreaudio_device_output && direction !== "input") {
          devices.push({
            id: item._name,
            name: item._name,
            direction: "output",
            state: "active",
            isDefault: false, // Can't determine without SwitchAudioSource
            flags: [],
          });
        }
        if (item.coreaudio_device_input && direction !== "output") {
          devices.push({
            id: item._name,
            name: item._name,
            direction: "input",
            state: "active",
            isDefault: false,
            flags: [],
          });
        }
      }
    }

    return devices;
  }

  private async getCurrentDeviceName(
    direction: DeviceDirection
  ): Promise<string | null> {
    const hasSAS = await hasSwitchAudioSource();
    if (hasSAS) {
      try {
        const { stdout } = await exec(
          "SwitchAudioSource",
          ["-c", "-t", direction],
          { timeout: TIMEOUT }
        );
        return stdout.trim();
      } catch {
        return null;
      }
    }
    return null;
  }

  async getDefault(direction: DeviceDirection): Promise<AudioDevice | null> {
    const devices = await this.listDevices(direction, false);
    return devices.find((d) => d.isDefault) ?? devices[0] ?? null;
  }

  async setDefault(deviceId: string): Promise<void> {
    const hasSAS = await hasSwitchAudioSource();
    if (!hasSAS) {
      throw new Error(
        "SwitchAudioSource is required to change audio devices on macOS. Install it with: brew install switchaudio-osx"
      );
    }

    // Try both output and input
    try {
      await exec("SwitchAudioSource", ["-s", deviceId, "-t", "output"], {
        timeout: TIMEOUT,
      });
    } catch {
      await exec("SwitchAudioSource", ["-s", deviceId, "-t", "input"], {
        timeout: TIMEOUT,
      });
    }
  }

  async playTestTone(_deviceId: string): Promise<void> {
    // Generate a WAV file and play with afplay
    const sr = 44100;
    const dur = 0.8;
    const freq = 660;
    const samples = Math.floor(sr * dur);
    const dataLen = samples * 2;
    const buf = Buffer.alloc(44 + dataLen);

    // WAV header
    buf.write("RIFF", 0);
    buf.writeUInt32LE(dataLen + 36, 4);
    buf.write("WAVEfmt ", 8);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(1, 22); // Mono
    buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 2, 28);
    buf.writeUInt16LE(2, 32);
    buf.writeUInt16LE(16, 34);
    buf.write("data", 36);
    buf.writeUInt32LE(dataLen, 40);

    for (let i = 0; i < samples; i++) {
      const t = i / sr;
      const env = Math.min(1, Math.min(t / 0.01, (dur - t) / 0.05));
      const val = Math.round(Math.sin(2 * Math.PI * freq * t) * 20000 * env);
      buf.writeInt16LE(val, 44 + i * 2);
    }

    const tmpPath = join(tmpdir(), "audiofix-tone.wav");
    await writeFile(tmpPath, buf);

    try {
      await exec("afplay", [tmpPath], { timeout: TIMEOUT });
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  }

  async monitorMicLevel(
    _deviceId: string,
    _durationSeconds: number
  ): Promise<MicTestResult> {
    // macOS limitation: no simple CLI for live mic level
    const vol = await runOsascript("input volume of (get volume settings)");
    const level = parseInt(vol, 10) / 100;
    return {
      peakLevel: level,
      averageLevel: level,
      detectedActivity: level > 0,
    };
  }

  async getVolume(direction: DeviceDirection): Promise<VolumeInfo> {
    const prop =
      direction === "output" ? "output volume" : "input volume";
    const muteProp =
      direction === "output" ? "output muted" : "input volume";

    const vol = await runOsascript(`${prop} of (get volume settings)`);
    let muted = false;
    if (direction === "output") {
      const m = await runOsascript("output muted of (get volume settings)");
      muted = m === "true";
    }

    return {
      volume: parseInt(vol, 10),
      muted,
      deviceName: (await this.getCurrentDeviceName(direction)) ?? "Unknown",
    };
  }

  async setVolume(
    direction: DeviceDirection,
    volume?: number,
    muted?: boolean
  ): Promise<void> {
    if (volume !== undefined) {
      const prop = direction === "output" ? "output volume" : "input volume";
      await runOsascript(`set volume ${prop} ${volume}`);
    }
    if (muted !== undefined && direction === "output") {
      await runOsascript(
        `set volume ${muted ? "with" : "without"} output muted`
      );
    }
  }

  async enableDevice(_deviceId: string): Promise<void> {
    throw new Error(
      "macOS does not support enabling/disabling individual audio devices via CLI. Use Audio MIDI Setup (Applications > Utilities > Audio MIDI Setup) to manage devices."
    );
  }

  async disableDevice(_deviceId: string): Promise<void> {
    throw new Error(
      "macOS does not support enabling/disabling individual audio devices via CLI. Use Audio MIDI Setup (Applications > Utilities > Audio MIDI Setup) to manage devices."
    );
  }
}
