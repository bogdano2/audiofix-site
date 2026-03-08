using AudioFix.Core;
using AudioFix.Core.Models;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using ModelContextProtocol.Server;
using System.ComponentModel;
using System.Text.Json;

// Standalone entry point (when running AudioFix.Mcp.exe directly)
AudioFix.Mcp.McpEntry.Run(args);

namespace AudioFix.Mcp
{
    public static class McpEntry
    {
        public static void Run(string[] args)
        {
            var builder = Host.CreateApplicationBuilder(args);

            builder.Services.AddSingleton<AudioService>();

            builder.Services.AddMcpServer()
                .WithStdioServerTransport()
                .WithToolsFromAssembly();

            var app = builder.Build();
            app.Run();
        }
    }

    // --- MCP Tool Definitions ---

    [McpServerToolType]
    public static class AudioTools
    {
        private static readonly JsonSerializerOptions JsonOpts = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = true,
        };

        [McpServerTool(Name = "list_devices")]
        [Description("List audio devices (speakers, headphones, microphones). Shows device names, IDs, current default, and state.")]
        public static string ListDevices(
            AudioService audio,
            [Description("Filter: output, input, or all")] string direction = "all")
        {
            DeviceDirection? dir = direction switch
            {
                "output" => DeviceDirection.Output,
                "input" => DeviceDirection.Input,
                _ => null,
            };
            var devices = audio.ListDevices(dir, includeDisabled: true);
            return JsonSerializer.Serialize(new { platform = "windows", direction, count = devices.Count, devices }, JsonOpts);
        }

        [McpServerTool(Name = "get_default_device")]
        [Description("Get the current default audio device for output (speakers) or input (microphone).")]
        public static string GetDefaultDevice(
            AudioService audio,
            [Description("output or input")] string direction)
        {
            var dir = direction == "input" ? DeviceDirection.Input : DeviceDirection.Output;
            var device = audio.GetDefault(dir);
            return JsonSerializer.Serialize(new { platform = "windows", direction, device }, JsonOpts);
        }

        [McpServerTool(Name = "set_default_device")]
        [Description("Change the default audio device. Use list_devices first to find the device ID.")]
        public static string SetDefaultDevice(
            AudioService audio,
            [Description("The device ID to set as default")] string deviceId)
        {
            audio.SetDefault(deviceId);
            return JsonSerializer.Serialize(new { success = true, message = $"Default audio device set to \"{deviceId}\"" });
        }

        [McpServerTool(Name = "test_device")]
        [Description("Test an audio device. Type 'tone' plays a test sound on speakers. Type 'mic' monitors microphone input level.")]
        public static string TestDevice(
            AudioService audio,
            [Description("The device ID to test")] string deviceId,
            [Description("tone or mic")] string type = "tone",
            [Description("Duration in seconds for mic test (1-10)")] int durationSeconds = 3)
        {
            if (type == "mic")
            {
                var result = audio.MonitorMicLevel(deviceId, Math.Clamp(durationSeconds, 1, 10));
                return JsonSerializer.Serialize(new
                {
                    success = true,
                    peakLevel = (int)(result.PeakLevel * 100),
                    averageLevel = (int)(result.AverageLevel * 100),
                    result.DetectedActivity,
                    message = result.DetectedActivity
                        ? $"Microphone is picking up audio (peak: {(int)(result.PeakLevel * 100)}%)"
                        : "No audio activity detected. Try speaking into the microphone.",
                }, JsonOpts);
            }

            audio.PlayTestTone();
            return JsonSerializer.Serialize(new { success = true, message = "Test tone played. Did you hear it?" });
        }

        [McpServerTool(Name = "get_volume")]
        [Description("Get the current volume level and mute state for output or input.")]
        public static string GetVolume(
            AudioService audio,
            [Description("output or input")] string direction = "output")
        {
            var dir = direction == "input" ? DeviceDirection.Input : DeviceDirection.Output;
            var info = audio.GetVolume(dir);
            return JsonSerializer.Serialize(new { platform = "windows", direction, info.Volume, info.Muted, info.DeviceName }, JsonOpts);
        }

        [McpServerTool(Name = "set_volume")]
        [Description("Set volume level (0-100) and/or mute state for output or input.")]
        public static string SetVolume(
            AudioService audio,
            [Description("output or input")] string direction,
            [Description("Volume 0-100, or -1 to leave unchanged")] int volume = -1,
            [Description("true to mute, false to unmute, null to leave unchanged")] bool? muted = null)
        {
            var dir = direction == "input" ? DeviceDirection.Input : DeviceDirection.Output;
            audio.SetVolume(dir, volume >= 0 ? volume : null, muted);

            var parts = new List<string>();
            if (volume >= 0) parts.Add($"volume to {volume}%");
            if (muted.HasValue) parts.Add(muted.Value ? "muted" : "unmuted");

            return JsonSerializer.Serialize(new { success = true, message = $"Set {direction} {string.Join(" and ", parts)}" });
        }

        [McpServerTool(Name = "toggle_device")]
        [Description("Enable or disable an audio device. Requires administrator privileges — the user will see a Windows security prompt if not already elevated. Disabling unused devices prevents unexpected audio switching.")]
        public static string ToggleDevice(
            AudioService audio,
            [Description("The device ID")] string deviceId,
            [Description("true to enable, false to disable")] bool enabled)
        {
            if (!audio.IsElevated())
            {
                return JsonSerializer.Serialize(new
                {
                    success = false,
                    message = "This operation requires administrator privileges. Right-click Claude Desktop and select 'Run as administrator', or use the AudioFix tray app which requests elevation at startup.",
                });
            }

            audio.SetDeviceEnabled(deviceId, enabled);
            return JsonSerializer.Serialize(new
            {
                success = true,
                message = $"Device \"{deviceId}\" has been {(enabled ? "enabled" : "disabled")}",
            });
        }

        [McpServerTool(Name = "diagnose")]
        [Description("Run a full audio diagnostic. Checks all devices, volume, mute state, and identifies common issues like too many active devices, Stereo Mix enabled, or low volume.")]
        public static string Diagnose(AudioService audio)
        {
            var report = DiagnosticsEngine.Run(audio);
            return JsonSerializer.Serialize(report, JsonOpts);
        }
    }
}
