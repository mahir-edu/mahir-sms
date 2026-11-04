import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { getUserProfile, createLessonPlan } from "../../../../../firebase/firestore";

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
    const curriculumId = body.curriculumId?.toString()?.trim();
    const moduleNumber = Number(body.moduleNumber);
    const topicTitle = body.topicTitle?.toString()?.trim();
    const methodologySteps = Array.isArray(body.methodologySteps) ? body.methodologySteps : [];
    const learningObjectives = Array.isArray(body.learningObjectives) ? body.learningObjectives : [];
    const materialsNeeded = Array.isArray(body.materialsNeeded) ? body.materialsNeeded : [];
    const linkedMaterialIds = Array.isArray(body.linkedMaterialIds) ? body.linkedMaterialIds : [];

    if (!curriculumId || !topicTitle || isNaN(moduleNumber)) {
      return new Response(JSON.stringify({ error: "Curriculum ID, Nomor Modul, dan Judul Topik wajib diisi." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const id = await createLessonPlan({
      curriculumId,
      moduleNumber,
      topicTitle,
      methodologySteps,
      learningObjectives,
      materialsNeeded,
      linkedMaterialIds,
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      id,
      message: `Modul ${moduleNumber}: "${topicTitle}" berhasil ditambahkan.`,
    }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal menambahkan modul RPP." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
