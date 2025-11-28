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
        startDate: t.startDate ? new Date(t.startDate) : null,
        endDate: t.endDate ? new Date(t.endDate) : null,
        priority: t.priority || 'medium',
        createdAt: a.firestore.FieldValue.serverTimestamp(),
        status: t.status || 'pending',
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
