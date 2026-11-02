import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { app } from "../../../../firebase/server";
import { getUserProfile, collections } from "../../../../firebase/firestore";
import type { UserRole, UserStatus } from "../../../../types/database";

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

    if (!targetUid) {
      return new Response(JSON.stringify({ error: "Target UID pengguna diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userDocRef = collections.users().doc(targetUid);
    const existingDoc = await userDocRef.get();
    if (!existingDoc.exists) {
      return new Response(JSON.stringify({ error: "Pengguna tidak ditemukan." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const existingData = existingDoc.data()!;
    const newDisplayName = body.displayName?.toString()?.trim() || existingData.displayName;
    const newPhoneNumber = body.phoneNumber !== undefined ? body.phoneNumber.toString().trim() : (existingData.phoneNumber || "");
    const newRole: UserRole = body.role || existingData.role;
    const newBranchId = body.branchId !== undefined ? (body.branchId ? body.branchId.toString().trim() : null) : existingData.branchId;
    const newStatus: UserStatus = body.status || existingData.status;

    // 1. Update Firebase Auth user
    try {
      await auth.updateUser(targetUid, {
        displayName: newDisplayName,
        phoneNumber: newPhoneNumber.startsWith("+") ? newPhoneNumber : undefined,
      });
    } catch (e: any) {
      console.warn("Auth updateUser warning:", e.message);
    }

    // 2. Sync Custom User Claims if role or branch changed
    if (newRole !== existingData.role || newBranchId !== existingData.branchId) {
      await auth.setCustomUserClaims(targetUid, {
        role: newRole,
        branchId: newBranchId,
      });
    }

    // 3. Update Firestore User Document
    const updatePayload: Record<string, any> = {
      displayName: newDisplayName,
      phoneNumber: newPhoneNumber,
      role: newRole,
      branchId: newBranchId,
      status: newStatus,
      updatedAt: Timestamp.now(),
    };

    if (body.teacherMetadata && newRole === "teacher") {
      updatePayload["teacherMetadata.nip"] = body.teacherMetadata.nip?.toString()?.trim() || "";
      updatePayload["teacherMetadata.specialization"] = body.teacherMetadata.specialization?.toString()?.trim() || "Matematika Multisensori";
    }

    await userDocRef.update(updatePayload);

    return new Response(JSON.stringify({
      success: true,
      message: `Profil akun ${newDisplayName} berhasil diperbarui.`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memperbarui profil pengguna." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
