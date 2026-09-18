import { deleteDocument, getDocument } from "@/lib/server/storage";
import { verifyUser } from "@/lib/server/auth";
import { appwriteConfigured } from "@/lib/auth/appwrite";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (appwriteConfigured) {
    const user = await verifyUser(req);
    const doc = await getDocument(id);
    if (!user || !doc || doc.owner !== user) {
      return Response.json({ error: "auth_required" }, { status: 401 });
    }
  }
  await deleteDocument(id);
  return Response.json({ ok: true });
}
