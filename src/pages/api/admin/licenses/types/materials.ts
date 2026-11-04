import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { getUserProfile, updateLicenseMaterials } from "../../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk kembali." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const adminProfile = await getUserProfile(decoded.uid);
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
    const id = body.id?.toString()?.trim();

    if (!id) {
      return new Response(JSON.stringify({ error: "ID tipe lisensi wajib disertakan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allowedCurriculumIds = Array.isArray(body.allowedCurriculumIds) ? body.allowedCurriculumIds : [];
    const includedMaterialIds = Array.isArray(body.includedMaterialIds) ? body.includedMaterialIds : [];
    const allowedMaterialTiers = Array.isArray(body.allowedMaterialTiers) ? body.allowedMaterialTiers : [];

    await updateLicenseMaterials(id, {
      allowedCurriculumIds,
      includedMaterialIds,
      allowedMaterialTiers,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Hak akses materi dan kurikulum untuk paket lisensi berhasil disimpan!",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memperbarui hak akses materi.",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};

