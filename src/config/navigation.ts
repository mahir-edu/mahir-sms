import type { UserRole } from "../types/database";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string;
  exact?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export function getNavigationForRole(role: UserRole): NavSection[] {
  const accountSection: NavSection = {
    title: "Akun Saya",
    items: [
      { label: "Profil & Akun", href: "/dashboard/profile", icon: "👤", exact: true },
    ],
  };

  let sections: NavSection[] = [];

  switch (role) {
    case "hq_admin":
      sections = [
        {
          title: "Utama",
          items: [
            { label: "Ringkasan Eksekutif", href: "/dashboard", icon: "📊", exact: true },
          ],
        },
        {
          title: "Ekosistem Sekolah",
          items: [
            { label: "Sekolah & Lisensi", href: "/dashboard/admin/branches", icon: "🏫" },
            { label: "Tipe & Paket Lisensi", href: "/dashboard/admin/licenses", icon: "💳" },
            { label: "Verifikasi Pengguna", href: "/dashboard/admin/users", icon: "👥" },
          ],
        },
        {
          title: "Kurikulum & Modul",
          items: [
            { label: "Pustaka Kurikulum", href: "/dashboard/admin/curriculum", icon: "📚" },
            { label: "Materi Berlisensi", href: "/dashboard/admin/materials", icon: "📁" },
          ],
        },
        {
          title: "Agenda Nasional",
          items: [
            { label: "Kalender & Event", href: "/dashboard/admin/calendar", icon: "📅" },
          ],
        },
      ];
      break;

    case "branch_admin":
      sections = [
        {
          title: "Utama",
          items: [
            { label: "Ringkasan Cabang", href: "/dashboard", icon: "📊", exact: true },
          ],
        },
        {
          title: "Manajemen Unit",
          items: [
            { label: "Rombongan Belajar", href: "/dashboard/classes", icon: "🏛️" },
            { label: "Rekap Presensi", href: "/dashboard/attendance", icon: "📝" },
          ],
        },
        {
          title: "Bahan Ajar & Jadwal",
          items: [
            { label: "Pustaka Modul Berlisensi", href: "/dashboard/materials", icon: "📚" },
            { label: "Kalender Kegiatan", href: "/dashboard/calendar", icon: "📅" },
          ],
        },
      ];
      break;

    case "teacher":
      sections = [
        {
          title: "Utama",
          items: [
            { label: "Ruang Guru", href: "/dashboard", icon: "📊", exact: true },
          ],
        },
        {
          title: "Pembelajaran",
          items: [
            { label: "Presensi Harian", href: "/dashboard/attendance", icon: "📝" },
            { label: "Kelas & Rombel", href: "/dashboard/classes", icon: "👥" },
            { label: "Penilaian 5-Pilar", href: "/dashboard/assessments", icon: "⭐" },
          ],
        },
        {
          title: "Pustaka & Agenda",
          items: [
            { label: "Pustaka Bahan Ajar", href: "/dashboard/materials", icon: "📚" },
            { label: "Jadwal & Agenda", href: "/dashboard/calendar", icon: "📅" },
          ],
        },
      ];
      break;

    case "parent":
      sections = [
        {
          title: "Utama",
          items: [
            { label: "Portal Wali / Mitra", href: "/dashboard", icon: "🏠", exact: true },
          ],
        },
        {
          title: "Perkembangan Ananda",
          items: [
            { label: "Presensi & Kehadiran", href: "/dashboard/attendance", icon: "📝" },
            { label: "Capaian & Rapor", href: "/dashboard/assessments", icon: "⭐" },
          ],
        },
        {
          title: "Edukasi & Komunitas",
          items: [
            { label: "Agenda & Webinar", href: "/dashboard/calendar", icon: "📅" },
          ],
        },
      ];
      break;

    default:
      sections = [
        {
          items: [
            { label: "Dashboard", href: "/dashboard", icon: "📊", exact: true },
          ],
        },
      ];
      break;
  }

  sections.push(accountSection);
  return sections;
}
