import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const listDevicesSchema = z.object({
  direction: z
    .enum(["output", "input", "all"])
    .default("all")
    .describe("Filter by device direction: output (speakers/headphones), input (microphones), or all"),
  includeDisabled: z
    .boolean()
    .default(false)
    .describe("Include disabled/unplugged devices (Windows only)"),
});

export type ListDevicesInput = z.infer<typeof listDevicesSchema>;

export async function listDevices(platform: AudioPlatform, input: ListDevicesInput) {
  const devices = await platform.listDevices(input.direction, input.includeDisabled);
  return {
    platform: platform.name,
    direction: input.direction,
    count: devices.length,
    devices,
  };
}
