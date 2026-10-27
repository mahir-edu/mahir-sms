import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../firebase/server";
import { getUserProfile, linkStudentToParent } from "../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  // 1. Session verification
  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk terlebih dahulu." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let parentUid = "";
  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    parentUid = decoded.uid;
    const profile = await getUserProfile(parentUid);
    if (!profile) {
      return new Response(JSON.stringify({ error: "Profil pengguna tidak ditemukan." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch {
    return new Response(JSON.stringify({ error: "Sesi tidak valid." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Parse request body
  let studentNis = "";
  try {
    const isJson = request.headers.get("content-type")?.includes("application/json");
    if (isJson) {
      const body = await request.json();
      studentNis = body.studentNis?.toString()?.trim() || "";
    } else {
      const formData = await request.formData();
      studentNis = formData.get("studentNis")?.toString()?.trim() || "";
    }
  } catch {
    return new Response(JSON.stringify({ error: "Format permintaan tidak valid." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!studentNis) {
    return new Response(JSON.stringify({ error: "Nomor Induk Siswa (NIS) wajib diisi." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Link student
  try {
    const result = await linkStudentToParent(parentUid, studentNis);
    if (!result.success) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      studentName: result.studentName,
      message: `Berhasil menghubungkan data ananda ${result.studentName} ke akun Anda.`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal menghubungkan data siswa.",
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
