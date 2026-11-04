import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { 
  getUserProfile, 
  collections, 
  getLicenseTypeById, 
  toggleLicenseTypeStatus 
} from "../../../../../firebase/firestore";

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
    const mode = body.mode || "toggle"; // "toggle" | "permanent"

    if (!id) {
      return new Response(JSON.stringify({ error: "ID tipe lisensi wajib disertakan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const pkg = await getLicenseTypeById(id);
    if (!pkg) {
      return new Response(JSON.stringify({ error: "Tipe lisensi tidak ditemukan." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (mode === "permanent") {
      // Check if any branch license is currently bound
      const boundLicenses = await collections.branchLicenses()
        .where("packageType", "==", pkg.code)
        .limit(1)
        .get();

      if (!boundLicenses.empty) {
        return new Response(JSON.stringify({
          error: `Paket lisensi "${pkg.name}" sedang digunakan oleh sekolah cabang aktif dan tidak dapat dihapus permanen. Silakan nonaktifkan (arsip) paket ini.`,
        }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await collections.licenseTypes().doc(id).delete();
      return new Response(JSON.stringify({
        success: true,
        message: `Paket lisensi "${pkg.name}" berhasil dihapus permanen.`,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    } else {
      const newStatus = body.isActive !== undefined ? Boolean(body.isActive) : !pkg.isActive;
      await toggleLicenseTypeStatus(id, newStatus);
      return new Response(JSON.stringify({
        success: true,
        isActive: newStatus,
        message: `Status paket lisensi "${pkg.name}" berhasil diubah menjadi ${newStatus ? "Aktif" : "Diarsipkan"}.`,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memproses penghapusan atau pengubahan status.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
