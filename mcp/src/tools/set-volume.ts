import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const setVolumeSchema = z.object({
  direction: z
    .enum(["output", "input"])
    .describe("Which volume to set: output (speakers) or input (microphone)"),
  volume: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Volume level 0-100. Omit to leave unchanged."),
  muted: z
    .boolean()
    .optional()
    .describe("Set mute state. Omit to leave unchanged. (Output only on macOS)"),
});

export type SetVolumeInput = z.infer<typeof setVolumeSchema>;

export async function setVolume(platform: AudioPlatform, input: SetVolumeInput) {
  if (!platform.capabilities.canControlVolume) {
    return { success: false, message: `Volume control is not supported on ${platform.name}` };
  }
  await platform.setVolume(input.direction, input.volume, input.muted);

  const parts: string[] = [];
  if (input.volume !== undefined) parts.push(`volume to ${input.volume}%`);
  if (input.muted !== undefined) parts.push(input.muted ? "muted" : "unmuted");

  return { success: true, message: `Set ${input.direction} ${parts.join(" and ")}` };
}
