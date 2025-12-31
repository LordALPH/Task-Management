const admin = require('firebase-admin');

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(svc) });
      return admin;
    } catch (e) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT', e);
    }
  }
  admin.initializeApp();
  return admin;
}

const a = initAdmin();
const db = a.firestore();

const normalizeStatus = (value = "") => {
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return "pending";
  if (normalized.includes("progress") || normalized.includes("process")) return "in-progress";
  if (normalized.includes("complete") || normalized.includes("done")) return "completed";
  if (normalized.includes("delay") || normalized.includes("late")) return "delayed";
  if (normalized.includes("cancel")) return "cancelled";
  if (["pending", "in-progress", "completed", "delayed", "cancelled"].includes(normalized)) return normalized;
  return "pending";
};

const normalizePriority = (value = "") => {
  const normalized = value.toString().trim().toLowerCase();
  if (!normalized) return "medium";
  if (normalized.includes("high") || normalized.includes("urgent")) return "high";
  if (normalized.includes("low")) return "low";
  if (["high", "medium", "low"].includes(normalized)) return normalized;
  return "medium";
};

const parseDateInput = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { tasks } = req.body || {};
  if (!Array.isArray(tasks) || tasks.length === 0) return res.status(400).json({ error: 'No tasks provided' });

  const results = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i] || {};
    try {
      // basic sanitization: ensure title
      if (!t.title) {
        results.push({ index: i, ok: false, error: 'missing title' });
        continue;
      }
      const payload = {
        title: t.title,
        assignedTo: t.assignedTo || '',
        assignedEmail: t.assignedEmail || '',
        assignedName: t.assignedName || '',
        startDate: parseDateInput(t.startDate),
        endDate: parseDateInput(t.endDate),
        priority: normalizePriority(t.priority),
        createdAt: a.firestore.FieldValue.serverTimestamp(),
        status: normalizeStatus(t.status),
        actualStatus: t.actualStatus || '',
      };
      const docRef = await db.collection('tasks').add(payload);
      results.push({ index: i, ok: true, id: docRef.id });
    } catch (err) {
      console.error('bulkTasks: row error', err);
      results.push({ index: i, ok: false, error: err.message || String(err) });
    }
  }

  return res.status(200).json({ results, count: results.filter(r => r.ok).length });
}
