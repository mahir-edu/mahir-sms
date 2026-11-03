import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, collections, getStudentsForBranch, getStaffForBranch } from "../../../../firebase/firestore";

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
    const branchId = body.branchId?.toString()?.trim();
    const mode = body.mode === "permanent" ? "permanent" : "soft";

    if (!branchId) {
      return new Response(JSON.stringify({ error: "ID unit cabang diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (mode === "permanent") {
      // Safety check: check if branch has active students
      const students = await getStudentsForBranch(branchId);
      if (students.length > 0) {
        return new Response(JSON.stringify({
          error: `Tidak dapat menghapus cabang ini karena masih terdapat ${students.length} siswa aktif. Pindahkan siswa terlebih dahulu atau gunakan penangguhan sementara.`
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await collections.branches().doc(branchId).delete();
      return new Response(JSON.stringify({
        success: true,
        message: "Unit cabang sekolah berhasil dihapus permanen.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      // Soft suspend
      await collections.branches().doc(branchId).update({
        licenseStatus: "suspended",
      });
      return new Response(JSON.stringify({
        success: true,
        message: "Unit cabang sekolah berhasil ditangguhkan.",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memproses penghapusan cabang." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};

