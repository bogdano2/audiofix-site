import { Env } from "./types";
import { handleWebhook } from "./webhook";
import { handleDownload } from "./download";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    if (request.method === "GET" && url.pathname === "/dl") {
      return handleDownload(request, env);
    }

    return new Response("Not Found", { status: 404 });
  },
};
