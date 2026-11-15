import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { api } from "./server/api";
import { trialRoomApi } from "./server/trial-room";
import { trialRoomApiPath } from "./lib/trial-room";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function protectResponse(response: Response, noStore: boolean, denyFraming: boolean): Response {
  if (!noStore && !denyFraming) return response;

  const headers = new Headers(response.headers);
  if (noStore) headers.set("Cache-Control", "private, no-store");
  if (denyFraming) {
    headers.append("Content-Security-Policy", "frame-ancestors 'none'");
    headers.set("X-Frame-Options", "DENY");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function securityPath(pathname: string): string {
  // The router accepts percent-encoded letters in static route segments.
  return pathname
    .replace(/%([\da-f]{2})/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .toLowerCase()
    .replace(/\/+$/, "");
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const { hostname, pathname } = new URL(request.url);
    const path = securityPath(pathname);
    const isApi = path === "/api" || path.startsWith("/api/");
    const isStaffPage = path === "/admin" || path.startsWith("/admin/") || path === "/admin-login";
    // The Lovable editor embeds its own preview. Railway serves the live staff app.
    const denyFraming = isStaffPage && hostname.endsWith(".up.railway.app");
    const noStore = isApi || isStaffPage;

    try {
      if (pathname === trialRoomApiPath) return trialRoomApi.fetch(request);
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        return protectResponse(await api.fetch(request), noStore, denyFraming);
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return protectResponse(
        await normalizeCatastrophicSsrResponse(response),
        noStore,
        denyFraming,
      );
    } catch (error) {
      console.error(error);
      const response = new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
      return protectResponse(response, noStore, denyFraming);
    }
  },
};
