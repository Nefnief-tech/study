import { verifyUser } from "@/lib/server/auth";
import { fetchPortalPlan, PortalAuthError } from "@/lib/server/portal";

export const runtime = "nodejs";

/** fetches the school portal substitute plan (login + scrape, server-side) */
export async function POST(req: Request) {
  const user = await verifyUser(req);
  if (!user) {
    return Response.json({ error: "auth_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { baseUrl?: string; username?: string; password?: string }
    | null;
  const baseUrl = body?.baseUrl?.trim();
  const username = body?.username?.trim();
  const password = body?.password;
  if (!baseUrl || !username || !password) {
    return Response.json({ error: "missing_settings" }, { status: 400 });
  }

  try {
    const plan = await fetchPortalPlan(baseUrl, username, password);
    return Response.json(plan);
  } catch (e) {
    if (e instanceof PortalAuthError) {
      return Response.json({ error: "portal_auth", detail: e.message }, { status: 401 });
    }
    return Response.json(
      { error: "portal_unreachable", detail: (e as Error).message.slice(0, 200) },
      { status: 502 },
    );
  }
}
