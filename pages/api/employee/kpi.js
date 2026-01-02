const admin = require("firebase-admin");

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      return admin;
    } catch (err) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", err);
    }
  }
  admin.initializeApp();
  return admin;
}

const app = initAdmin();
const db = app.firestore();

const isTimestamp = (value) => {
  return Boolean(
    value &&
    typeof value.toDate === "function" &&
    (typeof value.seconds === "number" || typeof value._seconds === "number")
  );
};

const serializeValue = (value) => {
  if (value === undefined || value === null) return null;
  if (isTimestamp(value)) {
    try {
      return value.toDate().toISOString();
    } catch (_) {
      return null;
    }
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }
  if (typeof value === "object") {
    const result = {};
    Object.keys(value).forEach((key) => {
      result[key] = serializeValue(value[key]);
    });
    return result;
  }
  return value;
};

async function verifyUserRequest(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await app.auth().verifyIdToken(token);
    if (!decoded || !decoded.uid) {
      return null;
    }
    return decoded;
  } catch (err) {
    console.error("Failed to verify employee token", err);
    return null;
  }
}

async function collectOwnerIds(uid) {
  const ownerIds = new Set();
  if (uid) ownerIds.add(uid);
  try {
    const usersRef = db.collection("users");
    const directDoc = await usersRef.doc(uid).get();
    if (directDoc.exists) {
      ownerIds.add(directDoc.id);
      const directData = directDoc.data() || {};
      if (directData.uid) ownerIds.add(directData.uid);
    } else {
      const altSnap = await usersRef.where("uid", "==", uid).limit(1).get();
      if (!altSnap.empty) {
        ownerIds.add(altSnap.docs[0].id);
        const altData = altSnap.docs[0].data() || {};
        if (altData.uid) ownerIds.add(altData.uid);
      }
    }
  } catch (err) {
    console.error("Failed to resolve owner ids", err);
  }
  return Array.from(ownerIds).filter(Boolean);
}

async function fetchKpisForOwner(ownerId) {
  if (!ownerId) return [];
  const snapshot = await db.collection("kpi").where("userId", "==", ownerId).get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...serializeValue(docSnap.data() || {}) }));
}

async function fetchKpisForEmail(email) {
  if (!email) return [];
  const snapshot = await db.collection("kpi").where("userEmail", "==", email).get();
  return snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...serializeValue(docSnap.data() || {}) }));
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const decoded = await verifyUserRequest(req);
  if (!decoded) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const entriesMap = new Map();
    const ownerIds = await collectOwnerIds(decoded.uid);
    for (const ownerId of ownerIds) {
      const rows = await fetchKpisForOwner(ownerId);
      rows.forEach((row) => entriesMap.set(row.id, row));
    }

    const emailCandidates = new Set();
    if (decoded.email) {
      emailCandidates.add(decoded.email);
      const lower = decoded.email.toLowerCase();
      if (lower !== decoded.email) {
        emailCandidates.add(lower);
      }
    }

    for (const email of emailCandidates) {
      const rows = await fetchKpisForEmail(email);
      rows.forEach((row) => entriesMap.set(row.id, row));
    }

    return res.status(200).json({ entries: Array.from(entriesMap.values()) });
  } catch (err) {
    console.error("KPI API error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch KPI records" });
  }
}
