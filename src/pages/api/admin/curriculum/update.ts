import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, updateCurriculum } from "../../../../firebase/firestore";

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
      return new Response(JSON.stringify({ error: "ID kurikulum diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await updateCurriculum(id, {
      title: body.title,
      subject: body.subject,
      gradeLevel: body.gradeLevel !== undefined ? Number(body.gradeLevel) : undefined,
      gradeCategory: body.gradeCategory,
      version: body.version,
      description: body.description,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Data kurikulum berhasil diperbarui.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memperbarui kurikulum." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
