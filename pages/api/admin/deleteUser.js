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
  const { uid, email } = req.body || {};
  if (!uid && !email) return res.status(400).json({ error: 'uid or email required' });

  let targetUid = uid;
  try {
    if (!targetUid && email) {
      const u = await a.auth().getUserByEmail(email);
      if (u && u.uid) targetUid = u.uid;
    }
  } catch (e) {
    // proceed; user may not exist in auth
    console.warn('getUserByEmail failed', e.message || e);
  }

  const errors = [];
  // delete auth user if exists
  if (targetUid) {
    try {
      await a.auth().deleteUser(targetUid);
    } catch (e) {
      console.warn('deleteUser auth failed', e.message || e);
      errors.push({ type: 'authDelete', message: e.message || String(e) });
    }
  }

  // delete Firestore user doc
  try {
    const userRef = targetUid ? db.collection('users').doc(targetUid) : null;
    if (userRef) await userRef.delete();
  } catch (e) {
    console.warn('delete user doc failed', e.message || e);
    errors.push({ type: 'userDoc', message: e.message || String(e) });
  }

  // delete tasks assigned to uid or email
  try {
    const batch = db.batch();
    // by uid
    if (targetUid) {
      const snap = await db.collection('tasks').where('assignedTo', '==', targetUid).get();
      snap.forEach((d) => batch.delete(d.ref));
    }
    // by email
    if (email) {
      const snap2 = await db.collection('tasks').where('assignedEmail', '==', email).get();
      snap2.forEach((d) => batch.delete(d.ref));
    }
    await batch.commit();
  } catch (e) {
    console.warn('delete tasks failed', e.message || e);
    errors.push({ type: 'tasks', message: e.message || String(e) });
  }

  return res.status(200).json({ ok: errors.length === 0, errors });
}
