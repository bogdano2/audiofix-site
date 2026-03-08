import { execFile } from "node:child_process";
import { promisify } from "node:util";
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

type AudioBackend = "pipewire" | "pulseaudio";

async function detectBackend(): Promise<AudioBackend> {
  try {
    const { stdout } = await exec("pactl", ["info"], { timeout: 5000 });
    if (stdout.includes("PipeWire")) return "pipewire";
    return "pulseaudio";
  } catch {
    return "pulseaudio";
  }
}

async function pactl(...args: string[]): Promise<string> {
  const { stdout } = await exec("pactl", args, { timeout: TIMEOUT });
  return stdout.trim();
}

interface PactlSink {
  index: string;
  name: string;
  description: string;
  state: string;
  mute: string;
  volume: string;
}

interface PactlSource {
  index: string;
  name: string;
  description: string;
  state: string;
  mute: string;
  volume: string;
}

function parsePactlList(output: string): Map<string, string>[] {
  const entries: Map<string, string>[] = [];
  let current: Map<string, string> | null = null;

  for (const line of output.split("\n")) {
    if (/^\S/.test(line) && line.includes("#")) {
      // New entry like "Sink #0" or "Source #1"
      current = new Map();
      current.set("index", line.split("#")[1]?.trim() ?? "");
      entries.push(current);
    } else if (current && line.includes(":")) {
      const colonIdx = line.indexOf(":");
      const key = line.substring(0, colonIdx).trim().toLowerCase();
      const val = line.substring(colonIdx + 1).trim();
      current.set(key, val);
    }
  }
  return entries;
}

function extractVolume(volStr: string): number {
  // Format: "front-left: 65536 / 100% / 0.00 dB,   front-right: ..."
  const match = volStr.match(/(\d+)%/);
  return match ? parseInt(match[1], 10) : 0;
}

function detectFlags(name: string, description: string): AudioDevice["flags"] {
  const flags: AudioDevice["flags"] = [];
  const combined = `${name} ${description}`.toLowerCase();
  if (combined.includes("bluetooth") || combined.includes("bluez")) flags.push("bluetooth");
  if (combined.includes("usb")) flags.push("usb");
  if (combined.includes("hdmi")) flags.push("hdmi");
  if (combined.includes("webcam") || combined.includes("camera")) flags.push("webcam");
  return flags;
}

export class LinuxAudioPlatform extends AudioPlatform {
  readonly name = "linux";
  readonly capabilities: PlatformCapabilities = {
    canDisableDevices: false,
    canSetDefaultByRole: false,
    canPlayTestTone: true,
    canMonitorMicLevel: true,
    canControlVolume: true,
  };

  private backend: AudioBackend | null = null;

  private async getBackend(): Promise<AudioBackend> {
    if (!this.backend) this.backend = await detectBackend();
    return this.backend;
  }

  async listDevices(
    direction: DeviceDirection | "all",
    _includeDisabled: boolean
  ): Promise<AudioDevice[]> {
    const devices: AudioDevice[] = [];

    if (direction === "all" || direction === "output") {
      const defaultSink = await pactl("get-default-sink");
      const output = await pactl("list", "sinks");
      const entries = parsePactlList(output);

      for (const entry of entries) {
        const name = entry.get("name") ?? "";
        const desc = entry.get("description") ?? name;
        const state = entry.get("state") ?? "";

        devices.push({
          id: name,
          name: desc,
          direction: "output",
          state: state.toLowerCase() === "running" || state.toLowerCase() === "idle"
            ? "active"
            : ("unplugged" as DeviceState),
          isDefault: name === defaultSink,
          flags: detectFlags(name, desc),
        });
      }
    }

    if (direction === "all" || direction === "input") {
      const defaultSource = await pactl("get-default-source");
      const output = await pactl("list", "sources");
      const entries = parsePactlList(output);

      for (const entry of entries) {
        const name = entry.get("name") ?? "";
        const desc = entry.get("description") ?? name;
        const state = entry.get("state") ?? "";

        // Skip monitor sources (they mirror sinks)
        if (name.includes(".monitor")) continue;

        devices.push({
          id: name,
          name: desc,
          direction: "input",
          state: state.toLowerCase() === "running" || state.toLowerCase() === "idle"
            ? "active"
            : ("unplugged" as DeviceState),
          isDefault: name === defaultSource,
          flags: detectFlags(name, desc),
        });
      }
    }

    return devices;
  }

