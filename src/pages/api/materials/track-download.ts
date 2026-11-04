import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";
import { incrementMaterialDownloadCount } from "../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);
  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    await auth.verifySessionCookie(sessionCookie);
  } catch {
    return new Response(JSON.stringify({ error: "Sesi tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const id = body.id?.toString()?.trim();
    if (!id) {
      return new Response(JSON.stringify({ error: "ID materi diperlukan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await incrementMaterialDownloadCount(id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Gagal mencatat unduhan." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
