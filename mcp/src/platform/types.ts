export type DeviceDirection = "output" | "input";
export type DeviceState = "active" | "disabled" | "unplugged" | "not_present";
export type DeviceFlag =
  | "stereo-mix"
  | "hdmi"
  | "spdif"
  | "virtual"
  | "usb"
  | "bluetooth"
  | "webcam";

export interface AudioDevice {
  id: string;
  name: string;
  direction: DeviceDirection;
  state: DeviceState;
  isDefault: boolean;
  flags: DeviceFlag[];
}

export interface VolumeInfo {
  volume: number; // 0-100
  muted: boolean;
  deviceName: string;
}

export interface MicTestResult {
  peakLevel: number; // 0.0-1.0
  averageLevel: number; // 0.0-1.0
  detectedActivity: boolean;
}

export interface DiagnosticReport {
  platform: string;
  output: DirectionReport;
  input: DirectionReport;
}

export interface DirectionReport {
  defaultDevice: AudioDevice | null;
  activeDevices: AudioDevice[];
  disabledDevices: AudioDevice[];
  volume: number;
  muted: boolean;
  issues: DiagnosticIssue[];
  recommendations: string[];
}

export interface DiagnosticIssue {
  severity: "warning" | "info" | "error";
  message: string;
}

export interface PlatformCapabilities {
  canDisableDevices: boolean;
  canSetDefaultByRole: boolean;
  canPlayTestTone: boolean;
  canMonitorMicLevel: boolean;
  canControlVolume: boolean;
}
