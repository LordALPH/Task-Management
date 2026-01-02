const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      return admin;
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT', err);
    }
  }
  admin.initializeApp();
  return admin;
}

const a = initAdmin();
const db = a.firestore();

const isTimestamp = (value) => {
  return Boolean(
    value &&
    typeof value.toDate === 'function' &&
    (typeof value.seconds === 'number' || typeof value._seconds === 'number')
  );
};

const serializeValue = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
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
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).forEach((key) => {
      result[key] = serializeValue(value[key]);
    });
    return result;
  }
  return value;
};

async function verifyAdminRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const decoded = await a.auth().verifyIdToken(token);
    if (decoded && (decoded.admin || decoded.role === 'admin')) {
      return decoded;
    }
    if (!decoded || !decoded.uid) {
      return null;
    }
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists && userDoc.data() && userDoc.data().role === 'admin') {
      return decoded;
    }
  } catch (err) {
    console.error('Failed to verify admin token', err);
    return null;
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const decoded = await verifyAdminRequest(req);
    if (!decoded) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const snapshot = await db.collection('attendance').get();
    const entries = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...serializeValue(docSnap.data() || {}),
    }));

    return res.status(200).json({ entries });
  } catch (err) {
    console.error('Attendance API error:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch attendance records' });
  }
}
