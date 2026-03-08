import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const getVolumeSchema = z.object({
  direction: z
    .enum(["output", "input"])
    .default("output")
    .describe("Which volume to get: output (speakers) or input (microphone)"),
});

export type GetVolumeInput = z.infer<typeof getVolumeSchema>;

export async function getVolume(platform: AudioPlatform, input: GetVolumeInput) {
  if (!platform.capabilities.canControlVolume) {
    return { success: false, message: `Volume control is not supported on ${platform.name}` };
  }
  const info = await platform.getVolume(input.direction);
  return {
    platform: platform.name,
    direction: input.direction,
    volume: info.volume,
    muted: info.muted,
    deviceName: info.deviceName,
  };
}
