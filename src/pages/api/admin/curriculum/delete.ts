import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, deleteCurriculum, getCurriculumById, updateCurriculum } from "../../../../firebase/firestore";

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
    const action = body.action || "archive"; // "archive" | "permanent"

    if (!id) {
      return new Response(JSON.stringify({ error: "ID kurikulum diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const curr = await getCurriculumById(id);
    if (!curr) {
      return new Response(JSON.stringify({ error: "Kurikulum tidak ditemukan." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (action === "archive") {
      await updateCurriculum(id, { isActive: !curr.isActive });
      return new Response(JSON.stringify({
        success: true,
        message: curr.isActive ? "Kurikulum berhasil dinonaktifkan." : "Kurikulum berhasil diaktifkan kembali.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      await deleteCurriculum(id);
      return new Response(JSON.stringify({
        success: true,
        message: "Kurikulum berhasil dihapus permanen.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memproses kurikulum." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
