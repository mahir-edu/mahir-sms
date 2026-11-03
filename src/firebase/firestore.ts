import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { app } from "./server";
import type {
  UserDocument,
  BranchDocument,
  BranchLicenseDocument,
  CurriculumDocument,
  LessonMaterialDocument,
  CalendarEventDocument,
  ClassDocument,
  StudentDocument,
  ParentDocument,
  TeacherDocument,
  AttendanceRecord,
  AssessmentDocument,
  StudentGradeRecord,
  NotificationDocument,
  EmailQueueDocument,
  NotificationType
} from "../types/database";

export const db = getFirestore(app);
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {}

// Collection References
export const collections = {
  users: () => db.collection("users"),
  branches: () => db.collection("branches"),
  branchLicenses: () => db.collection("branch_licenses"),
  curriculums: () => db.collection("curriculums"),
  lessonPlans: () => db.collection("lesson_plans"),
  lessonMaterials: () => db.collection("lesson_materials"),
  calendarEvents: () => db.collection("calendar_events"),
  academicYears: () => db.collection("academic_years"),
  classes: () => db.collection("classes"),
  students: () => db.collection("students"),
  parents: () => db.collection("parents"),
  teachers: () => db.collection("teachers"),
  attendance: () => db.collection("attendance"),
  assessments: () => db.collection("assessments"),
  studentGrades: () => db.collection("student_grades"),
  notifications: () => db.collection("notifications"),
  emailQueue: () => db.collection("email_queue"),
};

// ==========================================
// 1. User Helpers
// ==========================================
const SUPER_ADMIN_EMAILS = ["gregorius.w@gmail.com", "admin@mahir-edu.com"];

export async function getUserProfile(uid: string): Promise<UserDocument | null> {
  const doc = await collections.users().doc(uid).get();
  
  if (doc.exists) {
    const data = doc.data() as UserDocument;
    // Auto-promote designated super admin emails
    if (data.email && SUPER_ADMIN_EMAILS.includes(data.email.toLowerCase())) {
      if (data.role !== "hq_admin" || data.status !== "active") {
        data.role = "hq_admin";
        data.status = "active";
        data.branchId = null;
        await collections.users().doc(uid).set({
          role: "hq_admin",
          status: "active",
          branchId: null,
          updatedAt: Timestamp.now()
        }, { merge: true });
      }
    }
    return data;
  }

  // If user profile doc doesn't exist yet, check Firebase Auth for super admin email
  try {
    const { getAuth } = await import("firebase-admin/auth");
    const authUser = await getAuth(app).getUser(uid);
    if (authUser.email && SUPER_ADMIN_EMAILS.includes(authUser.email.toLowerCase())) {
      const superAdminProfile: UserDocument = {
        uid,
        email: authUser.email,
        displayName: authUser.displayName || "Gregorius (Super Admin)",
        role: "hq_admin",
        status: "active",
        branchId: null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await collections.users().doc(uid).set(superAdminProfile, { merge: true });
      await getAuth(app).setCustomUserClaims(uid, { role: "hq_admin", admin: true });
      return superAdminProfile;
    }
  } catch {
    // Auth lookup failed or user not found
  }

  return null;
}

export async function upsertUserProfile(user: Partial<UserDocument> & { uid: string }): Promise<void> {
  const ref = collections.users().doc(user.uid);
  const now = Timestamp.now();
  await ref.set(
    {
      ...user,
      updatedAt: now,
      createdAt: user.createdAt || now,
    },
    { merge: true }
  );
}

export async function updateUserSelfProfile(uid: string, params: {
  displayName?: string;
  phoneNumber?: string;
  teacherMetadata?: {
    nip?: string;
    specialization?: string;
  };
  emailPreferences?: {
    attendanceAlerts?: boolean;
    gradeAnnouncements?: boolean;
    generalAnnouncements?: boolean;
  };
}): Promise<void> {
  const userRef = collections.users().doc(uid);
  const now = Timestamp.now();
  const updateData: Record<string, any> = {
    updatedAt: now,
  };

  if (params.displayName) updateData.displayName = params.displayName.trim();
  if (params.phoneNumber !== undefined) updateData.phoneNumber = params.phoneNumber.trim();
  if (params.teacherMetadata) {
    if (params.teacherMetadata.nip !== undefined) updateData["teacherMetadata.nip"] = params.teacherMetadata.nip.trim();
    if (params.teacherMetadata.specialization !== undefined) updateData["teacherMetadata.specialization"] = params.teacherMetadata.specialization.trim();
  }

  await userRef.update(updateData);

  // Sync teachers collection if applicable
  if (params.displayName || params.teacherMetadata) {
    try {
      const teacherDoc = await collections.teachers().doc(uid).get();
      if (teacherDoc.exists) {
        const teacherUpdate: Record<string, any> = {};
        if (params.displayName) teacherUpdate.fullName = params.displayName.trim();
        if (params.teacherMetadata?.nip !== undefined) teacherUpdate.nip = params.teacherMetadata.nip.trim();
        if (params.teacherMetadata?.specialization !== undefined) {
          teacherUpdate.specializations = [params.teacherMetadata.specialization.trim()];
        }
        await collections.teachers().doc(uid).update(teacherUpdate);
      }
    } catch {}
  }

  // Sync parents collection if applicable
  if (params.displayName || params.phoneNumber || params.emailPreferences) {
    try {
      const parentDoc = await collections.parents().doc(uid).get();
      if (parentDoc.exists) {
        const parentUpdate: Record<string, any> = {};
        if (params.displayName) parentUpdate.fullName = params.displayName.trim();
        if (params.phoneNumber !== undefined) parentUpdate.phone = params.phoneNumber.trim();
        if (params.emailPreferences) parentUpdate.emailPreferences = params.emailPreferences;
        await collections.parents().doc(uid).update(parentUpdate);
      }
    } catch {}
  }
}

// ==========================================
// 2. Branch & License Helpers
// ==========================================
export async function getBranch(branchId: string): Promise<BranchDocument | null> {
  const doc = await collections.branches().doc(branchId).get();
  return doc.exists ? (doc.data() as BranchDocument) : null;
}

export async function getActiveBranchLicense(branchId: string): Promise<BranchLicenseDocument | null> {
  const snapshot = await collections.branchLicenses()
    .where("branchId", "==", branchId)
    .where("isActive", "==", true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const license = snapshot.docs[0].data() as BranchLicenseDocument;
  
  // Verify license has not expired past grace period
  const now = Timestamp.now();
  const graceEnd = new Date(license.expiryDate.toDate().getTime() + license.gracePeriodDays * 86400000);
  if (now.toDate() > graceEnd) {
    return null;
  }

  return license;
}

export async function getAllBranchLicenses(): Promise<BranchLicenseDocument[]> {
  const snapshot = await collections.branchLicenses().orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => doc.data() as BranchLicenseDocument);
}

export async function getAllCurriculums(): Promise<CurriculumDocument[]> {
  const snapshot = await collections.curriculums().orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => doc.data() as CurriculumDocument);
}

