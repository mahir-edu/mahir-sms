import type { APIRoute } from "astro";
import { app } from "../../../firebase/server";
import { getAuth } from "firebase-admin/auth";
import { db } from "../../../firebase/firestore";
import { Timestamp } from "firebase-admin/firestore";

export const GET: APIRoute = async () => {
  const auth = getAuth(app);
  const targetEmail = "gregorius.w@gmail.com";

  try {
    const userRecord = await auth.getUserByEmail(targetEmail);
    
    // Set custom claims
    await auth.setCustomUserClaims(userRecord.uid, {
      role: "hq_admin",
      admin: true,
    });

    // Upsert Firestore users doc
    const profileData = {
      uid: userRecord.uid,
      email: targetEmail,
      displayName: userRecord.displayName || "Gregorius (Super Admin)",
      role: "hq_admin" as const,
      status: "active" as const,
      branchId: null,
      approvedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    await db.collection("users").doc(userRecord.uid).set(profileData, { merge: true });

    return new Response(JSON.stringify({
      success: true,
      message: `User ${targetEmail} berhasil dijadikan Super Admin (hq_admin).`,
      profile: profileData,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message,
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
