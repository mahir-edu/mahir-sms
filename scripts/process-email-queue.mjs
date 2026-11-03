import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import nodemailer from "nodemailer";
import fs from "fs";

// 1. Load .env if present
if (fs.existsSync(".env")) {
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

const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

if (!smtpUser || !smtpPass) {
  console.log("ℹ️ SMTP_USER / SMTP_PASS belum disetel di .env. Antrean email dilewati.");
  process.exit(0);
}

// 2. Initialize Firebase
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
db.settings({ ignoreUndefinedProperties: true });

// 3. Configure Transporter
const host = process.env.SMTP_HOST || "smtp.hostinger.com";
const port = Number(process.env.SMTP_PORT) || 465;
const secure = process.env.SMTP_SECURE !== undefined ? process.env.SMTP_SECURE === "true" : port === 465;
const defaultFrom = process.env.SMTP_FROM || `"Mahir School Management System" <${smtpUser}>`;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user: smtpUser.trim(),
    pass: smtpPass.trim(),
  },
  tls: {
    rejectUnauthorized: true,
  },
});

async function run() {
  console.log(`[Queue Runner] Memeriksa antrean email di Firestore... (SMTP: ${host}:${port})`);

  const snapshot = await db.collection("email_queue")
    .where("delivery.state", "in", ["PENDING", "ERROR"])
    .limit(50)
    .get();

  if (snapshot.empty) {
    console.log("✨ Tidak ada email dalam antrean yang perlu dikirim.");
    process.exit(0);
  }

  console.log(`📨 Ditemukan ${snapshot.size} email untuk diproses.`);

  let successCount = 0;
  let errorCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const attempts = (data.delivery?.attempts || 0) + 1;

    if (data.delivery?.state === "ERROR" && attempts > 3) {
      console.log(`⏩ Melewati email ${doc.id} (sudah gagal 3 kali).`);
      continue;
    }

    await doc.ref.update({
      "delivery.state": "PROCESSING",
      "delivery.startTime": Timestamp.now(),
      "delivery.attempts": attempts,
    });

    try {
      await transporter.sendMail({
        from: defaultFrom,
        to: Array.isArray(data.to) ? data.to.join(", ") : data.to,
        subject: data.message?.subject || "Pemberitahuan Mahir SMS",
        text: data.message?.text || "",
        html: data.message?.html || "",
      });

      await doc.ref.update({
        "delivery.state": "SUCCESS",
        "delivery.endTime": Timestamp.now(),
        "delivery.error": null,
      });

      console.log(`  ✓ Berhasil kirim ke: ${Array.isArray(data.to) ? data.to.join(", ") : data.to} (${data.message?.subject})`);
      successCount++;
    } catch (err) {
      console.error(`  ✗ Gagal kirim ke: ${data.to} - Error:`, err.message);
      await doc.ref.update({
        "delivery.state": "ERROR",
        "delivery.endTime": Timestamp.now(),
        "delivery.error": err.message || "Gagal mengirim email",
      });
      errorCount++;
    }
  }

  console.log(`\n🎉 Selesai memproses antrean. Berhasil: ${successCount}, Gagal: ${errorCount}`);
  process.exit(0);
}

run().catch(err => {
  console.error("Fatal queue runner error:", err);
  process.exit(1);
});
