import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, updateUserStatus } from "../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  // 1. Session verification & HQ Admin authorization check
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
  } catch (e) {
    return new Response(JSON.stringify({ error: "Sesi otentikasi tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse request body
  let targetUid = "";
  let newStatus: "active" | "suspended" | "rejected" | "pending_approval" = "active";
  let reason = "";

  try {
    const body = await request.json();
    targetUid = body.targetUid?.toString()?.trim();
    newStatus = body.newStatus;
    reason = body.reason?.toString()?.trim() || "";
  } catch {
    return new Response(JSON.stringify({ error: "Payload data tidak valid." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!targetUid || !newStatus) {
    return new Response(JSON.stringify({ error: "Parameter targetUid dan newStatus wajib diisi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Update status in Firestore
  try {
    await updateUserStatus({
      targetUid,
      newStatus,
      adminUid,
      reason,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      targetUid, 
      newStatus, 
      message: `Status akun pengguna berhasil diperbarui menjadi ${newStatus}.` 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Gagal memperbarui status pengguna." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
