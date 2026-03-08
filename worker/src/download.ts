import { Env } from "./types";
import { verifyToken } from "./token";

const ERROR_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Download — AudioFix</title>
  <style>
    body { margin:0; padding:40px 20px; background:#f4f4f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#1a1a2e; text-align:center; }
    .box { max-width:440px; margin:80px auto; background:#fff; border-radius:8px; padding:40px; }
    h1 { font-size:20px; margin:0 0 12px; }
    p { font-size:15px; line-height:1.6; color:#4a4a5a; margin:0 0 16px; }
    a { color:#38bdf8; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Download link expired</h1>
    <p>This download link has expired or is invalid. Download links are valid for 72 hours after purchase.</p>
    <p>If you need a new link, reply to your purchase confirmation email or contact us at <a href="https://audiofix.tools">audiofix.tools</a>.</p>
  </div>
</body>
</html>`.trim();

export async function handleDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(ERROR_HTML, {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const payload = await verifyToken(token, env.HMAC_SECRET);
  if (!payload) {
    return new Response(ERROR_HTML, {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const object = await env.DOWNLOADS_BUCKET.get("AudioFix.zip");
  if (!object) {
    return new Response("File not found. Please contact support.", {
      status: 404,
    });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="AudioFix.zip"',
      "Content-Length": object.size.toString(),
      "Cache-Control": "no-store",
    },
  });
}
