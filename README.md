# AudioFix.tools — Fix Your Broken Audio

It's not you. It's your computer. AudioFix.tools teaches you exactly where audio breaks on Windows and gives you tools that fix it — a PowerShell script, a system tray app, and an MCP server for AI assistants.

## What this is

A multi-page educational site + automation tools that solve the most common audio problem on Windows: the default device silently switching.

**The guide** walks users through three steps:
1. **Find your devices** — see what Windows sees, spot the impostors
2. **Test your devices** — prove which is your real speakers/mic
3. **Lock it down** — set your default, disable the rest

**The script** automates all three steps interactively: plays test tones, shows live mic meters, sets defaults across all three audio roles, and disables unused devices via PnP.

**The desktop app** (`dotnet/`) puts audio controls in the system tray and exposes them as MCP tools for Claude Desktop and Windows Copilot.

## Project structure

```
audiofix-site/
├── index.html                              # Home page — "It's not you" hub
├── guide/
│   ├── why-it-happens.html                 # Why audio defaults drift
│   ├── windows/                            # Windows guide pages
│   ├── macos/index.html                    # Coming soon placeholder
│   └── linux/index.html                    # Coming soon placeholder
├── tool/
│   ├── index.html                          # Script page — preview, Stripe checkout
│   └── thanks.html                         # Post-purchase download + email backup
├── scripts/
│   └── Win11_Audio_Troubleshooter.ps1      # The PowerShell script (source of truth)
├── worker/                                 # Cloudflare Worker — payment delivery pipeline
│   └── src/                                # Stripe webhook, signed downloads, email
├── mcp/                                    # Node.js MCP server (cross-platform)
│   └── src/                                # TypeScript — macOS, Linux, Windows via PS
├── dotnet/                                 # .NET 10 desktop app (Windows-native)
│   ├── AudioFix.Core/                      # Audio logic — direct COM interop
│   ├── AudioFix.Mcp/                       # MCP server (8 tools)
│   ├── AudioFix.Tray/                      # System tray app (Win32 P/Invoke)
│   └── AudioFix.Package/                   # MSIX packaging + Windows Copilot ODR
├── CLAUDE.md                               # AI development directives
└── README.md                               # This file
```

## Tech stack

**Site:**
- Static site — no build step, no server, no framework
- Bootstrap 5.3.3 via CDN (CSS + JS bundle + Icons)
- Google Fonts — IBM Plex Sans / IBM Plex Mono
- Stripe Payment Links — $5 one-time purchase
- Cloudflare Worker + R2 for digital delivery
- No analytics, no cookies, no tracking pixels

**Desktop app (.NET 10):**
- Direct Windows Core Audio COM interop (IMMDeviceEnumerator, IPolicyConfig, IAudioEndpointVolume, IAudioMeterInformation)
- MCP server via official .NET ModelContextProtocol SDK
- System tray via raw Win32 P/Invoke (no WinForms, no WPF)
- MSIX packaging with Windows Copilot ODR registration
- Self-contained single-file publish — no .NET runtime install needed

**Node MCP server (cross-platform):**
- TypeScript on Node.js 18+
- macOS: SwitchAudioSource + osascript + afplay
- Linux: PulseAudio/PipeWire via pactl
- Windows: PowerShell with inline C# interop

## Developing on Windows with Claude Code

To continue development on the .NET desktop app from a Windows PC:

### Prerequisites

