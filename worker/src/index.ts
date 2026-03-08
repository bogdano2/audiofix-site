import { Env } from "./types";
import { handleWebhook } from "./webhook";
import { handleDownload } from "./download";
import { handleSessionDownload } from "./session";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight for /session-download
    if (request.method === "OPTIONS" && url.pathname === "/session-download") {
      const origin = request.headers.get("Origin") || "";
      const allowed = origin.endsWith("audiofix.tools") ? origin : "";
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": allowed,
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/dl") {
      return handleDownload(request, env);
    }

    if (request.method === "GET" && url.pathname === "/session-download") {
      return handleSessionDownload(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
