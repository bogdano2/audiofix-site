import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const getDefaultSchema = z.object({
  direction: z
    .enum(["output", "input"])
    .describe("Which default to get: output (speakers) or input (microphone)"),
});

export type GetDefaultInput = z.infer<typeof getDefaultSchema>;

export async function getDefault(platform: AudioPlatform, input: GetDefaultInput) {
  const device = await platform.getDefault(input.direction);
  if (!device) {
    return { platform: platform.name, direction: input.direction, device: null, message: `No ${input.direction} device found` };
  }
  return { platform: platform.name, direction: input.direction, device };
}
