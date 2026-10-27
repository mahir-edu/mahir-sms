import type { APIRoute } from "astro";
import { getAuth } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";
import { app } from "../../../firebase/server";
import { collections, sendNotification } from "../../../firebase/firestore";
import type { UserDocument, UserRole, UserStatus, TeacherDocument, ParentDocument } from "../../../types/database";

export const POST: APIRoute = async ({ request, redirect }) => {
  const auth = getAuth(app);

  let email = "";
  let password = "";
  let name = "";
  let phone = "";
  let role: UserRole = "teacher";
  let branchId = "";
  let nip = "";
  let specialization = "";
  let childName = "";
  let childNis = "";
  let b_website = "";
  let isJson = false;

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    isJson = true;
    try {
      const body = await request.json();
      email = body.email?.toString()?.trim() || "";
      password = body.password?.toString() || "";
      name = body.name?.toString()?.trim() || "";
      phone = body.phone?.toString()?.trim() || "";
      role = (body.role?.toString() === "parent" ? "parent" : "teacher") as UserRole;
      branchId = body.branchId?.toString()?.trim() || "";
      nip = body.nip?.toString()?.trim() || "";
      specialization = body.specialization?.toString()?.trim() || "";
      childName = body.childName?.toString()?.trim() || "";
      childNis = body.childNis?.toString()?.trim() || "";
      b_website = body.b_website?.toString()?.trim() || "";
    } catch {
      // Body parse error
    }
  } else {
    try {
      const formData = await request.formData();
      email = formData.get("email")?.toString()?.trim() || "";
      password = formData.get("password")?.toString() || "";
      name = formData.get("name")?.toString()?.trim() || "";
      phone = formData.get("phone")?.toString()?.trim() || "";
      role = (formData.get("role")?.toString() === "parent" ? "parent" : "teacher") as UserRole;
      branchId = formData.get("branchId")?.toString()?.trim() || "";
      nip = formData.get("nip")?.toString()?.trim() || "";
      specialization = formData.get("specialization")?.toString()?.trim() || "";
      childName = formData.get("childName")?.toString()?.trim() || "";
      childNis = formData.get("childNis")?.toString()?.trim() || "";
      b_website = formData.get("b_website")?.toString()?.trim() || "";
    } catch {
      // FormData parse error
    }
  }

  // 1. Anti-Bot Honeypot Check
  if (b_website) {
    console.warn("🛡️ Bot registration attempt detected via honeypot.");
    return new Response(JSON.stringify({ error: "Permintaan tidak dapat diproses." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Strict Role Enforcement (Only teacher and parent can self-register)
  if (role !== "teacher" && role !== "parent") {
    return new Response(JSON.stringify({ error: "Peran akun tidak diizinkan untuk registrasi mandiri." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Validation
  if (!email || !password || !name || !phone) {
    const errorMsg = "Semua bidang wajib (Nama, Email, Kontak, Kata Sandi) harus diisi.";
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

  /* 4. Create Firebase Auth user */
  let userRecord;
  try {
    userRecord = await auth.createUser({
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

  /* 5. Set Initial Status & Role-specific Metadata */
  const uid = userRecord.uid;
  const now = Timestamp.now();
  // Teachers require admin approval; Parents are active immediately (can be prospective or enrolled)
  const status: UserStatus = role === "teacher" ? "pending_approval" : "active";

  const userDoc: UserDocument = {
    uid,
    email,
    displayName: name,
    phoneNumber: phone,
    role,
    branchId: branchId || null,
    status,
    createdAt: now,
    updatedAt: now,
  };

  if (role === "teacher") {
    userDoc.teacherMetadata = {
      nip: nip || "",
      specialization: specialization || "",
    };

    // Create teacher profile
    const teacherProfile: TeacherDocument = {
      uid,
      branchId: branchId || "",
      nip: nip || "",
      fullName: name,
      email,
      specializations: specialization ? [specialization] : [],
      assignedClassIds: [],
      isHomeroom: false,
      createdAt: now,
    };
    await collections.teachers().doc(uid).set(teacherProfile);

    // Notify Central HQ Admin in-app
    try {
      await sendNotification({
        recipientUid: "hq-admin-primary",
        senderUid: uid,
        branchId: branchId || undefined,
        type: "announcement",
        title: "Pendaftaran Pendidik Baru Menunggu Persetujuan",
        body: `${name} telah mendaftar sebagai guru di unit ${branchId || "Sekolah"}. Silakan tinjau dan konfirmasi akun.`,
        actionUrl: "/dashboard/admin/users",
      });
    } catch {
      // Non-blocking notification
    }
  } else if (role === "parent") {
    const isProspect = !childNis;
    userDoc.parentMetadata = {
      isProspect,
      studentUids: [],
      childNames: childName ? [childName] : [],
      preferredBranchId: branchId || "",
    };

    // Create parent profile
    const parentProfile: ParentDocument = {
      uid,
      fullName: name,
      email,
      phone,
      studentUids: [],
      emailPreferences: {
        attendanceAlerts: true,
        gradeAnnouncements: true,
        generalAnnouncements: true,
      },
      createdAt: now,
    };
    await collections.parents().doc(uid).set(parentProfile);
  }

  // Save to Firestore users collection
  await collections.users().doc(uid).set(userDoc);

  // 6. Return appropriate redirect based on role and status
  const redirectUrl = role === "teacher" 
    ? "/pending-approval" 
    : "/signin?registered=success&role=parent";

  if (isJson) {
    return new Response(JSON.stringify({ 
      success: true, 
      status, 
      role, 
      redirect: redirectUrl 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return redirect(redirectUrl);
};