import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";
import { getUserProfile } from "../../../firebase/firestore";
import { isSmtpConfigured, processEmailQueue } from "../../../services/mailer";

export const ALL: APIRoute = async ({ request, cookies, url }) => {
  // Authorization Check: Either valid Cron Secret OR valid HQ Admin session
  const cronSecretParam = url.searchParams.get("secret");
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET || "mahir-cron-secret-2026";

  let isAuthorized = false;

  if (cronSecretParam && cronSecretParam === expectedSecret) {
    isAuthorized = true;
  } else if (authHeader && authHeader.replace(/^Bearer\s+/i, "") === expectedSecret) {
    isAuthorized = true;
  } else if (cookies.has("__session")) {
    try {
      const auth = getAuth(app);
      const sessionCookie = cookies.get("__session")!.value;
      const decoded = await auth.verifySessionCookie(sessionCookie);
      const profile = await getUserProfile(decoded.uid);
      if (profile && profile.role === "hq_admin") {
        isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Akses ditolak. Kunci otorisasi cron tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!isSmtpConfigured()) {
    return new Response(JSON.stringify({
      error: "SMTP belum dikonfigurasi di environment variables.",
      processed: 0,
      configured: false,
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const limit = Number(url.searchParams.get("limit")) || 25;
    const summary = await processEmailQueue(limit);

    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      ...summary,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memproses antrean email.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

