import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, createBranchWithLicense } from "../../../../firebase/firestore";

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
    const name = body.name?.toString()?.trim();
    const code = body.code?.toString()?.trim()?.toUpperCase();

    if (!name || !code) {
      return new Response(JSON.stringify({ error: "Nama sekolah dan kode unit cabang wajib diisi." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await createBranchWithLicense({
      name,
      code,
      address: {
        street: body.address?.street?.toString()?.trim() || "",
        city: body.address?.city?.toString()?.trim() || "",
        province: body.address?.province?.toString()?.trim() || "",
        postalCode: body.address?.postalCode?.toString()?.trim() || "",
      },
      contact: {
        email: body.contact?.email?.toString()?.trim() || "",
        phone: body.contact?.phone?.toString()?.trim() || "",
        headmasterName: body.contact?.headmasterName?.toString()?.trim() || "",
      },
      license: {
        packageType: body.license?.packageType || "standard",
        issueDate: body.license?.issueDate,
        startDate: body.license?.startDate,
        dueDate: body.license?.dueDate,
        expiryDate: body.license?.expiryDate,
        gracePeriodDays: Number(body.license?.gracePeriodDays) || 14,
        maxTeachers: Number(body.license?.maxTeachers) || 10,
        maxStudents: Number(body.license?.maxStudents) || 100,
        allowedCurriculums: body.license?.allowedCurriculums || ["cur-math-primary-sd"],
      },
      adminUid,
    });

    return new Response(JSON.stringify({
      success: true,
      branchId: result.branchId,
      message: `Sekolah Pemancar "${name}" (${code}) dan lisensi berhasil diterbitkan.`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal membuat unit sekolah cabang." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
