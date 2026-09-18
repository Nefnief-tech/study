#!/usr/bin/env node
/**
 * One-time Appwrite provisioning for Semester.
 *
 * Usage:
 *   APPWRITE_PROJECT_ID=… APPWRITE_API_KEY=… node scripts/appwrite-setup.mjs
 *   (APPWRITE_ENDPOINT defaults to https://cloud.appwrite.io/v1)
 *
 * Creates (idempotent — existing resources are skipped):
 *   • a web platform for localhost:3000 (add --hostname yourhost.com for prod)
 *   • database "semester" with collection "snapshots"
 *   • attributes userId / key / data / updatedAt + a userId,key index
 *   • users-level collection permissions with document security on, so every
 *     snapshot document is readable/writable only by its owner.
 */

const endpoint = (process.env.APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1").replace(/\/+$/, "");
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!projectId || !apiKey) {
  console.error("Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY (a server API key with databases, platforms scopes).");
  process.exit(1);
}

const hostnameArg = process.argv.find((a) => a.startsWith("--hostname="));
const hostname = hostnameArg ? hostnameArg.split("=")[1] : "localhost";

const headers = {
  "content-type": "application/json",
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Key": apiKey,
};

async function api(method, path, body) {
  const res = await fetch(endpoint + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      console.error(
        `\n✗ ${method} ${path} → 401 unauthorized.\n` +
          `  This API key lacks the required scopes. Create a new key in the Appwrite console\n` +
          `  (Project → Integrations → API keys) with these scopes enabled:\n` +
          `    platforms (read, write) · databases (read, write) · collections (read, write)\n` +
          `    attributes (read, write) · indexes (read, write)\n` +
          `  Then re-run this script with the new key.\n`,
      );
      process.exit(1);
    }
    const err = new Error(`${method} ${path} → ${res.status} ${json.message ?? res.statusText}`);
    err.status = res.status;
    err.type = json.type;
    throw err;
  }
  return json;
}

async function skipExisting(label, fn) {
  try {
    await fn();
    console.log(`  ✓ created ${label}`);
  } catch (e) {
    if (e.status === 409) console.log(`  • ${label} already exists`);
    else throw e;
  }
}

async function waitAttributeAvailable(collectionId, key) {
  for (let i = 0; i < 60; i++) {
    const attr = await api(
      "GET",
      `/databases/semester/collections/${collectionId}/attributes/${key}`,
    );
    if (attr.status === "available") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`attribute ${key} did not become available in time`);
}

const DB = "semester";
const COL = "snapshots";

console.log(`Provisioning Appwrite project ${projectId} at ${endpoint}`);

try {
  await skipExisting(`web platform (${hostname}:3000)`, () =>
    api("POST", `/projects/${projectId}/platforms`, {
      platformId: hostname === "localhost" ? "localhost" : hostname.replace(/\./g, "-"),
      type: "web",
      name: hostname === "localhost" ? "Local dev" : hostname,
      hostname,
    }),
  );
} catch (e) {
  // the key may lack platforms.write — the platform can be added manually in
  // the console (Overview → Add platform → Web app → hostname)
  console.log(`  ! skipped platform: ${e.message}`);
  console.log(`    → add a Web platform for "${hostname}" manually in the Appwrite console`);
}

await skipExisting(`database "${DB}"`, () => api("POST", "/databases", { databaseId: DB, name: "Semester" }));

await skipExisting(`collection "${COL}"`, () =>
  api("POST", `/databases/${DB}/collections`, {
    collectionId: COL,
    name: "Snapshots",
    documentSecurity: true,
    permissions: ["read(users)", "create(users)", "update(users)", "delete(users)"],
  }),
);

// large string attributes may be capped depending on the Appwrite version —
// try progressively smaller sizes until one is accepted
async function createStringAttribute(key, required) {
  for (const size of [1_000_000, 400_000, 100_000, 16_000]) {
    try {
      await api("POST", `/databases/${DB}/collections/${COL}/attributes/string`, { key, size, required });
      return;
    } catch (e) {
      if (e.status !== 400) throw e;
      console.log(`  • size ${size} rejected for "${key}", trying smaller…`);
    }
  }
  throw new Error(`could not create string attribute "${key}"`);
}

console.log("Creating attributes…");
await skipExisting("attribute userId", () =>
  api("POST", `/databases/${DB}/collections/${COL}/attributes/string`, { key: "userId", size: 64, required: true }),
);
await skipExisting("attribute key", () =>
  api("POST", `/databases/${DB}/collections/${COL}/attributes/string`, { key: "key", size: 32, required: true }),
);
await skipExisting("attribute data", () => createStringAttribute("data", true));
await skipExisting("attribute updatedAt", () =>
  api("POST", `/databases/${DB}/collections/${COL}/attributes/integer`, { key: "updatedAt", required: true }),
);

console.log("Waiting for attributes to become available…");
for (const key of ["userId", "key", "data", "updatedAt"]) {
  await waitAttributeAvailable(COL, key);
}

await skipExisting("index user_key", () =>
  api("POST", `/databases/${DB}/collections/${COL}/indexes`, {
    key: "user_key",
    type: "key",
    attributes: ["userId", "key"],
  }),
);

console.log(`
✓ Done. Now set these in .env.local and restart the dev server:

NEXT_PUBLIC_APPWRITE_ENDPOINT=${endpoint}
NEXT_PUBLIC_APPWRITE_PROJECT_ID=${projectId}
`);
