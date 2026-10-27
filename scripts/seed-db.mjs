import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import fs from "fs";

if (!process.env.FIREBASE_PROJECT_ID && fs.existsSync(".env")) {
  const envContent = fs.readFileSync(".env", "utf8");
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[key] = val;
      }
    }
  });
}

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

const app = getApps().length === 0 ? initializeApp({ credential: cert(serviceAccount) }) : getApps()[0];
const db = getFirestore(app);

async function seed() {
  console.log("🌱 Starting Mahir SMS Firestore seeding...");
  const now = Timestamp.now();
  const oneYearLater = Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000));
  const dueDate = Timestamp.fromDate(new Date(Date.now() + 335 * 24 * 60 * 60 * 1000)); // Due 30 days before expiry

  // 1. Central HQ Admin Profile
  const hqAdminUid = "hq-admin-primary";
  await db.collection("users").doc(hqAdminUid).set({
    uid: hqAdminUid,
    email: "admin@mahir-edu.com",
    displayName: "Central HQ Administrator",
    role: "hq_admin",
    branchId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created HQ Admin user");

  // 2. Demo Pemancar Branch
  const branchId = "pemancar-bintaro-01";
  await db.collection("branches").doc(branchId).set({
    id: branchId,
    name: "Sekolah Pemancar Mahir Bintaro",
    code: "MHR-BTR-01",
    address: {
      street: "Jl. Bintaro Utama Sektor 9 No. 45",
      city: "Tangerang Selatan",
      province: "Banten",
      postalCode: "15229",
    },
    contact: {
      email: "bintaro@mahir-edu.com",
      phone: "+6281234567890",
      headmasterName: "Budi Santoso, S.Pd.",
    },
    licenseStatus: "active",
    activeLicenseId: "lic-btr-2026",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Branch: pemancar-bintaro-01");

  // 3. Branch License
  const licenseId = "lic-btr-2026";
  await db.collection("branch_licenses").doc(licenseId).set({
    id: licenseId,
    branchId: branchId,
    branchName: "Sekolah Pemancar Mahir Bintaro",
    licenseKey: "MHR-LIC-2026-BTR-PREMIUM-X9A",
    packageType: "premium",
    issueDate: now,
    startDate: now,
    dueDate: dueDate,
    expiryDate: oneYearLater,
    gracePeriodDays: 14,
    allowedCurriculums: ["cur-math-sd-01"],
    allowedMaterialTiers: ["standard", "multisensory_kit", "premium"],
    maxStudents: 250,
    maxTeachers: 20,
    status: "active",
    isActive: true,
    issuedByUid: hqAdminUid,
    billingNotes: "Kontrak lisensi tahunan 2026/2027",
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Branch License: lic-btr-2026");

  // 4. Central Curriculum
  const curriculumId = "cur-math-sd-01";
  await db.collection("curriculums").doc(curriculumId).set({
    id: curriculumId,
    title: "Kurikulum Matematika Multisensori Mahir SD",
    subject: "Matematika",
    gradeLevel: 1,
    version: "2026.1",
    description: "Kurikulum interaktif berbasis metode: Lihat, Dengar, Lakukan, Catat, dan Repetisi Bermakna.",
    isActive: true,
    totalModules: 12,
    totalMaterials: 36,
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Central Curriculum: cur-math-sd-01");

  // 5. Gated Lesson Material
  const materialId = "mat-multisensory-mod1-ws";
  await db.collection("lesson_materials").doc(materialId).set({
    id: materialId,
    curriculumId: curriculumId,
    title: "Lembar Kerja Multisensori Modul 1: Konsep Bilangan & Manik",
    description: "Lembar kerja aktivitas manipulatif untuk membangun pemahaman konseptual bilangan 1 - 20.",
    materialType: "worksheet",
    requiredPackageTier: "standard",
    fileUrl: "https://storage.googleapis.com/mahir-sms.firebasestorage.app/materials/modul1_manik.pdf",
    fileName: "modul1_manik.pdf",
    fileSizeBytes: 2450000,
    mimeType: "application/pdf",
    isRestricted: true,
    accessibleCurriculumIds: [curriculumId],
    downloadCount: 0,
    version: "1.0",
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Gated Lesson Material: mat-multisensory-mod1-ws");

  // 6. Central Calendar Event (Teachers)
  const eventId = "evt-national-workshop-2026";
  const eventDate = Timestamp.fromDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
  await db.collection("calendar_events").doc(eventId).set({
    id: eventId,
    title: "Workshop Nasional Pendidik Mahir: Implementasi Metode Multisensori",
    description: "Pelatihan daring bersertifikat bagi guru Sekolah Pemancar dalam menggunakan modul dan kartu manipulatif.",
    eventType: "teacher_training",
    startDate: eventDate,
    endDate: eventDate,
    isAllDay: false,
    locationType: "online",
    onlineMeetingUrl: "https://meet.google.com/mhr-sms-demo",
    targetAudience: {
      scope: "all_branches",
      targetRoles: ["branch_admin", "teacher"],
    },
    isMandatory: true,
    sendEmailNotification: true,
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Central Calendar Event: evt-national-workshop-2026");

  // 7. Central Calendar Event (Parents & Prospect Leads)
  const parentEventId = "evt-parent-webinar-2026";
  const parentEventDate = Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  await db.collection("calendar_events").doc(parentEventId).set({
    id: parentEventId,
    title: "Webinar Parenting: Membangun Minat Belajar Matematika Tanpa Rasa Takut",
    description: "Sesi interaktif daring bagi orang tua & calon wali siswa bersama tim spesialis multisensori Mahir Edu.",
    eventType: "academic_schedule",
    startDate: parentEventDate,
    endDate: parentEventDate,
    isAllDay: false,
    locationType: "online",
    onlineMeetingUrl: "https://meet.google.com/mahir-parenting-2026",
    targetAudience: {
      scope: "all_branches",
      targetRoles: ["parent"],
    },
    isMandatory: false,
    sendEmailNotification: true,
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Parent Community Event: evt-parent-webinar-2026");

  // 8. Demo Class & Enrolled Student (For linking verification)
  const classId = "class-btr-1a";
  await db.collection("classes").doc(classId).set({
    id: classId,
    branchId: branchId,
    academicYearId: "ay-2026-sem1",
    name: "Kelas 1-A (Amanah)",
    gradeLevel: 1,
    homeroomTeacherUid: "teacher-sarah-demo",
    homeroomTeacherName: "Sarah Wijaya, S.Pd.",
    studentCount: 1,
    isActive: true,
    createdAt: now,
  }, { merge: true });

  const studentId = "student-kenzo-001";
  await db.collection("students").doc(studentId).set({
    uid: studentId,
    branchId: branchId,
    currentClassId: classId,
    nis: "2026-MHR-001",
    nisn: "0123456789",
    fullName: "Kenzo Alfarizi",
    gender: "male",
    birthDate: "2019-04-12",
    parentUids: [],
    primaryParentEmail: "wali.kenzo@example.com",
    status: "active",
    enrolledAt: now,
  }, { merge: true });
  console.log("✅ Created Demo Student: Kenzo Alfarizi (NIS: 2026-MHR-001)");

  // 9. Demo Pending Teacher (To test Admin Verification portal)
  const pendingTeacherUid = "teacher-pending-demo";
  await db.collection("users").doc(pendingTeacherUid).set({
    uid: pendingTeacherUid,
    email: "budi.guru@pemancar-bintaro.sch.id",
    displayName: "Budi Hartono, S.Pd.",
    phoneNumber: "081298765432",
    role: "teacher",
    branchId: branchId,
    status: "pending_approval",
    teacherMetadata: {
      nip: "198804152011011002",
      specialization: "Matematika SD & Manipulatif",
    },
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  await db.collection("teachers").doc(pendingTeacherUid).set({
    uid: pendingTeacherUid,
    branchId: branchId,
    nip: "198804152011011002",
    fullName: "Budi Hartono, S.Pd.",
    email: "budi.guru@pemancar-bintaro.sch.id",
    specializations: ["Matematika SD & Manipulatif"],
    assignedClassIds: [],
    isHomeroom: false,
    createdAt: now,
  }, { merge: true });
  console.log("✅ Created Pending Teacher: Budi Hartono (pending_approval)");

  // 10. Demo Prospect Parent
  const prospectParentUid = "parent-prospect-demo";
  await db.collection("users").doc(prospectParentUid).set({
    uid: prospectParentUid,
    email: "amanda.bunda@gmail.com",
    displayName: "Amanda Putri (Bunda)",
    phoneNumber: "081387654321",
    role: "parent",
    branchId: branchId,
    status: "active",
    parentMetadata: {
      isProspect: true,
      studentUids: [],
      childNames: ["Rafi (Calon Siswa)"],
      preferredBranchId: branchId,
    },
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  await db.collection("parents").doc(prospectParentUid).set({
    uid: prospectParentUid,
    fullName: "Amanda Putri (Bunda)",
    email: "amanda.bunda@gmail.com",
    phone: "081387654321",
    studentUids: [],
    emailPreferences: {
      attendanceAlerts: true,
      gradeAnnouncements: true,
      generalAnnouncements: true,
    },
    createdAt: now,
  }, { merge: true });
  console.log("✅ Created Prospect Parent: Amanda Putri (Active Prospect Lead)");

  console.log("🎉 Seeding completed successfully!");
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
