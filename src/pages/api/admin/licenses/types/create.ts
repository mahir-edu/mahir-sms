import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { getUserProfile, createLicenseType } from "../../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk kembali." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let adminUid = "";
  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    adminUid = decoded.uid;
    const adminProfile = await getUserProfile(adminUid);
    if (!adminProfile || adminProfile.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak. Tindakan ini hanya dapat dilakukan oleh Central HQ Administrator." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Sesi otentikasi tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const name = body.name?.toString()?.trim();
    const code = body.code?.toString()?.trim();
    const description = body.description?.toString()?.trim() || "";
    const defaultPrice = Number(body.defaultPrice);
    const billingCycle = body.billingCycle || "yearly";
    const defaultMaxStudents = Number(body.defaultMaxStudents);
    const defaultMaxTeachers = Number(body.defaultMaxTeachers);
    const defaultGracePeriodDays = body.defaultGracePeriodDays !== undefined ? Number(body.defaultGracePeriodDays) : 14;
    const allowedMaterialTiers = Array.isArray(body.allowedMaterialTiers) ? body.allowedMaterialTiers : ["standard"];
    const allowedCurriculumIds = Array.isArray(body.allowedCurriculumIds) ? body.allowedCurriculumIds : [];
    const includedMaterialIds = Array.isArray(body.includedMaterialIds) ? body.includedMaterialIds : [];
    
    // Process features list from string or array
    let features: string[] = [];
    if (Array.isArray(body.features)) {
      features = body.features.map((f: any) => f.toString().trim()).filter(Boolean);
    } else if (typeof body.features === "string") {
      features = body.features.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
    }

    if (!name || !code) {
      return new Response(JSON.stringify({ error: "Nama paket dan kode slug lisensi wajib diisi." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (isNaN(defaultPrice) || defaultPrice < 0) {
      return new Response(JSON.stringify({ error: "Harga default tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const typeId = await createLicenseType({
      name,
      code,
      description,
      defaultPrice,
      billingCycle,
      defaultMaxStudents: defaultMaxStudents || 100,
      defaultMaxTeachers: defaultMaxTeachers || 10,
      defaultGracePeriodDays,
      allowedMaterialTiers,
      allowedCurriculumIds,
      includedMaterialIds,
      features,
      order: Number(body.order) || 99,
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      id: typeId,
      message: `Tipe lisensi "${name}" berhasil dibuat!`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal membuat tipe lisensi.",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
