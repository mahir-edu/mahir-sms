import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, deleteLessonMaterial } from "../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);
  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const admin = await getUserProfile(decoded.uid);
    if (!admin || admin.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Sesi tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const id = body.id?.toString()?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: "ID materi diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await deleteLessonMaterial(id);

    return new Response(JSON.stringify({
      success: true,
      message: "Aset materi berhasil dihapus.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal menghapus materi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