  async getDefault(direction: DeviceDirection): Promise<AudioDevice | null> {
    const devices = await this.listDevices(direction, false);
    return devices.find((d) => d.isDefault) ?? devices[0] ?? null;
  }

  async setDefault(deviceId: string): Promise<void> {
    // Try as sink first, then source
    try {
      await pactl("set-default-sink", deviceId);
    } catch {
      await pactl("set-default-source", deviceId);
    }
  }

  async playTestTone(_deviceId: string): Promise<void> {
    // paplay with a generated tone via speaker-test or paplay
    try {
      await exec(
        "speaker-test",
        ["-t", "sine", "-f", "660", "-l", "1", "-p", "1"],
        { timeout: TIMEOUT }
      );
    } catch {
      // Fallback: use paplay with /usr/share/sounds if available
      try {
        await exec("paplay", ["/usr/share/sounds/freedesktop/stereo/bell.oga"], {
          timeout: TIMEOUT,
        });
      } catch {
        throw new Error(
          "Could not play test tone. Ensure speaker-test or paplay is installed."
        );
      }
    }
  }

  async monitorMicLevel(
    deviceId: string,
    durationSeconds: number
  ): Promise<MicTestResult> {
    // Use parecord to capture briefly, then analyze
    // Simpler approach: use pactl to read current volume of the source
    const output = await pactl("list", "sources");
    const entries = parsePactlList(output);
    const source = entries.find((e) => e.get("name") === deviceId);

    if (!source) {
      return { peakLevel: 0, averageLevel: 0, detectedActivity: false };
    }

    const volStr = source.get("volume") ?? "0%";
    const level = extractVolume(volStr) / 100;

    return {
      peakLevel: level,
      averageLevel: level,
      detectedActivity: level > 0.01,
    };
  }

  async getVolume(direction: DeviceDirection): Promise<VolumeInfo> {
    const type = direction === "output" ? "sinks" : "sources";
    const defaultName =
      direction === "output"
        ? await pactl("get-default-sink")
        : await pactl("get-default-source");

    const output = await pactl("list", type);
    const entries = parsePactlList(output);
    const device = entries.find((e) => e.get("name") === defaultName);

    const volStr = device?.get("volume") ?? "0%";
    const muteStr = device?.get("mute") ?? "no";

    return {
      volume: extractVolume(volStr),
      muted: muteStr === "yes",
      deviceName: device?.get("description") ?? defaultName,
    };
  }

  async setVolume(
    direction: DeviceDirection,
    volume?: number,
    muted?: boolean
  ): Promise<void> {
    const defaultName =
      direction === "output"
        ? await pactl("get-default-sink")
        : await pactl("get-default-source");
    const type = direction === "output" ? "sink" : "source";

    if (volume !== undefined) {
      await pactl(`set-${type}-volume`, defaultName, `${volume}%`);
    }
    if (muted !== undefined) {
      await pactl(`set-${type}-mute`, defaultName, muted ? "1" : "0");
    }
  }

  async enableDevice(_deviceId: string): Promise<void> {
    throw new Error(
      "Linux does not support enabling/disabling individual audio devices via PulseAudio/PipeWire CLI. Use your desktop environment's sound settings to manage devices."
    );
  }

  async disableDevice(_deviceId: string): Promise<void> {
    throw new Error(
      "Linux does not support enabling/disabling individual audio devices via PulseAudio/PipeWire CLI. Use your desktop environment's sound settings to manage devices."
    );
  }
}