export async function getAllLessonMaterials(): Promise<LessonMaterialDocument[]> {
  const snapshot = await collections.lessonMaterials().orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => doc.data() as LessonMaterialDocument);
}

// ==========================================
// 3. Lesson Materials License-Gated Access
// ==========================================
export async function getLessonMaterialsForBranch(branchId: string, curriculumId?: string): Promise<{
  allowed: boolean;
  materials: LessonMaterialDocument[];
  reason?: string;
}> {
  const license = await getActiveBranchLicense(branchId);
  if (!license) {
    return {
      allowed: false,
      materials: [],
      reason: "Lisensi sekolah tidak aktif atau telah kedaluwarsa. Silakan hubungi Central Admin.",
    };
  }

  if (curriculumId && !license.allowedCurriculums.includes(curriculumId)) {
    return {
      allowed: false,
      materials: [],
      reason: "Sekolah Anda belum memiliki lisensi untuk kurikulum ini.",
    };
  }

  let query = collections.lessonMaterials() as FirebaseFirestore.Query;
  if (curriculumId) {
    query = query.where("curriculumId", "==", curriculumId);
  }

  const snapshot = await query.get();
  const materials = snapshot.docs.map(doc => doc.data() as LessonMaterialDocument);

  // Filter materials based on package tier allowed
  const filtered = materials.filter(item => {
    if (!item.isRestricted) return true;
    return license.allowedCurriculums.includes(item.curriculumId);
  });

  return { allowed: true, materials: filtered };
}

