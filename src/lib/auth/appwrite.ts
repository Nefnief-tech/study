import { Account, Client, Databases, Storage } from "appwrite";

/**
 * Appwrite powers auth + cloud sync.
 * Endpoint + project id are public client values (safe to ship to the browser);
 * env vars override the defaults if you ever need a different project.
 */

export const ENDPOINT = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
export const PROJECT_ID = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "6aac46e3001a9ef65b25";

export const DATABASE_ID = "semester";
export const SNAPSHOTS_COLLECTION_ID = "snapshots";
export const CHATS_COLLECTION_ID = "chats";
export const DECKS_COLLECTION_ID = "decks";
export const STORAGE_BUCKET_ID = "study-files";

export const appwriteConfigured = Boolean(ENDPOINT && PROJECT_ID);

const client = appwriteConfigured
  ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID)
  : null;

export const account = client ? new Account(client) : null;
export const databases = client ? new Databases(client) : null;
export const storage = client ? new Storage(client) : null;
export const appwriteClient = client;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!account) return null;
  try {
    const user = await account.get();
    return { id: user.$id, email: user.email, name: user.name || user.email };
  } catch {
    return null;
  }
}

/** confirms the SDK setup — logged once at app start (see AppShell) */
export async function pingAppwrite(): Promise<string> {
  if (!client) throw new Error("Appwrite is not configured");
  if (typeof (client as { ping?: () => Promise<string> }).ping === "function") {
    return (client as { ping: () => Promise<string> }).ping();
  }
  const res = await fetch(`${ENDPOINT}/ping`, {
    headers: { "X-Appwrite-Project": PROJECT_ID },
  });
  return res.text();
}

let cachedJwt: { token: string; at: number } | null = null;

/** mint (or reuse a <10 min old) Appwrite JWT — throws when it can't */
export async function getAppwriteJwt(forceRefresh = false): Promise<string> {
  if (!account) throw new Error("Auth is not configured");
  if (!forceRefresh && cachedJwt && Date.now() - cachedJwt.at <= 10 * 60 * 1000) {
    return cachedJwt.token;
  }
  const { jwt } = await account.createJWT();
  cachedJwt = { token: jwt, at: Date.now() };
  return jwt;
}

/**
 * Authorization header carrying a short-lived Appwrite JWT (cached ~10 min),
 * used to authenticate browser → Next.js API route calls.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!account) return {};
  try {
    const jwt = await getAppwriteJwt();
    return { authorization: `Bearer ${jwt}` };
  } catch {
    return {};
  }
}

/**
 * Headers for direct browser → Appwrite row REST calls. Appwrite wants its
 * JWT in `X-Appwrite-JWT` (the Bearer variant is kept for compatibility).
 * Throws when no JWT can be minted — callers surface that instead of silently
 * sending an unauthenticated request.
 */
export async function getAppwriteJwtHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const jwt = await getAppwriteJwt(forceRefresh);
  return {
    "X-Appwrite-JWT": jwt,
    authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
  };
}
