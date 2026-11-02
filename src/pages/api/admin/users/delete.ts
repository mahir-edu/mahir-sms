import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, deleteUserComplete } from "../../../../firebase/firestore";

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
    const targetUid = body.targetUid?.toString()?.trim();
    const mode = body.mode === "permanent" ? "permanent" : "soft";

    if (!targetUid) {
      return new Response(JSON.stringify({ error: "Target UID pengguna diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = await deleteUserComplete({
      targetUid,
      adminUid,
      mode,
    });

    return new Response(JSON.stringify({
      success: true,
      message: result.message,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal menghapus pengguna." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};

