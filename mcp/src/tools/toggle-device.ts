import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const toggleDeviceSchema = z.object({
  deviceId: z.string().describe("The device ID to enable or disable. Use list-devices to find available IDs."),
  enabled: z.boolean().describe("true to enable the device, false to disable it"),
});

export type ToggleDeviceInput = z.infer<typeof toggleDeviceSchema>;

export async function toggleDevice(platform: AudioPlatform, input: ToggleDeviceInput) {
  if (!platform.capabilities.canDisableDevices) {
    return {
      success: false,
      message: `Enabling/disabling individual devices is not supported on ${platform.name}. This feature is only available on Windows.`,
    };
  }

  if (input.enabled) {
    await platform.enableDevice(input.deviceId);
    return { success: true, message: `Device "${input.deviceId}" has been enabled` };
  } else {
    await platform.disableDevice(input.deviceId);
    return { success: true, message: `Device "${input.deviceId}" has been disabled` };
  }
}
