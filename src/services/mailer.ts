import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { Timestamp } from "firebase-admin/firestore";
import { collections } from "../firebase/firestore";
import type { EmailQueueDocument } from "../types/database";

let cachedTransporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(user && pass && user.trim().length > 0 && pass.trim().length > 0);
}

export function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = process.env.SMTP_HOST || "smtp.hostinger.com";
  const port = Number(process.env.SMTP_PORT) || 465;
  const secure = process.env.SMTP_SECURE !== undefined 
    ? process.env.SMTP_SECURE === "true" 
    : port === 465;

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!.trim(),
      pass: process.env.SMTP_PASS!.trim(),
    },
    // Useful defaults for modern hosting
    tls: {
      rejectUnauthorized: true,
    },
  });

  return cachedTransporter;
}

export interface SendMailParams {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Sends an email directly via the configured SMTP server.
 */
export async function sendMailDirect(params: SendMailParams): Promise<SendMailResult> {
  const transporter = getTransporter();

  if (!transporter) {
    return {
      success: false,
      error: "SMTP belum dikonfigurasi. Pastikan SMTP_USER dan SMTP_PASS telah disetel di environment variables.",
    };
  }

  const defaultFrom = process.env.SMTP_FROM || `"Mahir School Management System" <${process.env.SMTP_USER}>`;

  try {
    const info = await transporter.sendMail({
      from: params.from || defaultFrom,
      to: Array.isArray(params.to) ? params.to.join(", ") : params.to,
      subject: params.subject,
      text: params.text || "",
      html: params.html,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (err: any) {
    console.error("[Mailer] Error sending email via SMTP:", err.message);
    return {
      success: false,
      error: err.message || "Gagal mengirim email melalui SMTP.",
    };
  }
}

/**
 * Process pending emails in the Firestore `email_queue` collection.
 */
export async function processEmailQueue(batchLimit = 25): Promise<{
  processed: number;
  successCount: number;
  errorCount: number;
  results: { id: string; success: boolean; error?: string }[];
}> {
  if (!isSmtpConfigured()) {
    return {
      processed: 0,
      successCount: 0,
      errorCount: 0,
      results: [],
    };
  }

  // Find PENDING emails or ERROR items with attempts < 3
  const snapshot = await collections.emailQueue()
    .where("delivery.state", "in", ["PENDING", "ERROR"])
    .limit(batchLimit)
    .get();

  const results: { id: string; success: boolean; error?: string }[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data() as EmailQueueDocument;
    const attempts = (data.delivery?.attempts || 0) + 1;

    // Skip if already attempted 3 times and still failed
    if (data.delivery?.state === "ERROR" && attempts > 3) {
      continue;
    }

    await doc.ref.update({
      "delivery.state": "PROCESSING",
      "delivery.startTime": Timestamp.now(),
      "delivery.attempts": attempts,
    });

    const sendRes = await sendMailDirect({
      to: data.to,
      subject: data.message.subject,
      html: data.message.html,
      text: data.message.text,
    });

    const now = Timestamp.now();
    if (sendRes.success) {
      await doc.ref.update({
        "delivery.state": "SUCCESS",
        "delivery.endTime": now,
        "delivery.error": null,
      });
      successCount++;
      results.push({ id: doc.id, success: true });
    } else {
      await doc.ref.update({
        "delivery.state": "ERROR",
        "delivery.endTime": now,
        "delivery.error": sendRes.error || "Gagal mengirim email",
      });
      errorCount++;
      results.push({ id: doc.id, success: false, error: sendRes.error });
    }
  }

  return {
    processed: results.length,
    successCount,
    errorCount,
    results,
  };
}