1. **Install Claude Code** — see [claude.ai/download](https://claude.ai/download)
2. **Install .NET 10 SDK** — download from [dotnet.microsoft.com/download/dotnet/10.0](https://dotnet.microsoft.com/en-us/download/dotnet/10.0)
3. **Install Git** if not already present

### Setup

```powershell
# Clone the repo
git clone https://github.com/bogdano2/audiofix-site.git
cd audiofix-site

# Verify .NET 10
dotnet --version  # should show 10.x

# Build the solution
cd dotnet
dotnet build

# Run the tray app (will show system tray icon)
dotnet run --project AudioFix.Tray

# Run just the MCP server (headless, for testing with Claude Desktop)
dotnet run --project AudioFix.Tray -- --mcp-only
```

### Opening with Claude Code

```powershell
cd audiofix-site
claude
```

Claude Code will read `CLAUDE.md` for project directives and can build, test, and modify the code. The `.NET solution builds from macOS (cross-compilation) but the tray app and COM interop only run on Windows.

### Testing the MCP server with Claude Desktop

1. Build: `dotnet build dotnet/AudioFix.Tray`
2. Add to Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "audiofix": {
         "command": "C:\\path\\to\\audiofix-site\\dotnet\\AudioFix.Tray\\bin\\Debug\\net10.0-windows\\AudioFix.Tray.exe",
         "args": ["--mcp-only"]
       }
     }
   }
   ```
   Or run the helper script: `powershell -File dotnet\AudioFix.Package\patch-claude-config.ps1 -ExePath "C:\path\to\AudioFix.Tray.exe"`
3. Restart Claude Desktop
4. Ask Claude: "List my audio devices" or "Run audio diagnostics"

### Testing the MSIX package

MSIX packaging requires Windows + Visual Studio 2022:
1. Open `dotnet/AudioFix.slnx` in Visual Studio
2. Set `AudioFix.Package` as startup project
3. Deploy (right-click → Deploy)
4. The app registers with Windows Copilot's On-Device Agent Registry automatically

For sideloading without the Store, enable Developer Mode in Settings → System → For Developers.

## The PowerShell script

Zero-dependency PowerShell script. Uses only OS-native APIs:
- **Core Audio API** (IMMDeviceEnumerator, IAudioMeterInformation) via embedded C# interop
- **IPolicyConfig** COM interface for setting defaults across all three audio roles
- **In-memory WAV generation** for test tones (no temp files)
- **Get-PnpDevice / Disable-PnpDevice** for disabling unused devices

No network requests. No third-party modules. No data leaves the machine.

## Updating the script

1. Edit `scripts/Win11_Audio_Troubleshooter.ps1`
2. Test on Windows
3. Re-encode and embed:
   ```bash
   python3 -c "
   import base64, re
   with open('scripts/Win11_Audio_Troubleshooter.ps1', 'rb') as f:
       b64 = base64.b64encode(f.read()).decode('ascii')
   with open('tool/index.html', 'r') as f:
       html = f.read()
   html = re.sub(r'const SCRIPT_B64 = \x60[^\x60]*\x60', f'const SCRIPT_B64 = \x60{b64}\x60', html)
   with open('tool/index.html', 'w') as f:
       f.write(html)
   "
   ```
4. Upload the updated `.zip` to Cloudflare R2

## Deploying

**Site:** Push to `main` → GitHub Actions auto-deploys to GitHub Pages at `audiofix.tools`

**Worker:** `cd worker && wrangler deploy`

**Desktop app:** Build MSIX on Windows, distribute via sideloading or Microsoft Store

## Design directives

All development follows `CLAUDE.md`, which covers:
- Content philosophy (manual-first, progressive disclosure, "it's not you" framing)
- Bootstrap usage rules (components, theming, <50 lines custom CSS)
- AI-optimized SEO (JSON-LD structured data, semantic HTML, heading hierarchy)
- WCAG 2.2 AA accessibility (skip nav, landmarks, ARIA, keyboard, screen reader)
- Desktop app architecture (.NET 10, COM interop, MCP tools, MSIX packaging)
- Payment and delivery (Stripe, Cloudflare Worker, R2, Resend)

## Platform roadmap

- [x] Windows 10 & 11 — guide + script live
- [x] Windows desktop app — .NET 10 tray + MCP server (in development)
- [x] Cross-platform MCP server — Node.js (built, needs testing)
- [ ] macOS guide — planned
- [ ] Linux guide — planned
- [ ] Windows Copilot integration — MSIX + ODR registration ready (Windows preview feature)
