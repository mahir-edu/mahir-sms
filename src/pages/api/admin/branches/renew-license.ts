import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, renewBranchLicense } from "../../../../firebase/firestore";

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
      return new Response(JSON.stringify({ error: "Akses ditolak. Tindakan ini hanya dapat dilakukan oleh Central HQ Admin." }), {
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
    const licenseId = body.licenseId?.toString()?.trim();

    if (!licenseId) {
      return new Response(JSON.stringify({ error: "ID lisensi cabang diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await renewBranchLicense(licenseId, {
      packageType: body.packageType,
      dueDate: body.dueDate,
      expiryDate: body.expiryDate,
      maxStudents: body.maxStudents,
      maxTeachers: body.maxTeachers,
      gracePeriodDays: body.gracePeriodDays,
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Kontrak lisensi cabang berhasil diperpanjang dan diaktifkan kembali.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memperpanjang lisensi cabang." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