// ==========================================
// 4. Central Calendar & Events
// ==========================================
export async function getCalendarEventsForBranch(branchId?: string): Promise<CalendarEventDocument[]> {
  const snapshot = await collections.calendarEvents()
    .orderBy("startDate", "asc")
    .get();

  const allEvents = snapshot.docs.map(doc => doc.data() as CalendarEventDocument);

  if (!branchId) {
    return allEvents;
  }

  return allEvents.filter(event => {
    if (event.targetAudience.scope === "all_branches") return true;
    if (event.targetAudience.scope === "selected_branches" && event.targetAudience.targetBranchIds) {
      return event.targetAudience.targetBranchIds.includes(branchId);
    }
    return false;
  });
}

// ==========================================
// 5. Attendance & Parent Email Alerts
// ==========================================
export async function recordAttendance(params: {
  branchId: string;
  classId: string;
  studentUid: string;
  studentName: string;
  date: string;
  status: AttendanceRecord["status"];
  notes?: string;
  recordedByUid: string;
  parentEmail?: string;
}): Promise<void> {
  const recordId = `${params.branchId}_${params.classId}_${params.date}_${params.studentUid}`;
  const now = Timestamp.now();

  const record: AttendanceRecord = {
    id: recordId,
    branchId: params.branchId,
    classId: params.classId,
    studentUid: params.studentUid,
    studentName: params.studentName,
    date: params.date,
    status: params.status,
    notes: params.notes || "",
    recordedByUid: params.recordedByUid,
    recordedAt: now,
    alertSentToParents: false,
  };

  // If student is absent without notice and parent email is provided, trigger parent alert
  if (params.status === "absent_unexcused" && params.parentEmail) {
    await queueEmailNotification({
      to: params.parentEmail,
      subject: `Pemberitahuan Presensi: Ananda ${params.studentName}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #e11d48;">Pemberitahuan Ketidakhadiran Siswa</h2>
          <p>Yth. Orang Tua / Wali dari <strong>${params.studentName}</strong>,</p>
          <p>Kami menginformasikan bahwa ananda tercatat <strong>tidak hadir tanpa keterangan</strong> pada tanggal <strong>${params.date}</strong>.</p>
          <p>Mohon segera menghubungi pihak sekolah untuk konfirmasi atau informasi lebih lanjut.</p>
          <br>
          <p style="font-size: 12px; color: #888;">Mahir School Management System &bull; Pesan Otomatis</p>
        </div>
      `,
      metadata: {
        notificationType: "attendance_alert",
        branchId: params.branchId,
        studentUid: params.studentUid,
      },
    });
    record.alertSentToParents = true;
  }

  await collections.attendance().doc(recordId).set(record, { merge: true });
}

// ==========================================
// 6. In-App Notifications
// ==========================================
export async function sendNotification(params: {
  recipientUid: string;
  senderUid: string;
  branchId?: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl?: string;
}): Promise<string> {
  const ref = collections.notifications().doc();
  const notif: NotificationDocument = {
    id: ref.id,
    recipientUid: params.recipientUid,
    senderUid: params.senderUid,
    branchId: params.branchId,
    type: params.type,
    title: params.title,
    body: params.body,
    actionUrl: params.actionUrl,
    isRead: false,
    createdAt: Timestamp.now(),
  };

  await ref.set(notif);
  return ref.id;
}

// ==========================================
// 7. Automated Email Queue Outbox
// ==========================================
export async function queueEmailNotification(params: {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  metadata?: EmailQueueDocument["metadata"];
}): Promise<string> {
  const ref = collections.emailQueue().doc();
  const now = Timestamp.now();
  const emailDoc: EmailQueueDocument = {
    id: ref.id,
    to: params.to,
    message: {
      subject: params.subject,
      html: params.html,
      text: params.text || "",
    },
    metadata: params.metadata || { notificationType: "school_announcement", branchId: "central" },
    delivery: {
      state: "PENDING",
      attempts: 0,
    },
    createdAt: now,
  };

  await ref.set(emailDoc);

  // If SMTP is configured, attempt immediate background dispatch
  try {
    const { isSmtpConfigured, sendMailDirect } = await import("../services/mailer");
    if (isSmtpConfigured()) {
      sendMailDirect({
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text || "",
      }).then(async (res) => {
        const finishTs = Timestamp.now();
        if (res.success) {
          await ref.update({
            "delivery.state": "SUCCESS",
            "delivery.endTime": finishTs,
            "delivery.attempts": 1,
          });
        } else {
          await ref.update({
            "delivery.state": "ERROR",
            "delivery.endTime": finishTs,
            "delivery.attempts": 1,
            "delivery.error": res.error || "Gagal mengirim email via SMTP.",
          });
        }
      }).catch((err) => {
        console.warn("[Mailer] Background send error:", err?.message);
      });
    }
  } catch {}

  return ref.id;
}

