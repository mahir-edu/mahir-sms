import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { app } from "../../../../../firebase/server";
import { getUserProfile, updateLicenseType } from "../../../../../firebase/firestore";

export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = getAuth(app);

  if (!cookies.has("__session")) {
    return new Response(JSON.stringify({ error: "Sesi tidak ditemukan. Silakan masuk kembali." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const sessionCookie = cookies.get("__session")!.value;
    const decoded = await auth.verifySessionCookie(sessionCookie);
    const adminProfile = await getUserProfile(decoded.uid);
    if (!adminProfile || adminProfile.role !== "hq_admin") {
      return new Response(JSON.stringify({ error: "Akses ditolak. Tindakan ini hanya dapat dilakukan oleh Central HQ Administrator." }), {
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
    const id = body.id?.toString()?.trim();

    if (!id) {
      return new Response(JSON.stringify({ error: "ID tipe lisensi wajib disertakan." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name.toString().trim();
    if (body.description !== undefined) updates.description = body.description.toString().trim();
    if (body.defaultPrice !== undefined) updates.defaultPrice = Number(body.defaultPrice);
    if (body.billingCycle !== undefined) updates.billingCycle = body.billingCycle;
    if (body.defaultMaxStudents !== undefined) updates.defaultMaxStudents = Number(body.defaultMaxStudents);
    if (body.defaultMaxTeachers !== undefined) updates.defaultMaxTeachers = Number(body.defaultMaxTeachers);
    if (body.defaultGracePeriodDays !== undefined) updates.defaultGracePeriodDays = Number(body.defaultGracePeriodDays);
    if (body.allowedMaterialTiers !== undefined) updates.allowedMaterialTiers = body.allowedMaterialTiers;
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    if (body.order !== undefined) updates.order = Number(body.order);

    if (body.features !== undefined) {
      if (Array.isArray(body.features)) {
        updates.features = body.features.map((f: any) => f.toString().trim()).filter(Boolean);
      } else if (typeof body.features === "string") {
        updates.features = body.features.split(/\r?\n/).map((f: string) => f.trim()).filter(Boolean);
      }
    }

    await updateLicenseType(id, updates);

    return new Response(JSON.stringify({
      success: true,
      message: "Paket lisensi berhasil diperbarui!",
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Gagal memperbarui paket lisensi.",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
};
