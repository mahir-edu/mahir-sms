import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, getAllLessonMaterials } from "../../../../firebase/firestore";

export const GET: APIRoute = async ({ cookies }) => {
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
    const user = await getUserProfile(decoded.uid);
    if (!user || user.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const materials = await getAllLessonMaterials();
    return new Response(JSON.stringify({ materials }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memuat materi." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
