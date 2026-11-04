import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, createLessonMaterial } from "../../../../firebase/firestore";
import type { MaterialType } from "../../../../types/database";

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
      return new Response(JSON.stringify({ error: "Akses ditolak. Hanya Central HQ Admin yang dapat mengunggah materi." }), {
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
    const description = body.description?.toString()?.trim() || "";
    const materialType = body.materialType as MaterialType || "worksheet";
    const curriculumId = body.curriculumId?.toString()?.trim();
    const lessonPlanId = body.lessonPlanId?.toString()?.trim();
    const requiredPackageTier = body.requiredPackageTier?.toString() || "standard";
    const materialTier = body.materialTier as ('standard' | 'multisensory_kit' | 'premium') || "standard";
    const fileUrl = body.fileUrl?.toString()?.trim();
    const fileName = body.fileName?.toString()?.trim() || "document.pdf";
    const fileSizeBytes = Number(body.fileSizeBytes) || 0;
    const mimeType = body.mimeType?.toString() || "application/pdf";
    const isRestricted = body.isRestricted !== undefined ? Boolean(body.isRestricted) : true;
    const version = body.version?.toString() || "1.0";

    if (!title || !curriculumId || !fileUrl) {
      return new Response(JSON.stringify({ error: "Judul, Kurikulum, dan URL / Berkas File wajib diisi." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const materialId = await createLessonMaterial({
      curriculumId,
      lessonPlanId,
      title,
      description,
      materialType,
      requiredPackageTier,
      materialTier,
      fileUrl,
      fileName,
      fileSizeBytes,
      mimeType,
      isRestricted,
      version,
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      id: materialId,
      message: `Aset materi "${title}" berhasil diterbitkan.`,
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal menerbitkan aset materi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
