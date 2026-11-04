import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { getAllLicenseTypes } from "../../../../../firebase/firestore";

export const GET: APIRoute = async ({ cookies, url }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk kembali." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    await auth.verifySessionCookie(sessionCookie);

    const includeInactive = url.searchParams.get("all") === "true";
    const types = await getAllLicenseTypes(includeInactive);

    return new Response(JSON.stringify({
      success: true,
      types,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memuat tipe lisensi.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
