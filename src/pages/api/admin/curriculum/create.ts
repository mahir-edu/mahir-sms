import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, createCurriculum } from "../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);
  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let adminUid = "";
  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    adminUid = decoded.uid;
    const admin = await getUserProfile(adminUid);
    if (!admin || admin.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak. Hanya Central HQ Admin yang dapat membuat kurikulum master." }), {
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
    const title = body.title?.toString()?.trim();
    const subject = body.subject?.toString()?.trim();
    const gradeLevel = Number(body.gradeLevel);
    const gradeCategory = body.gradeCategory?.toString()?.trim();
    const version = body.version?.toString()?.trim() || "2026.1";
    const description = body.description?.toString()?.trim() || "";
    const customId = body.id?.toString()?.trim();

    if (!title || !subject) {
      return new Response(JSON.stringify({ error: "Judul dan Mata Pelajaran wajib diisi." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const curriculumId = await createCurriculum({
      id: customId || undefined,
      title,
      subject,
      gradeLevel: isNaN(gradeLevel) ? 1 : gradeLevel,
      gradeCategory,
      version,
      description,
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      id: curriculumId,
      message: `Kurikulum "${title}" berhasil diterbitkan.`,
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal menerbitkan kurikulum." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
