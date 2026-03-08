# Patches Claude Desktop's config to register the AudioFix MCP server.
# Run during install or manually.

param(
    [string]$ExePath = "",
    [switch]$Remove
)

$configPath = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"

if (-not $ExePath -and -not $Remove) {
    # Auto-detect from package install location
    $pkg = Get-AppxPackage -Name "AppThrive.AudioFix" -ErrorAction SilentlyContinue
    if ($pkg) {
        $ExePath = Join-Path $pkg.InstallLocation "AudioFix.Tray.exe"
    } else {
        Write-Error "AudioFix package not found and no -ExePath provided."
        exit 1
    }
}

# Ensure directory exists
$configDir = Split-Path $configPath
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# Read or create config
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    $config = [PSCustomObject]@{}
}

# Ensure mcpServers key exists
if (-not $config.PSObject.Properties["mcpServers"]) {
    $config | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue ([PSCustomObject]@{})
}

if ($Remove) {
    # Remove AudioFix entry
    if ($config.mcpServers.PSObject.Properties["audiofix"]) {
        $config.mcpServers.PSObject.Properties.Remove("audiofix")
        $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
        Write-Host "Removed AudioFix from Claude Desktop config."
    } else {
        Write-Host "AudioFix was not registered in Claude Desktop config."
    }
} else {
    # Add/update AudioFix entry
    $entry = [PSCustomObject]@{
        command = $ExePath
        args = @("--mcp-only")
    }

    if ($config.mcpServers.PSObject.Properties["audiofix"]) {
        $config.mcpServers.audiofix = $entry
    } else {
        $config.mcpServers | Add-Member -NotePropertyName "audiofix" -NotePropertyValue $entry
    }

    $config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
    Write-Host "Registered AudioFix MCP server in Claude Desktop config."
    Write-Host "  Config: $configPath"
    Write-Host "  Command: $ExePath --mcp-only"
    Write-Host ""
    Write-Host "Restart Claude Desktop to activate."
}