// ==========================================
// 8. User Management & Verification Helpers
// ==========================================
export async function getAllBranches(): Promise<BranchDocument[]> {
  const snapshot = await collections.branches().orderBy("name", "asc").get();
  return snapshot.docs.map(doc => doc.data() as BranchDocument);
}

export async function getAllUsers(filters?: {
  role?: string;
  status?: string;
  branchId?: string;
}): Promise<UserDocument[]> {
  let query = collections.users() as FirebaseFirestore.Query;

  if (filters?.role) {
    query = query.where("role", "==", filters.role);
  }
  if (filters?.status) {
    query = query.where("status", "==", filters.status);
  }
  if (filters?.branchId) {
    query = query.where("branchId", "==", filters.branchId);
  }

  const snapshot = await query.orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => doc.data() as UserDocument);
}

export async function updateUserStatus(params: {
  targetUid: string;
  newStatus: 'active' | 'suspended' | 'rejected' | 'pending_approval';
  adminUid: string;
  reason?: string;
}): Promise<void> {
  const userRef = collections.users().doc(params.targetUid);
  const userDoc = await userRef.get();
  if (!userDoc.exists) {
    throw new Error("Pengguna tidak ditemukan.");
  }

  const userData = userDoc.data() as UserDocument;
  const now = Timestamp.now();

  const updateData: Partial<UserDocument> = {
    status: params.newStatus,
    updatedAt: now,
  };

  if (params.newStatus === "active") {
    updateData.approvedByUid = params.adminUid;
    updateData.approvedAt = now;
    updateData.rejectionReason = "";

    // Queue confirmation email
    await queueEmailNotification({
      to: userData.email,
      subject: "Selamat! Akun Mahir SMS Anda Telah Diaktifkan",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #10b981;">Akun Mahir SMS Anda Telah Aktif</h2>
          <p>Halo <strong>${userData.displayName}</strong>,</p>
          <p>Kabar gembira! Pendaftaran akun Anda sebagai <strong>${userData.role === "teacher" ? "Pendidik (Guru)" : "Orang Tua / Wali"}</strong> telah diverifikasi dan disetujui oleh Central Admin.</p>
          <p>Anda sekarang dapat masuk ke portal dan mengakses seluruh fitur akademik:</p>
          <p style="margin: 24px 0;">
            <a href="https://mahir-edu.com/signin" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Masuk ke Portal Sekarang &rarr;
            </a>
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="font-size: 12px; color: #888;">Mahir School Management System &bull; Pesan Otomatis</p>
        </div>
      `,
      metadata: {
        notificationType: "school_announcement",
        branchId: userData.branchId || "central",
      },
    });

    // In-app notification
    await sendNotification({
      recipientUid: userData.uid,
      senderUid: params.adminUid,
      type: "announcement",
      title: "Akun Telah Diaktifkan",
      body: "Selamat, akun Anda telah diverifikasi dan disetujui oleh Administrator.",
      actionUrl: "/dashboard",
    });

  } else if (params.newStatus === "rejected") {
    updateData.rejectionReason = params.reason || "Verifikasi tidak memenuhi persyaratan.";

    // Queue rejection notice
    await queueEmailNotification({
      to: userData.email,
      subject: "Pemberitahuan Status Pendaftaran Akun Mahir SMS",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #e11d48;">Pemberitahuan Pendaftaran Akun</h2>
          <p>Halo <strong>${userData.displayName}</strong>,</p>
          <p>Mohon maaf, pendaftaran akun Anda belum dapat disetujui saat ini.</p>
          ${params.reason ? `<p><strong>Alasan:</strong> ${params.reason}</p>` : ""}
          <p>Silakan hubungi pihak sekolah atau Central Admin untuk informasi lebih lanjut.</p>
          <br>
          <p style="font-size: 12px; color: #888;">Mahir School Management System &bull; Pesan Otomatis</p>
        </div>
      `,
    });
  }

  await userRef.update(updateData);
}

