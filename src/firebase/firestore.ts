import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { app } from "./server";
import type {
  UserDocument,
  BranchDocument,
  BranchLicenseDocument,
  CurriculumDocument,
  LessonPlanDocument,
  MethodologyStep,
  MaterialType,
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
  NotificationType,
  LicenseTypeDocument
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
  licenseTypes: () => db.collection("license_types"),
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

export async function getCurriculumById(id: string): Promise<CurriculumDocument | null> {
  const doc = await collections.curriculums().doc(id).get();
  return doc.exists ? (doc.data() as CurriculumDocument) : null;
}

export async function createCurriculum(params: {
  id?: string;
  title: string;
  subject: string;
  gradeLevel: number;
  gradeCategory?: string;
  version: string;
  description: string;
  adminUid: string;
}): Promise<string> {
  const cleanSubject = params.subject.trim().toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  const slug = params.id
    ? params.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-")
    : `cur-${cleanSubject}-g${params.gradeLevel}-${Date.now().toString(36).slice(-4)}`;

  const existing = await getCurriculumById(slug);
  if (existing) {
    throw new Error(`Kurikulum dengan ID "${slug}" sudah ada.`);
  }

  const now = Timestamp.now();
  const docData: CurriculumDocument = {
    id: slug,
    title: params.title.trim(),
    subject: params.subject.trim(),
    gradeLevel: Number(params.gradeLevel) || 1,
    gradeCategory: params.gradeCategory || (params.gradeLevel === 0 ? "PAUD / TK" : `Kelas ${params.gradeLevel} SD`),
    version: params.version.trim() || "2026.1",
    description: params.description.trim(),
    isActive: true,
    totalModules: 0,
    totalMaterials: 0,
    createdByUid: params.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  await collections.curriculums().doc(slug).set(docData);
  return slug;
}

export async function updateCurriculum(id: string, params: {
  title?: string;
  subject?: string;
  gradeLevel?: number;
  gradeCategory?: string;
  version?: string;
  description?: string;
  isActive?: boolean;
}): Promise<void> {
  const ref = collections.curriculums().doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error("Kurikulum tidak ditemukan.");
  }

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };

  if (params.title !== undefined) updateData.title = params.title.trim();
  if (params.subject !== undefined) updateData.subject = params.subject.trim();
  if (params.gradeLevel !== undefined) {
    updateData.gradeLevel = Number(params.gradeLevel);
    if (!params.gradeCategory) {
      updateData.gradeCategory = params.gradeLevel === 0 ? "PAUD / TK" : `Kelas ${params.gradeLevel} SD`;
    }
  }
  if (params.gradeCategory !== undefined) updateData.gradeCategory = params.gradeCategory.trim();
  if (params.version !== undefined) updateData.version = params.version.trim();
  if (params.description !== undefined) updateData.description = params.description.trim();
  if (params.isActive !== undefined) updateData.isActive = Boolean(params.isActive);

  await ref.update(updateData);
}

export async function deleteCurriculum(id: string): Promise<void> {
  const plans = await getLessonPlansForCurriculum(id);
  if (plans.length > 0) {
    throw new Error(`Tidak dapat menghapus kurikulum karena masih memiliki ${plans.length} modul RPP. Harap hapus modul terlebih dahulu.`);
  }
  const mats = await getLessonMaterialsByCurriculum(id);
  if (mats.length > 0) {
    throw new Error(`Tidak dapat menghapus kurikulum karena masih memiliki ${mats.length} materi terhubung.`);
  }
  await collections.curriculums().doc(id).delete();
}

// ----------------- Lesson Plan / Module Functions -----------------
export async function getLessonPlansForCurriculum(curriculumId: string): Promise<LessonPlanDocument[]> {
  const snapshot = await collections.lessonPlans()
    .where("curriculumId", "==", curriculumId)
    .get();
  const plans = snapshot.docs.map(d => d.data() as LessonPlanDocument);
  return plans.sort((a, b) => (a.moduleNumber || 0) - (b.moduleNumber || 0));
}

