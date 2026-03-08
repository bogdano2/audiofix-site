import {
  AudioDevice,
  DeviceDirection,
  MicTestResult,
  PlatformCapabilities,
  VolumeInfo,
} from "./types.js";

export abstract class AudioPlatform {
  abstract readonly name: string;
  abstract readonly capabilities: PlatformCapabilities;

  abstract listDevices(
    direction: DeviceDirection | "all",
    includeDisabled: boolean
  ): Promise<AudioDevice[]>;

  abstract getDefault(
    direction: DeviceDirection
  ): Promise<AudioDevice | null>;

  abstract setDefault(deviceId: string): Promise<void>;

  abstract playTestTone(deviceId: string): Promise<void>;

  abstract monitorMicLevel(
    deviceId: string,
    durationSeconds: number
  ): Promise<MicTestResult>;

  abstract getVolume(direction: DeviceDirection): Promise<VolumeInfo>;

  abstract setVolume(
    direction: DeviceDirection,
    volume?: number,
    muted?: boolean
  ): Promise<void>;

  abstract enableDevice(deviceId: string): Promise<void>;

  abstract disableDevice(deviceId: string): Promise<void>;
}
