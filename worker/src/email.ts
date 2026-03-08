export async function sendDownloadEmail(
  to: string,
  downloadUrl: string,
  apiKey: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;padding:40px;">
        <tr><td>
          <h1 style="margin:0 0 16px;font-size:22px;color:#1a1a2e;">Your AudioFix download is ready</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a5a;">
            Thanks for your purchase! Click the button below to download your script.
            The link expires in 72 hours.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="background:#38bdf8;border-radius:6px;padding:12px 28px;">
              <a href="${downloadUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;">
                Download AudioFix.zip
              </a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#71717a;">
            The zip contains <strong>AudioFix.ps1</strong> and a README with instructions.
            Right-click the .ps1 file and select "Run with PowerShell" to get started.
          </p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#e65100;background:#fff3e0;padding:8px 12px;border-radius:4px;">
            <strong>This link expires in 72 hours.</strong> If it has expired, reply to this email and we'll send a new one.
          </p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">
            Questions? Reply to this email or visit
            <a href="https://audiofix.tools" style="color:#38bdf8;">audiofix.tools</a>.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa;">
        AudioFix.tools &mdash; Free, open, no telemetry.
      </p>
    </td></tr>
  </table>
</body>
</html>`.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "AudioFix <noreply@audiofix.tools>",
      to: [to],
      subject: "Your AudioFix download is ready",
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error:", res.status, await res.text());
  }

  return res.ok;
}
