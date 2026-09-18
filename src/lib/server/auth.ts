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
