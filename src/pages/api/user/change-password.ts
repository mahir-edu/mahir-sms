import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";

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
    const newPassword = body.newPassword?.toString();
    const confirmPassword = body.confirmPassword?.toString();

    if (!newPassword || newPassword.length < 6) {
      return new Response(JSON.stringify({
        error: "Kata sandi baru minimal 6 karakter sesuai standar keamanan.",
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (newPassword !== confirmPassword) {
      return new Response(JSON.stringify({
        error: "Konfirmasi kata sandi baru tidak cocok. Silakan periksa kembali.",
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Update password in Firebase Auth
    await auth.updateUser(uid, {
      password: newPassword,
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Kata sandi Anda berhasil diperbarui! Silakan gunakan kata sandi baru saat login berikutnya.",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal mengubah kata sandi akun.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

