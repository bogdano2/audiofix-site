import { z } from "zod";
import { AudioPlatform } from "../platform/base.js";

export const testDeviceSchema = z.object({
  deviceId: z.string().describe("The device ID to test. Use list-devices to find available IDs."),
  type: z
    .enum(["tone", "mic"])
    .default("tone")
    .describe("Test type: 'tone' plays a test sound on an output device, 'mic' monitors microphone input level"),
  durationSeconds: z
    .number()
    .min(1)
    .max(10)
    .default(3)
    .describe("Duration in seconds for mic monitoring (ignored for tone test)"),
});

export type TestDeviceInput = z.infer<typeof testDeviceSchema>;

export async function testDevice(platform: AudioPlatform, input: TestDeviceInput) {
  if (input.type === "tone") {
    if (!platform.capabilities.canPlayTestTone) {
      return { success: false, message: `Test tone is not supported on ${platform.name}` };
    }
    await platform.playTestTone(input.deviceId);
    return { success: true, message: "Test tone played successfully. Did you hear it?" };
  }

  // Mic test
  if (!platform.capabilities.canMonitorMicLevel) {
    return {
      success: false,
      message: `Live mic monitoring is not supported on ${platform.name}. The result shows the volume setting, not live audio level.`,
    };
  }
  const result = await platform.monitorMicLevel(input.deviceId, input.durationSeconds);
  return {
    success: true,
    peakLevel: Math.round(result.peakLevel * 100),
    averageLevel: Math.round(result.averageLevel * 100),
    detectedActivity: result.detectedActivity,
    message: result.detectedActivity
      ? `Microphone is picking up audio (peak: ${Math.round(result.peakLevel * 100)}%)`
      : "No audio activity detected. Try speaking into the microphone.",
  };
}
