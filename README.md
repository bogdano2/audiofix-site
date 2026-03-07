# AudioFix.tools — Fix Your Broken Audio

It's not you. It's your computer. AudioFix.tools teaches you exactly where audio breaks on Windows and gives you a script that fixes it in 2 minutes.

## What this is

A multi-page educational site + PowerShell automation script that solves the most common audio problem on Windows: the default device silently switching.

**The guide** walks users through three steps:
1. **Find your devices** — see what Windows sees, spot the impostors
2. **Test your devices** — prove which is your real speakers/mic
3. **Lock it down** — set your default, disable the rest

**The script** automates all three steps interactively: plays test tones, shows live mic meters, sets defaults across all three audio roles, and disables unused devices via PnP.

## Project structure

```
audiofix-site/
├── index.html                              # Home page — "It's not you" hub
├── guide/
│   ├── why-it-happens.html                 # Why audio defaults drift
│   ├── find-your-devices.html              # Find and identify devices
│   ├── test-your-devices.html              # Test output and input
│   ├── lock-it-down.html                   # Set defaults, disable unused
│   ├── fix-macos.html                      # Coming soon placeholder
│   └── fix-linux.html                      # Coming soon placeholder
├── tool/
│   └── index.html                          # Script page — preview, checkout, docs
├── scripts/
│   └── Win11_Audio_Troubleshooter.ps1      # The PowerShell script (source of truth)
├── Audio-Troubleshooting/                  # Source docs (output/input troubleshooting)
├── Audio-Settings-Navigation/              # Source docs (keyboard navigation guides)
├── CLAUDE.md                               # AI development directives
├── 404.html                                # Styled 404 page
├── robots.txt                              # Allow all crawlers
├── sitemap.xml                             # All public URLs
├── netlify.toml                            # Netlify config (optional)
└── README.md                               # This file
```

## Tech stack

- **Static site** — no build step, no server, no framework
- **Bootstrap 5.3.3** via CDN (CSS + JS bundle + Icons)
- **Google Fonts** — IBM Plex Sans / IBM Plex Mono
- **LemonSqueezy** — pay-what-you-want checkout overlay for script download
- **Vanilla JS** — color mode toggle, script preview (~30 lines total)
- **No analytics, no cookies, no tracking pixels**

## The script

Zero-dependency PowerShell script. Uses only OS-native APIs:
- **Core Audio API** (IMMDeviceEnumerator, IAudioMeterInformation) via embedded C# interop
- **IPolicyConfig** COM interface for setting defaults across all three audio roles
- **In-memory WAV generation** for test tones (no temp files)
- **Get-PnpDevice / Disable-PnpDevice** for disabling unused devices

No network requests. No third-party modules. No data leaves the machine.

The script is embedded in `tool/index.html` as base64 for the code preview. The source of truth is `scripts/Win11_Audio_Troubleshooter.ps1`.

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
4. Also upload the updated `.ps1` to LemonSqueezy as the downloadable product file

## Deploying

Static site — drop on any host:
- **Netlify** — `netlify.toml` included, drag-and-drop or connect repo
- **GitHub Pages** — enable in repo settings
- **Cloudflare Pages** — connect repo or drag-and-drop
- **Any web host** — upload via FTP/SFTP

## Design directives

All development follows `CLAUDE.md`, which covers:
- Content philosophy (nugget format, progressive disclosure, "it's not you" framing)
- Bootstrap usage rules (components, theming, <50 lines custom CSS)
- AI-optimized SEO (JSON-LD structured data, semantic HTML, heading hierarchy)
- WCAG 2.2 AA accessibility (skip nav, landmarks, ARIA, keyboard, screen reader)
- Deployment constraints (static only, no telemetry, privacy-respecting)

## Platform roadmap

- [x] Windows 10 & 11 — live
- [ ] macOS — planned (CoreAudio + Audio MIDI Setup)
- [ ] Linux — planned (PulseAudio/PipeWire)
- [ ] GUI companion app — planned
