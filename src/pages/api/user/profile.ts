import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";
import { updateUserSelfProfile } from "../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk kembali." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let uid = "";
  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    uid = decoded.uid;
  } catch {
    return new Response(JSON.stringify({ error: "Sesi otentikasi tidak valid atau telah kedaluwarsa." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const displayName = body.displayName?.toString()?.trim();
    const phoneNumber = body.phoneNumber?.toString()?.trim() || "";

    if (!displayName) {
      return new Response(JSON.stringify({ error: "Nama lengkap tidak boleh kosong." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Update Firebase Auth displayName (and phoneNumber if valid E.164)
    const authUpdatePayload: Record<string, any> = { displayName };
    if (phoneNumber.startsWith("+")) {
      authUpdatePayload.phoneNumber = phoneNumber;
    }
    await auth.updateUser(uid, authUpdatePayload).catch((e: any) => {
      console.warn("Auth profile update warning:", e.message);
    });

    // 2. Update Firestore user document & related stakeholder records
    await updateUserSelfProfile(uid, {
      displayName,
      phoneNumber,
      teacherMetadata: body.teacherMetadata ? {
        nip: body.teacherMetadata.nip?.toString()?.trim() || "",
        specialization: body.teacherMetadata.specialization?.toString()?.trim() || "",
      } : undefined,
      emailPreferences: body.emailPreferences ? {
        attendanceAlerts: Boolean(body.emailPreferences.attendanceAlerts),
        gradeAnnouncements: Boolean(body.emailPreferences.gradeAnnouncements),
        generalAnnouncements: Boolean(body.emailPreferences.generalAnnouncements),
      } : undefined,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Profil dan informasi kontak Anda berhasil diperbarui!",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memperbarui profil pengguna.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

