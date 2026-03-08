#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPlatform } from "./platform/detect.js";
import { AudioPlatform } from "./platform/base.js";

import { listDevicesSchema, listDevices } from "./tools/list-devices.js";
import { getDefaultSchema, getDefault } from "./tools/get-default.js";
import { setDefaultSchema, setDefault } from "./tools/set-default.js";
import { testDeviceSchema, testDevice } from "./tools/test-device.js";
import { getVolumeSchema, getVolume } from "./tools/get-volume.js";
import { setVolumeSchema, setVolume } from "./tools/set-volume.js";
import { toggleDeviceSchema, toggleDevice } from "./tools/toggle-device.js";
import { diagnoseSchema, diagnose } from "./tools/diagnose.js";

let platform: AudioPlatform;

const server = new McpServer({
  name: "audiofix",
  version: "1.0.0",
});

function toolResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }], isError: true };
}

// --- Tool registrations ---

server.tool(
  "list_devices",
  "List audio devices (speakers, headphones, microphones). Shows device names, IDs, and which is currently the default.",
  listDevicesSchema.shape,
  async (input) => {
    try {
      return toolResult(await listDevices(platform, listDevicesSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_default_device",
  "Get the current default audio device for output (speakers) or input (microphone).",
  getDefaultSchema.shape,
  async (input) => {
    try {
      return toolResult(await getDefault(platform, getDefaultSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "set_default_device",
  "Change the default audio device. Use list_devices first to find the device ID.",
  setDefaultSchema.shape,
  async (input) => {
    try {
      return toolResult(await setDefault(platform, setDefaultSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "test_device",
  "Test an audio device by playing a tone (output) or monitoring mic level (input).",
  testDeviceSchema.shape,
  async (input) => {
    try {
      return toolResult(await testDevice(platform, testDeviceSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "get_volume",
  "Get the current volume level and mute state for output or input.",
  getVolumeSchema.shape,
  async (input) => {
    try {
      return toolResult(await getVolume(platform, getVolumeSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "set_volume",
  "Set volume level (0-100) and/or mute state for output or input.",
  setVolumeSchema.shape,
  async (input) => {
    try {
      return toolResult(await setVolume(platform, setVolumeSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "toggle_device",
  "Enable or disable an audio device (Windows only). Disabling unused devices prevents unexpected audio switching.",
  toggleDeviceSchema.shape,
  async (input) => {
    try {
      return toolResult(await toggleDevice(platform, toggleDeviceSchema.parse(input)));
    } catch (err) {
      return errorResult(err);
    }
  }
);

server.tool(
  "diagnose",
  "Run a full audio diagnostic. Checks all devices, volume, mute state, and identifies common issues like too many active devices, Stereo Mix enabled, or low volume.",
  diagnoseSchema.shape,
  async () => {
    try {
      return toolResult(await diagnose(platform));
    } catch (err) {
      return errorResult(err);
    }
  }
);

// --- Start ---

async function main() {
  platform = await createPlatform();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
