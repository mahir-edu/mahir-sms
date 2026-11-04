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
    gradeCategory: "Kelas 1 SD",
    version: "2026.1",
    description: "Kurikulum interaktif berbasis metode: Lihat, Dengar, Lakukan, Catat, dan Repetisi Bermakna.",
    isActive: true,
    totalModules: 2,
    totalMaterials: 2,
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created Central Curriculum: cur-math-sd-01");

  // 4b. Sample Lesson Plans / RPP Modules
  const lessonPlan1Id = "lp-cur-math-sd-01-m01";
  await db.collection("lesson_plans").doc(lessonPlan1Id).set({
    id: lessonPlan1Id,
    curriculumId: curriculumId,
    moduleNumber: 1,
    topicTitle: "Modul 1: Konsep Bilangan & Pola Manik Bilangan (1 - 20)",
    methodologySteps: [
      { step: "lihat", title: "Visualisasi Manik", instruction: "Tunjukkan kartu manik dan pola angka berwarna 1 sampai 10.", durationMinutes: 10 },
      { step: "dengar", title: "Ritme Lagu Angka", instruction: "Ajak siswa melafalkan irama ketukan hitungan maju dan mundur bersama guru.", durationMinutes: 10 },
      { step: "lakukan", title: "Merangkai Manik Fisik", instruction: "Siswa mengambil 10 manik dan merangkainya pada benang pemilah.", durationMinutes: 20 },
      { step: "catat", title: "Lembar Catat Angka", instruction: "Siswa menggambar jumlah manik dan menuliskan lambang angka di buku modul.", durationMinutes: 15 },
      { step: "repetisi", title: "Kuis Tebak Manik Cepat", instruction: "Guru menunjukkan pola acak, siswa menebak jumlah dengan kartu respons.", durationMinutes: 15 }
    ],
    learningObjectives: [
      "Siswa mampu membilang 1 hingga 20 secara terurut dengan bantuan manipulatif manik",
      "Siswa memahami konsep kuantitas konkrit sebelum representasi simbolik"
    ],
    materialsNeeded: ["Set Manik Plastik 20 Buah", "Tali Perangkai", "Kartu Angka Bergambar"],
    linkedMaterialIds: ["mat-multisensory-mod1-ws", "mat-multisensory-mod1-slides"],
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  const lessonPlan2Id = "lp-cur-math-sd-01-m02";
  await db.collection("lesson_plans").doc(lessonPlan2Id).set({
    id: lessonPlan2Id,
    curriculumId: curriculumId,
    moduleNumber: 2,
    topicTitle: "Modul 2: Penjumlahan Konkrit Melalui Balok Hubung",
    methodologySteps: [
      { step: "lihat", title: "Observasi Gabungan Balok", instruction: "Peragakan 3 balok biru digabung dengan 2 balok merah di meja demonstrasi.", durationMinutes: 10 },
      { step: "dengar", title: "Penjelasan Cerita Kontekstual", instruction: "Dengarkan cerita narasi anak membeli apel dan jeruk di pasar.", durationMinutes: 10 },
      { step: "lakukan", title: "Menghubungkan Balok", instruction: "Setiap kelompok menggabungkan balok sesuai lembar instruksi tantangan.", durationMinutes: 20 },
      { step: "catat", title: "Notasi Matematika", instruction: "Menuliskan kalimat matematika 3 + 2 = 5 pada jurnal siswa.", durationMinutes: 15 },
      { step: "repetisi", title: "Permainan Pasangan 10", instruction: "Cari kawan balok pelengkap 10 secepat mungkin.", durationMinutes: 15 }
    ],
    learningObjectives: [
      "Siswa mampu melakukan penjumlahan hingga 10 menggunakan benda konkrit",
      "Siswa dapat mengubah representasi fisik menjadi simbol penjumlahan (+)"
    ],
    materialsNeeded: ["Balok Hubung Mahir (Interlocking Cubes)", "Matras Hitung"],
    linkedMaterialIds: [],
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created 2 Sample Lesson Plans (RPP 5-Pilar)");

  // 5. Gated Lesson Materials
  const materialId = "mat-multisensory-mod1-ws";
  await db.collection("lesson_materials").doc(materialId).set({
    id: materialId,
    curriculumId: curriculumId,
    lessonPlanId: lessonPlan1Id,
    title: "Lembar Kerja Multisensori Modul 1: Konsep Bilangan & Manik",
    description: "Lembar kerja aktivitas manipulatif untuk membangun pemahaman konseptual bilangan 1 - 20.",
    materialType: "worksheet",
    requiredPackageTier: "standard",
    materialTier: "standard",
    fileUrl: "https://storage.googleapis.com/mahir-sms.firebasestorage.app/materials/modul1_manik.pdf",
    fileName: "modul1_manik.pdf",
    fileSizeBytes: 2450000,
    mimeType: "application/pdf",
    isRestricted: true,
    accessibleCurriculumIds: [curriculumId],
    downloadCount: 14,
    version: "1.0",
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  const material2Id = "mat-multisensory-mod1-slides";
  await db.collection("lesson_materials").doc(material2Id).set({
    id: material2Id,
    curriculumId: curriculumId,
    lessonPlanId: lessonPlan1Id,
    title: "Slide Panduan Visual Guru: Modul 1 Manik Bilangan",
    description: "Slide deck animasi visual untuk memandu sesi tatap muka dan demonstrasi manik di kelas.",
    materialType: "slide_deck",
    requiredPackageTier: "premium",
    materialTier: "multisensory_kit",
    fileUrl: "https://storage.googleapis.com/mahir-sms.firebasestorage.app/materials/modul1_slide_deck.pptx",
    fileName: "modul1_slide_deck.pptx",
    fileSizeBytes: 8750000,
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    isRestricted: true,
    accessibleCurriculumIds: [curriculumId],
    downloadCount: 8,
    version: "1.2",
    createdByUid: hqAdminUid,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  console.log("✅ Created 2 Gated Lesson Materials (Worksheet & Slides)");

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

  // 11. Master License Types / Packages
  const licensePackages = [
    {
      id: "pkg-basic",
      name: "Paket Basic Pemancar",
      code: "basic",
      description: "Paket lisensi awal untuk sekolah pemancar perintis dengan kebutuhan esensial kurikulum matematika.",
      defaultPrice: 7500000,
      billingCycle: "yearly",
      currency: "IDR",
      defaultMaxStudents: 50,
      defaultMaxTeachers: 5,
      defaultGracePeriodDays: 14,
      allowedMaterialTiers: ["standard"],
      allowedCurriculumIds: ["cur-math-sd-01"],
      includedMaterialIds: ["mat-ws-math-01"],
      features: [
        "Akses Kurikulum Matematika Dasar (SD)",
        "Lembar Kerja Siswa (Worksheets) Standar",
        "Maksimal 50 Siswa & 5 Guru",
        "Portal Presensi & Nilai Guru",
        "Portal Wali Murid & Ananda",
      ],
      isActive: true,
      order: 1,
      createdByUid: hqAdminUid,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "pkg-standard",
      name: "Paket Standard Pemancar",
      code: "standard",
      description: "Paket lisensi terpopuler untuk sekolah cabang aktif dengan dukungan modul manipulatif dan pelatihan guru.",
      defaultPrice: 15000000,
      billingCycle: "yearly",
      currency: "IDR",
      defaultMaxStudents: 150,
      defaultMaxTeachers: 15,
      defaultGracePeriodDays: 14,
      allowedMaterialTiers: ["standard", "multisensory_kit"],
      allowedCurriculumIds: ["cur-math-sd-01"],
      includedMaterialIds: ["mat-ws-math-01", "mat-slide-math-01"],
      features: [
        "Semua Fitur Paket Basic",
        "Kit Peraga Multisensori Digital (Slide Deck Interaktif)",
        "Maksimal 150 Siswa & 15 Guru",
        "Notifikasi Otomatis Email Orang Tua",
        "Akses Workshop Nasional Mahir Edu",
      ],
      isActive: true,
      order: 2,
      createdByUid: hqAdminUid,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "pkg-premium",
      name: "Paket Premium Multisensori",
      code: "premium",
      description: "Akses komprehensif ke seluruh pustaka ajar 5-pilar, kit cetak manipulatif, dan sertifikasi pendidik.",
      defaultPrice: 25000000,
      billingCycle: "yearly",
      currency: "IDR",
      defaultMaxStudents: 300,
      defaultMaxTeachers: 30,
      defaultGracePeriodDays: 14,
      allowedMaterialTiers: ["standard", "multisensory_kit", "premium"],
      allowedCurriculumIds: ["cur-math-sd-01"],
      includedMaterialIds: ["mat-ws-math-01", "mat-slide-math-01"],
      features: [
        "Akses Seluruh Pustaka Materi (Standard + Multisensory Kit + Premium)",
        "Alat Peraga Cetak & Panduan Guru Lengkap",
        "Maksimal 300 Siswa & 30 Guru",
        "Sertifikasi Pendidik Matematika Multisensori",
        "Prioritas Konsultasi Pedagogis dari Kantor Pusat",
      ],
      isActive: true,
      order: 3,
      createdByUid: hqAdminUid,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "pkg-enterprise",
      name: "Paket Enterprise Mitra Utama",
      code: "enterprise",
      description: "Solusi terintegrasi untuk jaringan sekolah besar, yayasan multi-kampus, atau mitra strategis.",
      defaultPrice: 45000000,
      billingCycle: "yearly",
      currency: "IDR",
      defaultMaxStudents: 500,
      defaultMaxTeachers: 50,
      defaultGracePeriodDays: 30,
      allowedMaterialTiers: ["standard", "multisensory_kit", "premium"],
      allowedCurriculumIds: ["cur-math-sd-01"],
      includedMaterialIds: ["mat-ws-math-01", "mat-slide-math-01"],
      features: [
        "Akses Penuh Seluruh Kurikulum & Materi Tanpa Batas",
        "Kapasitas Hingga 500 Siswa & 50 Guru",
        "Masa Tenggang Pembayaran 30 Hari",
        "Kustomisasi Branding & Modul Khusus Yayasan",
        "Dukungan Tim Teknis & Akademik Khusus (Dedicated)",
      ],
      isActive: true,
      order: 4,
      createdByUid: hqAdminUid,
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const pkg of licensePackages) {
    await db.collection("license_types").doc(pkg.id).set(pkg, { merge: true });
  }
  console.log("✅ Seeded 4 Master License Packages (Basic, Standard, Premium, Enterprise)");

  console.log("🎉 Seeding completed successfully!");
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
