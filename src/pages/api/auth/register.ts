import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";

export const POST: APIRoute = async ({ request, redirect }) => {
  const auth = getAuth(app);

  let email = "";
  let password = "";
  let name = "";
  let isJson = false;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    isJson = true;
    try {
      const body = await request.json();
      email = body.email?.toString()?.trim() || "";
      password = body.password?.toString() || "";
      name = body.name?.toString()?.trim() || "";
    } catch {
      // Body parse error
    }
  } else {
    try {
      const formData = await request.formData();
      email = formData.get("email")?.toString()?.trim() || "";
      password = formData.get("password")?.toString() || "";
      name = formData.get("name")?.toString()?.trim() || "";
    } catch {
      // FormData parse error
    }
  }

  if (!email || !password || !name) {
    const errorMsg = "Semua bidang (Nama, Email, Kata Sandi) wajib diisi.";
    if (isJson) {
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(errorMsg, { status: 400 });
  }

  if (password.length < 6) {
    const errorMsg = "Kata sandi minimal harus terdiri dari 6 karakter.";
    if (isJson) {
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(errorMsg, { status: 400 });
  }

  /* Create user */
  try {
    await auth.createUser({
      email,
      password,
      displayName: name,
    });
  } catch (error: any) {
    let errorMsg = "Terjadi kesalahan saat membuat akun.";
    if (error.code === "auth/email-already-exists") {
      errorMsg = "Alamat email sudah terdaftar. Silakan gunakan email lain atau masuk ke akun Anda.";
    } else if (error.code === "auth/invalid-email") {
      errorMsg = "Format alamat email tidak valid.";
    } else if (error.code === "auth/invalid-password") {
      errorMsg = "Kata sandi tidak valid. Minimal 6 karakter.";
    }

    if (isJson) {
      return new Response(JSON.stringify({ error: errorMsg }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(errorMsg, { status: 400 });
  }

  if (isJson) {
    return new Response(JSON.stringify({ success: true, redirect: "/signin?registered=success" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return redirect("/signin?registered=success");
};