import type { APIRoute } from "astro";
import { app } from "../../../firebase/server";
import { getAuth } from "firebase-admin/auth";

const handleSignIn: APIRoute = async ({ request, cookies, redirect }) => {
  const auth = getAuth(app);

  /* Extract token from Authorization header or body */
  let idToken = (request.headers.get("Authorization") || request.headers.get("authorization"))?.split("Bearer ")[1];

  if (!idToken && request.method === "POST") {
    try {
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await request.json();
        idToken = body.idToken;
      }
    } catch {
      // Body parsing fallback
    }
  }

  if (!idToken) {
    return new Response(JSON.stringify({ error: "Token otentikasi tidak ditemukan." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* Verify id token */
  try {
    await auth.verifyIdToken(idToken);
  } catch (error) {
    return new Response(JSON.stringify({ error: "Token otentikasi tidak valid atau telah kedaluwarsa." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* Create and set session cookie */
  const fiveDays = 60 * 60 * 24 * 5 * 1000;
  try {
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: fiveDays,
    });

    cookies.set("__session", sessionCookie, {
      path: "/",
      maxAge: fiveDays / 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Gagal membuat sesi cookie login." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const acceptsJson = request.headers.get("accept")?.includes("application/json");
  if (acceptsJson || request.method === "POST") {
    return new Response(JSON.stringify({ success: true, redirect: "/dashboard" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return redirect("/dashboard");
};

export const GET: APIRoute = handleSignIn;
export const POST: APIRoute = handleSignIn;