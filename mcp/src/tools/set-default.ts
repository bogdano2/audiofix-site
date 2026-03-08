import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const setDefaultSchema = z.object({
  deviceId: z.string().describe("The device ID to set as default. Use list-devices to find available IDs."),
});

export type SetDefaultInput = z.infer<typeof setDefaultSchema>;

export async function setDefault(platform: AudioPlatform, input: SetDefaultInput) {
  await platform.setDefault(input.deviceId);
  return { success: true, message: `Default audio device set to "${input.deviceId}"` };
}