// ==========================================
// 9. Parent & Student Management Helpers
// ==========================================
export async function getUpcomingCalendarEvents(
  role?: string,
  branchId?: string
): Promise<CalendarEventDocument[]> {
  const snapshot = await collections.calendarEvents()
    .orderBy("startDate", "asc")
    .limit(20)
    .get();

  const nowMs = Date.now() - (12 * 60 * 60 * 1000); // include today's events
  let events = snapshot.docs.map(doc => doc.data() as CalendarEventDocument);

  events = events.filter(e => {
    const eventTime = e.startDate?.toMillis ? e.startDate.toMillis() : 0;
    return eventTime >= nowMs;
  });

  if (role) {
    events = events.filter(e =>
      !e.targetAudience?.targetRoles ||
      e.targetAudience.targetRoles.includes(role as any)
    );
  }

  if (branchId) {
    events = events.filter(e =>
      !e.targetAudience?.scope ||
      e.targetAudience.scope === "all_branches" ||
      (e.targetAudience.targetBranchIds && e.targetAudience.targetBranchIds.includes(branchId))
    );
  }

  return events;
}

export async function linkStudentToParent(
  parentUid: string,
  studentNis: string
): Promise<{ success: boolean; studentName?: string; error?: string }> {
  const trimmedNis = studentNis.trim();
  if (!trimmedNis) {
    return { success: false, error: "NIS siswa tidak boleh kosong." };
  }

  // 1. Search student by NIS
  const snapshot = await collections.students()
    .where("nis", "==", trimmedNis)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return {
      success: false,
      error: `Siswa dengan NIS "${trimmedNis}" tidak ditemukan. Pastikan NIS telah sesuai dengan data sekolah.`
    };
  }

  const studentDoc = snapshot.docs[0];
  const student = studentDoc.data() as StudentDocument;

  // 2. Add parentUid to student's parentUids
  await studentDoc.ref.update({
    parentUids: FieldValue.arrayUnion(parentUid),
  });

  // 3. Update Parent document
  const parentRef = collections.parents().doc(parentUid);
  await parentRef.set({
    studentUids: FieldValue.arrayUnion(student.uid),
  }, { merge: true });

  // 4. Update User document parentMetadata (transitions isProspect to false)
  const userRef = collections.users().doc(parentUid);
  await userRef.set({
    parentMetadata: {
      isProspect: false,
      studentUids: FieldValue.arrayUnion(student.uid),
      childNames: FieldValue.arrayUnion(student.fullName),
    },
    updatedAt: Timestamp.now(),
  }, { merge: true });

  return { success: true, studentName: student.fullName };
}

export async function getLinkedStudentsForParent(parentUid: string): Promise<StudentDocument[]> {
  const snapshot = await collections.students()
    .where("parentUids", "array-contains", parentUid)
    .get();
  return snapshot.docs.map(doc => doc.data() as StudentDocument);
}

export async function getClassesForBranch(branchId?: string): Promise<ClassDocument[]> {
  let query = collections.classes() as FirebaseFirestore.Query;
  if (branchId) {
    query = query.where("branchId", "==", branchId);
  }
  const snapshot = await query.orderBy("name", "asc").get();
  return snapshot.docs.map(doc => doc.data() as ClassDocument);
}

export async function getStudentsForClass(classId: string): Promise<StudentDocument[]> {
  const snapshot = await collections.students()
    .where("currentClassId", "==", classId)
    .orderBy("fullName", "asc")
    .get();
  return snapshot.docs.map(doc => doc.data() as StudentDocument);
}

export async function getAssessmentsForClass(classId?: string): Promise<AssessmentDocument[]> {
  let query = collections.assessments() as FirebaseFirestore.Query;
  if (classId) {
    query = query.where("classId", "==", classId);
  }
  const snapshot = await query.orderBy("assessmentDate", "desc").get();
  return snapshot.docs.map(doc => doc.data() as AssessmentDocument);
}

