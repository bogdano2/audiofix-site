namespace AudioFix.Tray;

static class Program
{
    static void Main(string[] args)
    {
        bool mcpOnly = args.Contains("--mcp-only");

        if (mcpOnly)
        {
            // Headless mode: MCP server only, no tray icon.
            // Used when Claude Desktop or Copilot launches the process.
            AudioFix.Mcp.McpEntry.Run(args);
            return;
        }

        // Default mode: tray icon + MCP server running together.
        // MCP listens on stdin/stdout on a background thread.
        // Tray runs the Win32 message loop on the main thread.
        var mcpThread = new Thread(() =>
        {
            try { AudioFix.Mcp.McpEntry.Run(args); }
            catch { /* MCP exits when stdin closes — that's fine */ }
        })
        {
            IsBackground = true,
            Name = "MCP Server",
        };
        mcpThread.Start();

        using var tray = new TrayApp();
        tray.Run();
    }
}