export async function getLessonPlanById(id: string): Promise<LessonPlanDocument | null> {
  const doc = await collections.lessonPlans().doc(id).get();
  return doc.exists ? (doc.data() as LessonPlanDocument) : null;
}

export async function createLessonPlan(params: {
  curriculumId: string;
  moduleNumber: number;
  topicTitle: string;
  methodologySteps?: MethodologyStep[];
  learningObjectives?: string[];
  materialsNeeded?: string[];
  linkedMaterialIds?: string[];
  adminUid: string;
}): Promise<string> {
  const curr = await getCurriculumById(params.curriculumId);
  if (!curr) throw new Error("Kurikulum induk tidak ditemukan.");

  const id = `lp-${params.curriculumId}-m${String(params.moduleNumber).padStart(2, "0")}`;
  const now = Timestamp.now();

  const docData: LessonPlanDocument = {
    id,
    curriculumId: params.curriculumId,
    moduleNumber: Number(params.moduleNumber) || 1,
    topicTitle: params.topicTitle.trim(),
    methodologySteps: params.methodologySteps || [],
    learningObjectives: params.learningObjectives || [],
    materialsNeeded: params.materialsNeeded || [],
    linkedMaterialIds: params.linkedMaterialIds || [],
    createdByUid: params.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  await collections.lessonPlans().doc(id).set(docData);

  // Recalculate totalModules on Curriculum
  const allPlans = await getLessonPlansForCurriculum(params.curriculumId);
  await collections.curriculums().doc(params.curriculumId).update({
    totalModules: allPlans.length,
    updatedAt: now,
  });

  return id;
}

export async function updateLessonPlan(id: string, params: {
  moduleNumber?: number;
  topicTitle?: string;
  methodologySteps?: MethodologyStep[];
  learningObjectives?: string[];
  materialsNeeded?: string[];
  linkedMaterialIds?: string[];
}): Promise<void> {
  const ref = collections.lessonPlans().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Modul RPP tidak ditemukan.");

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };

  if (params.moduleNumber !== undefined) updateData.moduleNumber = Number(params.moduleNumber);
  if (params.topicTitle !== undefined) updateData.topicTitle = params.topicTitle.trim();
  if (params.methodologySteps !== undefined) updateData.methodologySteps = params.methodologySteps;
  if (params.learningObjectives !== undefined) updateData.learningObjectives = params.learningObjectives;
  if (params.materialsNeeded !== undefined) updateData.materialsNeeded = params.materialsNeeded;
  if (params.linkedMaterialIds !== undefined) updateData.linkedMaterialIds = params.linkedMaterialIds;

  await ref.update(updateData);
}

export async function deleteLessonPlan(id: string): Promise<void> {
  const ref = collections.lessonPlans().doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const data = doc.data() as LessonPlanDocument;

  await ref.delete();

  if (data.curriculumId) {
    const remaining = await getLessonPlansForCurriculum(data.curriculumId);
    await collections.curriculums().doc(data.curriculumId).update({
      totalModules: remaining.length,
      updatedAt: Timestamp.now(),
    });
  }
}

// ----------------- Lesson Materials Functions -----------------
export async function getAllLessonMaterials(): Promise<LessonMaterialDocument[]> {
  const snapshot = await collections.lessonMaterials().orderBy("createdAt", "desc").get();
  return snapshot.docs.map(doc => doc.data() as LessonMaterialDocument);
}

export async function getLessonMaterialById(id: string): Promise<LessonMaterialDocument | null> {
  const doc = await collections.lessonMaterials().doc(id).get();
  return doc.exists ? (doc.data() as LessonMaterialDocument) : null;
}

export async function getLessonMaterialsByCurriculum(curriculumId: string): Promise<LessonMaterialDocument[]> {
  const snapshot = await collections.lessonMaterials().where("curriculumId", "==", curriculumId).get();
  return snapshot.docs.map(d => d.data() as LessonMaterialDocument);
}