// ==========================================
// 10. Admin User CRUD & Bulk Ingestion Helpers
// ==========================================
export async function deleteUserComplete(params: {
  targetUid: string;
  adminUid: string;
  mode?: "soft" | "permanent";
}): Promise<{ success: boolean; message: string }> {
  if (params.targetUid === params.adminUid) {
    throw new Error("Anda tidak dapat menghapus akun Anda sendiri.");
  }

  const userDoc = await collections.users().doc(params.targetUid).get();
  if (!userDoc.exists) {
    throw new Error("Pengguna tidak ditemukan.");
  }

  const userData = userDoc.data() as UserDocument;
  if (userData.email && SUPER_ADMIN_EMAILS.includes(userData.email.toLowerCase())) {
    throw new Error("Akun Super Administrator Utama dilindungi dan tidak dapat dihapus.");
  }

  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(app);

  if (params.mode === "permanent") {
    // 1. Delete from Firebase Auth
    try {
      await auth.deleteUser(params.targetUid);
    } catch (e: any) {
      console.warn("Auth user delete warning:", e.message);
    }

    // 2. Delete stakeholder records
    if (userData.role === "teacher") {
      await collections.teachers().doc(params.targetUid).delete().catch(() => {});
    } else if (userData.role === "parent") {
      await collections.parents().doc(params.targetUid).delete().catch(() => {});
    } else if (userData.role === "student") {
      await collections.students().doc(params.targetUid).delete().catch(() => {});
    }

    // 3. Delete from users collection
    await collections.users().doc(params.targetUid).delete();
    return { success: true, message: `Akun ${userData.displayName} (${userData.email}) berhasil dihapus permanen.` };
  } else {
    // Soft suspension
    await collections.users().doc(params.targetUid).update({
      status: "suspended",
      updatedAt: Timestamp.now(),
    });
    try {
      await auth.revokeRefreshTokens(params.targetUid);
    } catch {}
    return { success: true, message: `Akun ${userData.displayName} berhasil dinonaktifkan (suspended).` };
  }
}

export interface ImportRowRecord {
  nis: string;
  nisn?: string;
  fullName: string;
  gender: "male" | "female";
  birthDate?: string;
  branchId: string;
  className?: string;
  parentName: string;
  parentEmail: string;
  parentPhone?: string;
}

