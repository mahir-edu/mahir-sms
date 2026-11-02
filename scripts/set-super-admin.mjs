import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
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
const auth = getAuth(app);
const db = getFirestore(app);

const targetEmail = "gregorius.w@gmail.com";

async function makeSuperAdmin() {
  console.log(`🔍 Searching for user with email: ${targetEmail}...`);
  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(targetEmail);
    console.log(`✅ Found Firebase Auth user: UID = ${userRecord.uid}`);
  } catch (err) {
    console.error(`❌ User not found in Firebase Auth:`, err.message);
    process.exit(1);
  }

  // 1. Set Custom User Claims in Firebase Auth
  console.log("⚙️ Setting Firebase Auth custom claims (role: hq_admin, admin: true)...");
  await auth.setCustomUserClaims(userRecord.uid, {
    role: "hq_admin",
    admin: true,
  });

  // 2. Upsert profile in Firestore `users` collection
  console.log("📝 Upserting Firestore `users` document...");
  const userRef = db.collection("users").doc(userRecord.uid);
  const now = Timestamp.now();

  const profileData = {
    uid: userRecord.uid,
    email: targetEmail,
    displayName: userRecord.displayName || "Gregorius (Super Admin)",
    role: "hq_admin",
    status: "active",
    branchId: null,
    approvedAt: now,
    updatedAt: now,
  };

  await userRef.set(profileData, { merge: true });

  console.log("🎉 SUCCESS! User gregorius.w@gmail.com is now configured as Super Admin (hq_admin).");
  console.log("Document details:", profileData);
}

makeSuperAdmin().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
