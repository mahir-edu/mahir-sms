import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const csvHeaders = "nis,nisn,nama_siswa,jenis_kelamin,tanggal_lahir,kode_cabang,nama_kelas,nama_wali,email_wali,no_wa_wali\n";
  const sampleRow1 = "2026-MHR-101,0123456789,Muhammad Fatih Al-Ayyubi,L,2018-05-14,MHR-BTR-01,Kelas 1-A (Amanah),Farhan Al-Ayyubi,farhan.ayyubi@gmail.com,081234567891\n";
  const sampleRow2 = "2026-MHR-102,0123456790,Zahra Khairunnisa,P,2018-08-20,MHR-BTR-01,Kelas 1-A (Amanah),Siti Khadijah,siti.khadijah@gmail.com,081234567892\n";

  const content = csvHeaders + sampleRow1 + sampleRow2;

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="template_import_siswa_wali_mahir.csv"',
    },
  });
};