export async function createLessonMaterial(params: {
  curriculumId: string;
  lessonPlanId?: string;
  title: string;
  description: string;
  materialType: MaterialType;
  requiredPackageTier?: string;
  materialTier?: 'standard' | 'multisensory_kit' | 'premium';
  fileUrl: string;
  fileName: string;
  fileSizeBytes?: number;
  mimeType?: string;
  isRestricted?: boolean;
  version?: string;
  adminUid: string;
}): Promise<string> {
  const id = "mat-" + Date.now().toString(36) + "-" + Math.random().toString(36).substring(2, 6);
  const now = Timestamp.now();

  const docData: LessonMaterialDocument = {
    id,
    curriculumId: params.curriculumId,
    lessonPlanId: params.lessonPlanId || "",
    title: params.title.trim(),
    description: params.description.trim(),
    materialType: params.materialType,
    requiredPackageTier: params.requiredPackageTier || "standard",
    materialTier: params.materialTier || "standard",
    fileUrl: params.fileUrl.trim(),
    fileName: params.fileName.trim(),
    fileSizeBytes: Number(params.fileSizeBytes) || 0,
    mimeType: params.mimeType || "application/pdf",
    isRestricted: params.isRestricted ?? true,
    accessibleCurriculumIds: [params.curriculumId],
    downloadCount: 0,
    version: params.version || "1.0",
    createdByUid: params.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  await collections.lessonMaterials().doc(id).set(docData);

  // Update curriculum totalMaterials
  const mats = await getLessonMaterialsByCurriculum(params.curriculumId);
  await collections.curriculums().doc(params.curriculumId).update({
    totalMaterials: mats.length,
    updatedAt: now,
  });

  return id;
}

export async function updateLessonMaterial(id: string, params: {
  curriculumId?: string;
  lessonPlanId?: string;
  title?: string;
  description?: string;
  materialType?: MaterialType;
  requiredPackageTier?: string;
  materialTier?: 'standard' | 'multisensory_kit' | 'premium';
  fileUrl?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  isRestricted?: boolean;
  version?: string;
}): Promise<void> {
  const ref = collections.lessonMaterials().doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error("Aset materi tidak ditemukan.");

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };

  if (params.curriculumId !== undefined) updateData.curriculumId = params.curriculumId;
  if (params.lessonPlanId !== undefined) updateData.lessonPlanId = params.lessonPlanId;
  if (params.title !== undefined) updateData.title = params.title.trim();
  if (params.description !== undefined) updateData.description = params.description.trim();
  if (params.materialType !== undefined) updateData.materialType = params.materialType;
  if (params.requiredPackageTier !== undefined) updateData.requiredPackageTier = params.requiredPackageTier;
  if (params.materialTier !== undefined) updateData.materialTier = params.materialTier;
  if (params.fileUrl !== undefined) updateData.fileUrl = params.fileUrl.trim();
  if (params.fileName !== undefined) updateData.fileName = params.fileName.trim();
  if (params.fileSizeBytes !== undefined) updateData.fileSizeBytes = Number(params.fileSizeBytes);
  if (params.mimeType !== undefined) updateData.mimeType = params.mimeType;
  if (params.isRestricted !== undefined) updateData.isRestricted = Boolean(params.isRestricted);
  if (params.version !== undefined) updateData.version = params.version.trim();

  await ref.update(updateData);
}

export async function deleteLessonMaterial(id: string): Promise<void> {
  const ref = collections.lessonMaterials().doc(id);
  const doc = await ref.get();
  if (!doc.exists) return;
  const data = doc.data() as LessonMaterialDocument;

  await ref.delete();

  if (data.curriculumId) {
    const remaining = await getLessonMaterialsByCurriculum(data.curriculumId);
    await collections.curriculums().doc(data.curriculumId).update({
      totalMaterials: remaining.length,
      updatedAt: Timestamp.now(),
    });
  }
}

