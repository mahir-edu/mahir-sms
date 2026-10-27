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
export async function getUserProfile(uid: string): Promise<UserDocument | null> {
  const doc = await collections.users().doc(uid).get();
  return doc.exists ? (doc.data() as UserDocument) : null;
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
  const emailDoc: EmailQueueDocument = {
    id: ref.id,
    to: params.to,
    message: {
      subject: params.subject,
      html: params.html,
      text: params.text,
    },
    metadata: params.metadata,
    delivery: {
      state: "PENDING",
      attempts: 0,
    },
    createdAt: Timestamp.now(),
  };

  await ref.set(emailDoc);
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