export async function bulkImportStudentsAndParents(params: {
  records: ImportRowRecord[];
  adminUid: string;
  sendWelcomeEmail?: boolean;
}): Promise<{
  totalProcessed: number;
  studentsCreated: number;
  parentsCreated: number;
  parentsLinked: number;
  errors: { row: number; error: string }[];
}> {
  const { getAuth } = await import("firebase-admin/auth");
  const auth = getAuth(app);
  const now = Timestamp.now();

  let studentsCreated = 0;
  let parentsCreated = 0;
  let parentsLinked = 0;
  const errors: { row: number; error: string }[] = [];

  // Pre-fetch existing students by NIS to prevent duplicates
  const existingNisSet = new Set<string>();
  const studentsSnap = await collections.students().get();
  studentsSnap.docs.forEach(doc => {
    const s = doc.data() as StudentDocument;
    if (s.nis) existingNisSet.add(s.nis.toLowerCase().trim());
  });

  for (let i = 0; i < params.records.length; i++) {
    const row = params.records[i];
    const rowIdx = i + 1;

    try {
      const cleanNis = row.nis.trim();
      const cleanParentEmail = row.parentEmail.toLowerCase().trim();

      if (!cleanNis || !row.fullName || !cleanParentEmail) {
        errors.push({ row: rowIdx, error: "NIS, Nama Siswa, dan Email Orang Tua wajib diisi." });
        continue;
      }

      if (existingNisSet.has(cleanNis.toLowerCase())) {
        errors.push({ row: rowIdx, error: `Siswa dengan NIS "${cleanNis}" sudah terdaftar di sistem. Dilewati.` });
        continue;
      }

      // 1. Resolve or Create Parent in Auth & Firestore
      let parentUid = "";
      let isNewParent = false;

      try {
        const existingAuthUser = await auth.getUserByEmail(cleanParentEmail);
        parentUid = existingAuthUser.uid;
      } catch (err: any) {
        if (err.code === "auth/user-not-found") {
          // Create new parent Auth user with secure temporary password
          const tempPassword = "Mahir@" + Math.random().toString(36).substring(2, 8) + "!";
          const newAuthUser = await auth.createUser({
            email: cleanParentEmail,
            displayName: row.parentName.trim(),
            password: tempPassword,
            phoneNumber: row.parentPhone?.startsWith("+") ? row.parentPhone : undefined,
          });
          parentUid = newAuthUser.uid;
          isNewParent = true;

          await auth.setCustomUserClaims(parentUid, {
            role: "parent",
            branchId: row.branchId,
          });

          // Create User document for parent
          const parentUserDoc: UserDocument = {
            uid: parentUid,
            email: cleanParentEmail,
            displayName: row.parentName.trim(),
            phoneNumber: row.parentPhone || "",
            role: "parent",
            branchId: row.branchId,
            status: "active",
            parentMetadata: {
              isProspect: false,
              studentUids: [],
              childNames: [row.fullName.trim()],
            },
            approvedByUid: params.adminUid,
            approvedAt: now,
            createdAt: now,
            updatedAt: now,
          };
          await collections.users().doc(parentUid).set(parentUserDoc);

          // Create Parent document
          const parentDoc: ParentDocument = {
            uid: parentUid,
            fullName: row.parentName.trim(),
            email: cleanParentEmail,
            phone: row.parentPhone || "",
            studentUids: [],
            emailPreferences: {
              attendanceAlerts: true,
              gradeAnnouncements: true,
              generalAnnouncements: true,
            },
            createdAt: now,
          };
          await collections.parents().doc(parentUid).set(parentDoc);
          parentsCreated++;

          // Optional welcome email
          if (params.sendWelcomeEmail) {
            await queueEmailNotification({
              to: cleanParentEmail,
              subject: "Selamat Datang di Mahir Edu: Akun Portal Wali Siswa Anda",
              html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                  <h2 style="color: #10b981;">Selamat Datang di Mahir School Management System</h2>
                  <p>Yth. Bapak/Ibu <strong>${row.parentName}</strong>,</p>
                  <p>Akun portal wali siswa Anda untuk ananda <strong>${row.fullName}</strong> telah berhasil dibuat.</p>
                  <p>Berikut kredensial login akun Anda:</p>
                  <div style="background-color: #f1f5f9; padding: 16px; border-radius: 8px; font-family: monospace; margin: 16px 0;">
                    <p style="margin: 0;"><strong>Email:</strong> ${cleanParentEmail}</p>
                    <p style="margin: 6px 0 0 0;"><strong>Password Sementara:</strong> ${tempPassword}</p>
                  </div>
                  <p>Silakan masuk dan ubah password Anda di: <a href="https://mahir-edu.com/signin">https://mahir-edu.com/signin</a></p>
                  <br>
                  <p style="font-size: 12px; color: #888;">Mahir School Management System</p>
                </div>
              `,
              metadata: {
                notificationType: "school_announcement",
                branchId: row.branchId,
              },
            });
          }
        } else {
          throw err;
        }
      }

      // 2. Create Student Record in Firestore
      const studentUid = `stu_${cleanNis.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
      const studentDoc: StudentDocument = {
        uid: studentUid,
        branchId: row.branchId,
        currentClassId: row.className || "default-class",
        nis: cleanNis,
        nisn: row.nisn || "",
        fullName: row.fullName.trim(),
        gender: row.gender,
        birthDate: row.birthDate || "",
        parentUids: [parentUid],
        primaryParentEmail: cleanParentEmail,
        status: "active",
        enrolledAt: now,
      };

      await collections.students().doc(studentUid).set(studentDoc);
      existingNisSet.add(cleanNis.toLowerCase());
      studentsCreated++;

      // 3. Link Student UID to Parent
      await collections.parents().doc(parentUid).update({
        studentUids: FieldValue.arrayUnion(studentUid),
      });

      await collections.users().doc(parentUid).update({
        "parentMetadata.studentUids": FieldValue.arrayUnion(studentUid),
        "parentMetadata.childNames": FieldValue.arrayUnion(row.fullName.trim()),
        "parentMetadata.isProspect": false,
        updatedAt: now,
      });

      if (!isNewParent) {
        parentsLinked++;
      }

    } catch (err: any) {
      errors.push({ row: rowIdx, error: err.message || "Gagal memproses baris ini." });
    }
  }

  return {
    totalProcessed: params.records.length,
    studentsCreated,
    parentsCreated,
    parentsLinked,
    errors,
  };
}

// ==========================================
// 11. School Branch & Franchise Lifecycle Helpers
// ==========================================
export async function getStaffForBranch(branchId: string): Promise<UserDocument[]> {
  const snapshot = await collections.users()
    .where("branchId", "==", branchId)
    .where("role", "in", ["branch_admin", "teacher"])
    .get();
  return snapshot.docs.map(doc => doc.data() as UserDocument);
}

export async function getStudentsForBranch(branchId: string): Promise<StudentDocument[]> {
  const snapshot = await collections.students()
    .where("branchId", "==", branchId)
    .get();
  const students = snapshot.docs.map(doc => doc.data() as StudentDocument);
  return students.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface CreateBranchWithLicenseParams {
  name: string;
  code: string;
  address: {
    street: string;
    city: string;
    province: string;
    postalCode: string;
  };
  contact: {
    email: string;
    phone: string;
    headmasterName: string;
  };
  license: {
    packageType: "basic" | "standard" | "premium" | "enterprise";
    issueDate?: string;
    startDate?: string;
    dueDate?: string;
    expiryDate?: string;
    gracePeriodDays?: number;
    maxTeachers?: number;
    maxStudents?: number;
    allowedCurriculums?: string[];
  };
  adminUid: string;
}

export async function createBranchWithLicense(params: CreateBranchWithLicenseParams): Promise<{ branchId: string; licenseId: string }> {
  const branchId = "pemancar-" + params.code.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const licenseId = "lic-" + params.code.toLowerCase().replace(/[^a-z0-9]/g, "-") + "-" + new Date().getFullYear();
  const now = Timestamp.now();

  const issueTs = params.license.issueDate ? Timestamp.fromDate(new Date(params.license.issueDate)) : now;
  const startTs = params.license.startDate ? Timestamp.fromDate(new Date(params.license.startDate)) : now;
  const dueTs = params.license.dueDate ? Timestamp.fromDate(new Date(params.license.dueDate)) : Timestamp.fromDate(new Date(Date.now() + 335 * 86400000));
  const expiryTs = params.license.expiryDate ? Timestamp.fromDate(new Date(params.license.expiryDate)) : Timestamp.fromDate(new Date(Date.now() + 365 * 86400000));

  const branchDoc: BranchDocument = {
    id: branchId,
    name: params.name.trim(),
    code: params.code.trim().toUpperCase(),
    address: params.address,
    contact: params.contact,
    licenseStatus: "active",
    activeLicenseId: licenseId,
    createdAt: now,
    updatedAt: now,
  };

  const licenseKey = "MHR-LIC-" + Math.random().toString(36).substring(2, 10).toUpperCase() + "-" + new Date().getFullYear();

  const licenseDoc: BranchLicenseDocument = {
    id: licenseId,
    branchId,
    branchName: params.name.trim(),
    licenseKey,
    packageType: params.license.packageType || "standard",
    issueDate: issueTs,
    startDate: startTs,
    dueDate: dueTs,
    expiryDate: expiryTs,
    gracePeriodDays: params.license.gracePeriodDays ?? 14,
    allowedCurriculums: params.license.allowedCurriculums || ["cur-math-primary-sd"],
    allowedMaterialTiers: params.license.packageType === "basic" ? ["standard"] : ["standard", "multisensory_kit", "premium"],
    maxStudents: params.license.maxStudents || 100,
    maxTeachers: params.license.maxTeachers || 10,
    status: "active",
    isActive: true,
    issuedByUid: params.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(collections.branches().doc(branchId), branchDoc);
  batch.set(collections.branchLicenses().doc(licenseId), licenseDoc);
  await batch.commit();

  return { branchId, licenseId };
}

export async function updateBranchProfile(branchId: string, params: {
  name?: string;
  address?: BranchDocument["address"];
  contact?: BranchDocument["contact"];
}): Promise<void> {
  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };
  if (params.name) updateData.name = params.name.trim();
  if (params.address) updateData.address = params.address;
  if (params.contact) updateData.contact = params.contact;

  await collections.branches().doc(branchId).update(updateData);
}

export async function renewBranchLicense(licenseId: string, params: {
  packageType?: BranchLicenseDocument["packageType"];
  dueDate?: string;
  expiryDate?: string;
  maxStudents?: number;
  maxTeachers?: number;
  gracePeriodDays?: number;
  adminUid: string;
}): Promise<void> {
  const licenseRef = collections.branchLicenses().doc(licenseId);
  const licenseDoc = await licenseRef.get();
  if (!licenseDoc.exists) {
    throw new Error("Dokumen lisensi tidak ditemukan.");
  }
  const license = licenseDoc.data() as BranchLicenseDocument;

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
    status: "active",
    isActive: true,
  };

  if (params.packageType) updateData.packageType = params.packageType;
  if (params.dueDate) updateData.dueDate = Timestamp.fromDate(new Date(params.dueDate));
  if (params.expiryDate) updateData.expiryDate = Timestamp.fromDate(new Date(params.expiryDate));
  if (params.maxStudents) updateData.maxStudents = Number(params.maxStudents);
  if (params.maxTeachers) updateData.maxTeachers = Number(params.maxTeachers);
  if (params.gracePeriodDays !== undefined) updateData.gracePeriodDays = Number(params.gracePeriodDays);

  await licenseRef.update(updateData);

  // Sync branch status
  await collections.branches().doc(license.branchId).update({
    licenseStatus: "active",
    updatedAt: Timestamp.now(),
  });
}

