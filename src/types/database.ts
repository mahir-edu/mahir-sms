import type { Timestamp } from "firebase-admin/firestore";

// ==========================================
// User & Role Based Access Control
// ==========================================
export type UserRole = 'hq_admin' | 'branch_admin' | 'teacher' | 'student' | 'parent';
export type UserStatus = 'active' | 'suspended' | 'pending';

export interface UserDocument {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  role: UserRole;
  branchId?: string | null;
  status: UserStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// School Branches & Licensing (Pemancar)
// ==========================================
export type LicenseStatus = 'active' | 'pending_renewal' | 'in_grace_period' | 'expired' | 'suspended' | 'trial';
export type LicensePackageTier = 'basic' | 'standard' | 'premium' | 'enterprise';

export interface BranchAddress {
  street: string;
  city: string;
  province: string;
  postalCode: string;
}

export interface BranchContact {
  email: string;
  phone: string;
  headmasterName: string;
}

export interface BranchDocument {
  id: string;
  name: string;
  code: string;
  address: BranchAddress;
  contact: BranchContact;
  licenseStatus: LicenseStatus;
  activeLicenseId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface BranchLicenseDocument {
  id: string;
  branchId: string;
  branchName: string;
  licenseKey: string;
  packageType: LicensePackageTier;
  
  // Date & Timeline Management
  issueDate: Timestamp;
  startDate: Timestamp;
  dueDate: Timestamp;              // Payment or renewal deadline
  expiryDate: Timestamp;           // Access cutoff date
  gracePeriodDays: number;
  
  // Entitlements
  allowedCurriculums: string[];
  allowedMaterialTiers: ('standard' | 'multisensory_kit' | 'premium')[];
  maxStudents: number;
  maxTeachers: number;
  
  status: LicenseStatus;
  isActive: boolean;
  issuedByUid: string;
  billingNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// Curriculum, Lesson Plans & Lesson Materials
// ==========================================
export interface CurriculumDocument {
  id: string;
  title: string;
  subject: string;
  gradeLevel: number;              // 1 to 6
  version: string;
  description: string;
  isActive: boolean;
  totalModules: number;
  totalMaterials: number;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type MethodologyStepType = 'lihat' | 'dengar' | 'lakukan' | 'catat' | 'repetisi';

export interface MethodologyStep {
  step: MethodologyStepType;
  instruction: string;
  durationMinutes: number;
}

export interface LessonPlanDocument {
  id: string;
  curriculumId: string;
  moduleNumber: number;
  topicTitle: string;
  methodologySteps: MethodologyStep[];
  learningObjectives: string[];
  materialsNeeded: string[];
  linkedMaterialIds: string[];
  createdByUid: string;
  updatedAt: Timestamp;
}

export type MaterialType = 
  | 'worksheet' 
  | 'slide_deck' 
  | 'audio_guide' 
  | 'video_tutorial' 
  | 'printable_manipulative' 
  | 'teacher_handbook';

export interface LessonMaterialDocument {
  id: string;
  curriculumId: string;
  lessonPlanId?: string;
  title: string;
  description: string;
  materialType: MaterialType;
  requiredPackageTier: LicensePackageTier;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  
  // Licensing & Gating
  isRestricted: boolean;
  accessibleCurriculumIds: string[];
  
  downloadCount: number;
  version: string;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// Central Calendar & Event Management (HQ Admin)
// ==========================================
export type CalendarEventType = 
  | 'academic_schedule' 
  | 'teacher_training' 
  | 'holiday' 
  | 'franchise_meeting' 
  | 'exam_period' 
  | 'license_milestone';

export type EventLocationType = 'online' | 'offline' | 'hybrid';

export interface CalendarEventDocument {
  id: string;
  title: string;
  description: string;
  eventType: CalendarEventType;
  startDate: Timestamp;
  endDate: Timestamp;
  isAllDay: boolean;
  academicYearId?: string;
  
  locationType: EventLocationType;
  onlineMeetingUrl?: string;
  physicalLocation?: string;
  
  targetAudience: {
    scope: 'all_branches' | 'selected_branches' | 'hq_only';
    targetBranchIds?: string[];
    targetRoles: ('branch_admin' | 'teacher' | 'student' | 'parent')[];
  };
  
  isMandatory: boolean;
  sendEmailNotification: boolean;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ==========================================
// Classes & Rosters (Rombel)
// ==========================================
export interface AcademicYearDocument {
  id: string;
  branchId: string;
  yearLabel: string;               // e.g. "Tahun Ajaran 2026/2027"
  semester: 1 | 2;
  isCurrent: boolean;
  startDate: Timestamp;
  endDate: Timestamp;
}

export interface ClassDocument {
  id: string;
  branchId: string;
  academicYearId: string;
  name: string;                    // e.g. "Kelas 1-A (Amanah)"
  gradeLevel: number;
  homeroomTeacherUid: string;
  homeroomTeacherName: string;
  studentCount: number;
  isActive: boolean;
  createdAt: Timestamp;
}

// ==========================================
// Stakeholder Profiles
// ==========================================
export interface StudentDocument {
  uid: string;
  branchId: string;
  currentClassId: string;
  nis: string;
  nisn?: string;
  fullName: string;
  gender: 'male' | 'female';
  birthDate: string;               // YYYY-MM-DD
  parentUids: string[];
  primaryParentEmail: string;
  status: 'active' | 'graduated' | 'transferred' | 'inactive';
  enrolledAt: Timestamp;
}

export interface ParentDocument {
  uid: string;
  fullName: string;
  email: string;
  phone: string;
  address?: string;
  studentUids: string[];
  emailPreferences: {
    attendanceAlerts: boolean;
    gradeAnnouncements: boolean;
    generalAnnouncements: boolean;
  };
  createdAt: Timestamp;
}

export interface TeacherDocument {
  uid: string;
  branchId: string;
  nip?: string;
  fullName: string;
  email: string;
  specializations: string[];
  assignedClassIds: string[];
  isHomeroom: boolean;
  createdAt: Timestamp;
}

// ==========================================
// Attendance & Evaluations
// ==========================================
export type AttendanceStatus = 'present' | 'sick' | 'permission' | 'absent_unexcused';

export interface AttendanceRecord {
  id: string;                      // Key: {branchId}_{classId}_{date}_{studentUid}
  branchId: string;
  classId: string;
  studentUid: string;
  studentName: string;
  date: string;                    // "YYYY-MM-DD"
  status: AttendanceStatus;
  notes?: string;
  recordedByUid: string;
  recordedAt: Timestamp;
  alertSentToParents: boolean;
}

export type AssessmentType = 'formative' | 'summative' | 'diagnostic' | 'multisensory_practical';

export interface AssessmentDocument {
  id: string;
  branchId: string;
  classId: string;
  curriculumId?: string;
  title: string;
  type: AssessmentType;
  maxScore: number;
  assessmentDate: string;          // "YYYY-MM-DD"
  teacherUid: string;
  published: boolean;
  createdAt: Timestamp;
}

export interface StudentGradeRecord {
  id: string;                      // Key: {assessmentId}_{studentUid}
  assessmentId: string;
  branchId: string;
  classId: string;
  studentUid: string;
  studentName: string;
  score: number;
  letterGrade?: string;
  feedbackNotes?: string;
  multisensoryMastery?: {
    lihat: boolean;
    dengar: boolean;
    lakukan: boolean;
    catat: boolean;
  };
  updatedAt: Timestamp;
}

// ==========================================
// Notifications & Email Queue
// ==========================================
export type NotificationType = 
  | 'announcement' 
  | 'attendance_alert' 
  | 'grade_published' 
  | 'calendar_reminder' 
  | 'license_due';

export interface NotificationDocument {
  id: string;
  recipientUid: string;
  senderUid: string;
  branchId?: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: Timestamp;
}

export interface EmailQueueDocument {
  id: string;
  to: string | string[];
  message: {
    subject: string;
    html: string;
    text?: string;
  };
  metadata?: {
    notificationType: 'attendance_alert' | 'grade_report' | 'event_invitation' | 'school_announcement';
    branchId: string;
    studentUid?: string;
    parentUid?: string;
    eventId?: string;
  };
  delivery?: {
    state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
    attempts: number;
    error?: string;
    startTime?: Timestamp;
    endTime?: Timestamp;
  };
  createdAt: Timestamp;
}
