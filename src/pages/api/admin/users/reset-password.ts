import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile, queueEmailNotification } from "../../../../firebase/firestore";

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
    const email = body.email?.toString()?.toLowerCase()?.trim();

    if (!email) {
      return new Response(JSON.stringify({ error: "Email pengguna diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const resetLink = await auth.generatePasswordResetLink(email);

    // Queue email alert
    await queueEmailNotification({
      to: email,
      subject: "Permintaan Atur Ulang Password Mahir SMS",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #484b77;">Atur Ulang Kata Sandi Akun Mahir SMS</h2>
          <p>Halo,</p>
          <p>Administrator telah membuatkan tautan pengaturan ulang kata sandi (reset password) untuk akun Anda.</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Atur Ulang Password Sekarang &rarr;
            </a>
          </p>
          <p style="font-size: 11px; color: #666;">Atau salin tautan berikut ke peramban Anda:<br>${resetLink}</p>
          <br>
          <p style="font-size: 12px; color: #888;">Mahir School Management System &bull; Pesan Otomatis</p>
        </div>
      `,
      metadata: {
        notificationType: "school_announcement",
        branchId: "central",
      },
    });

    return new Response(JSON.stringify({
      success: true,
      message: `Tautan reset password telah dibuat dan dikirim ke email ${email}.`,
      resetLink,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal membuat tautan reset password." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
