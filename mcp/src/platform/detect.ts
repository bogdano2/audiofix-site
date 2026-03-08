import { platform } from "node:os";
import { AudioPlatform } from "./base.js";

export async function createPlatform(): Promise<AudioPlatform> {
  switch (platform()) {
    case "win32": {
      const { WindowsAudioPlatform } = await import("./windows.js");
      return new WindowsAudioPlatform();
    }
    case "darwin": {
      const { MacOSAudioPlatform } = await import("./macos.js");
      return new MacOSAudioPlatform();
    }
    case "linux": {
      const { LinuxAudioPlatform } = await import("./linux.js");
      return new LinuxAudioPlatform();
    }
    default:
      throw new Error(`Unsupported platform: ${platform()}`);
  }
}
