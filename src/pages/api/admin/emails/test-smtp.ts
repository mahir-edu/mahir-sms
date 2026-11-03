import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../firebase/server";
import { getUserProfile } from "../../../../firebase/firestore";
import { isSmtpConfigured, sendMailDirect } from "../../../../services/mailer";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan login." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const userProfile = await getUserProfile(decoded.uid);

    if (!userProfile || userProfile.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak. Hanya Central HQ Admin yang dapat menguji SMTP." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isSmtpConfigured()) {
      return new Response(JSON.stringify({
        error: "SMTP belum dikonfigurasi di environment variables (.env). Mohon tambahkan SMTP_USER dan SMTP_PASS.",
        configured: false,
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => ({}));
    const targetEmail = (body.targetEmail || userProfile.email || "").toString().trim();

    if (!targetEmail || !targetEmail.includes("@")) {
      return new Response(JSON.stringify({ error: "Alamat email tujuan tidak valid." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const host = process.env.SMTP_HOST || "smtp.hostinger.com";
    const port = process.env.SMTP_PORT || "465";
    const sender = process.env.SMTP_USER || "";

    const res = await sendMailDirect({
      to: targetEmail,
      subject: "Uji Koneksi SMTP - Mahir School Management System",
      text: `Halo ${userProfile.displayName},\n\nKoneksi Hostinger SMTP berhasil terhubung dan siap digunakan!\nHost: ${host}:${port}\nPengirim: ${sender}\n\nMahir School Management System`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #059669; padding: 20px; text-align: center; color: white;">
            <h2 style="margin: 0; font-size: 20px;">Uji Koneksi SMTP Berhasil!</h2>
          </div>
          <div style="padding: 24px;">
            <p>Halo <strong>${userProfile.displayName}</strong>,</p>
            <p>Pesan ini mengonfirmasi bahwa konfigurasi Hostinger SMTP di Mahir SMS telah aktif dan dapat mengirimkan email secara normal.</p>
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 13px; font-family: monospace; margin: 16px 0;">
              <div><strong>SMTP Host:</strong> ${host}</div>
              <div style="margin-top: 4px;"><strong>SMTP Port:</strong> ${port}</div>
              <div style="margin-top: 4px;"><strong>Akun Pengirim:</strong> ${sender}</div>
              <div style="margin-top: 4px;"><strong>Penerima Uji:</strong> ${targetEmail}</div>
            </div>
            <p style="font-size: 13px; color: #64748b;">Seluruh notifikasi aktivasi akun, password baru, dan pengumuman sekolah kini akan dikirimkan otomatis ke inbox penerima.</p>
          </div>
          <div style="background-color: #f1f5f9; padding: 12px; text-align: center; font-size: 11px; color: #94a3b8;">
            Mahir School Management System &bull; https://mahir-edu.com
          </div>
        </div>
      `,
    });

    if (!res.success) {
      return new Response(JSON.stringify({
        success: false,
        error: res.error || "Gagal mengirim email uji.",
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      messageId: res.messageId,
      message: `Email uji coba berhasil dikirim ke ${targetEmail}!`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal memproses pengujian SMTP." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

