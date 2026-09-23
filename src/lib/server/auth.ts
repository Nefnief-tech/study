import { ENDPOINT, PROJECT_ID } from "@/lib/auth/appwrite";

/**
 * Verifies the Appwrite JWT sent by the browser (Authorization: Bearer …)
 * against the Appwrite account endpoint. Returns the user id, or null.
 */
export async function verifyUser(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${ENDPOINT}/account`, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-JWT": auth.slice(7),
      },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return (user.$id as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * AI gating ("paywall" without payments): the `ai` Appwrite team decides who
 * may spend AI credits. Members are managed by the admin in the Appwrite
 * console — a user JWT can list the teams it belongs to, so no server key is
 * needed here. Returns false when the request carries no valid JWT.
 */
export const AI_TEAM_ID = "ai";

export async function userInAiTeam(req: Request): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    const res = await fetch(`${ENDPOINT}/teams`, {
      headers: {
        "X-Appwrite-Project": PROJECT_ID,
        "X-Appwrite-JWT": auth.slice(7),
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { teams?: Array<{ $id?: string }> };
    return (data.teams ?? []).some((t) => t.$id === AI_TEAM_ID);
  } catch {
    return false;
  }
}