export async function incrementMaterialDownloadCount(id: string): Promise<void> {
  await collections.lessonMaterials().doc(id).update({
    downloadCount: FieldValue.increment(1),
  });
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
  if (!license || license.status !== "active") {
    return {
      allowed: false,
      materials: [],
      reason: "Lisensi sekolah tidak aktif atau telah kedaluwarsa. Silakan hubungi Central Admin.",
    };
  }

  if (curriculumId && !license.allowedCurriculums?.includes(curriculumId)) {
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

  const allowedCurriculums = license.allowedCurriculums || [];
  const allowedTiers = license.allowedMaterialTiers || ["standard"];

  // Filter materials based on curriculum and tier gating
  const filtered = materials.filter(item => {
    // If not restricted, accessible to all
    if (!item.isRestricted) return true;

    // Check if curriculum is licensed
    if (!allowedCurriculums.includes(item.curriculumId)) {
      return false;
    }

    // Check material tier
    const itemTier = item.materialTier || "standard";
    return allowedTiers.includes(itemTier as any);
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

  if (params.packageType) {
    updateData.packageType = params.packageType;
    // Synchronize package entitlements if exists in master license_types
    const pkg = await getLicenseTypeByCode(params.packageType);
    if (pkg) {
      if (pkg.allowedMaterialTiers && pkg.allowedMaterialTiers.length > 0) {
        updateData.allowedMaterialTiers = pkg.allowedMaterialTiers;
      }
      if (pkg.allowedCurriculumIds && pkg.allowedCurriculumIds.length > 0) {
        updateData.allowedCurriculums = pkg.allowedCurriculumIds;
      }
    }
  }
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

// ==========================================
// 12. Master License Type & Package Management Helpers
// ==========================================
export async function getAllLicenseTypes(includeInactive = false): Promise<LicenseTypeDocument[]> {
  const snapshot = await collections.licenseTypes().get();
  let list = snapshot.docs.map(doc => doc.data() as LicenseTypeDocument);
  if (!includeInactive) {
    list = list.filter(item => item.isActive !== false);
  }
  return list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

export async function getLicenseTypeById(id: string): Promise<LicenseTypeDocument | null> {
  const doc = await collections.licenseTypes().doc(id).get();
  return doc.exists ? (doc.data() as LicenseTypeDocument) : null;
}

export async function getLicenseTypeByCode(code: string): Promise<LicenseTypeDocument | null> {
  const snapshot = await collections.licenseTypes()
    .where("code", "==", code.trim().toLowerCase())
    .limit(1)
    .get();
  return snapshot.empty ? null : (snapshot.docs[0].data() as LicenseTypeDocument);
}

export interface CreateLicenseTypeParams {
  name: string;
  code: string;
  description: string;
  defaultPrice: number;
  billingCycle?: 'yearly' | 'monthly' | 'one_time';
  defaultMaxStudents: number;
  defaultMaxTeachers: number;
  defaultGracePeriodDays?: number;
  allowedMaterialTiers?: ('standard' | 'multisensory_kit' | 'premium')[];
  allowedCurriculumIds?: string[];
  includedMaterialIds?: string[];
  features?: string[];
  order?: number;
  adminUid: string;
}

export async function createLicenseType(params: CreateLicenseTypeParams): Promise<string> {
  const cleanCode = params.code.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  const existing = await getLicenseTypeByCode(cleanCode);
  if (existing) {
    throw new Error(`Paket lisensi dengan kode "${cleanCode}" sudah terdaftar.`);
  }

  const id = "pkg-" + cleanCode;
  const now = Timestamp.now();

  const docData: LicenseTypeDocument = {
    id,
    name: params.name.trim(),
    code: cleanCode,
    description: params.description.trim(),
    defaultPrice: Number(params.defaultPrice) || 0,
    billingCycle: params.billingCycle || "yearly",
    currency: "IDR",
    defaultMaxStudents: Number(params.defaultMaxStudents) || 100,
    defaultMaxTeachers: Number(params.defaultMaxTeachers) || 10,
    defaultGracePeriodDays: params.defaultGracePeriodDays !== undefined ? Number(params.defaultGracePeriodDays) : 14,
    allowedMaterialTiers: params.allowedMaterialTiers || ["standard"],
    allowedCurriculumIds: params.allowedCurriculumIds || [],
    includedMaterialIds: params.includedMaterialIds || [],
    features: params.features || [],
    isActive: true,
    order: params.order ?? 99,
    createdByUid: params.adminUid,
    createdAt: now,
    updatedAt: now,
  };

  await collections.licenseTypes().doc(id).set(docData);
  return id;
}

export async function updateLicenseType(id: string, params: {
  name?: string;
  description?: string;
  defaultPrice?: number;
  billingCycle?: 'yearly' | 'monthly' | 'one_time';
  defaultMaxStudents?: number;
  defaultMaxTeachers?: number;
  defaultGracePeriodDays?: number;
  allowedMaterialTiers?: ('standard' | 'multisensory_kit' | 'premium')[];
  allowedCurriculumIds?: string[];
  includedMaterialIds?: string[];
  features?: string[];
  isActive?: boolean;
  order?: number;
}): Promise<void> {
  const ref = collections.licenseTypes().doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error("Paket lisensi tidak ditemukan.");
  }

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };

  if (params.name !== undefined) updateData.name = params.name.trim();
  if (params.description !== undefined) updateData.description = params.description.trim();
  if (params.defaultPrice !== undefined) updateData.defaultPrice = Number(params.defaultPrice);
  if (params.billingCycle !== undefined) updateData.billingCycle = params.billingCycle;
  if (params.defaultMaxStudents !== undefined) updateData.defaultMaxStudents = Number(params.defaultMaxStudents);
  if (params.defaultMaxTeachers !== undefined) updateData.defaultMaxTeachers = Number(params.defaultMaxTeachers);
  if (params.defaultGracePeriodDays !== undefined) updateData.defaultGracePeriodDays = Number(params.defaultGracePeriodDays);
  if (params.allowedMaterialTiers !== undefined) updateData.allowedMaterialTiers = params.allowedMaterialTiers;
  if (params.allowedCurriculumIds !== undefined) updateData.allowedCurriculumIds = params.allowedCurriculumIds;
  if (params.includedMaterialIds !== undefined) updateData.includedMaterialIds = params.includedMaterialIds;
  if (params.features !== undefined) updateData.features = params.features;
  if (params.isActive !== undefined) updateData.isActive = Boolean(params.isActive);
  if (params.order !== undefined) updateData.order = Number(params.order);

  await ref.update(updateData);
}

export async function updateLicenseMaterials(id: string, params: {
  allowedCurriculumIds?: string[];
  includedMaterialIds?: string[];
  allowedMaterialTiers?: ('standard' | 'multisensory_kit' | 'premium')[];
}): Promise<void> {
  const ref = collections.licenseTypes().doc(id);
  const doc = await ref.get();
  if (!doc.exists) {
    throw new Error("Paket lisensi tidak ditemukan.");
  }

  const updateData: Record<string, any> = {
    updatedAt: Timestamp.now(),
  };

  if (params.allowedCurriculumIds !== undefined) updateData.allowedCurriculumIds = params.allowedCurriculumIds;
  if (params.includedMaterialIds !== undefined) updateData.includedMaterialIds = params.includedMaterialIds;
  if (params.allowedMaterialTiers !== undefined) updateData.allowedMaterialTiers = params.allowedMaterialTiers;

  await ref.update(updateData);
}

export async function toggleLicenseTypeStatus(id: string, isActive: boolean): Promise<void> {
  const ref = collections.licenseTypes().doc(id);
  await ref.update({
    isActive: Boolean(isActive),
    updatedAt: Timestamp.now(),
  });
}

export async function getAllCurriculumsAndMaterials(): Promise<{
  curriculums: CurriculumDocument[];
  materials: LessonMaterialDocument[];
}> {
  const [currSnap, matSnap] = await Promise.all([
    collections.curriculums().orderBy("gradeLevel", "asc").get(),
    collections.lessonMaterials().orderBy("title", "asc").get(),
  ]);

  return {
    curriculums: currSnap.docs.map(d => d.data() as CurriculumDocument),
    materials: matSnap.docs.map(d => d.data() as LessonMaterialDocument),
  };
}

export async function getLicenseTypeStats(): Promise<Record<string, number>> {
  const licenses = await getAllBranchLicenses();
  const stats: Record<string, number> = {};

  licenses.forEach(lic => {
    if (lic.isActive && lic.packageType) {
      const code = lic.packageType.toLowerCase();
      stats[code] = (stats[code] || 0) + 1;
    }
  });

  return stats;
}


