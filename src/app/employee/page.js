"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/FirebaseClient";
import { signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Employee Dashboard
 * - "use client" must be first directive (kept at top)
 * - shows signed-in user
 * - realtime tasks assigned to user (by assignedTo UID or assignedEmail)
 * - status updates write back to tasks (admin sees changes)
 * - realtime reminders targeted to user; employee can dismiss (marks seen)
 *
 * Ensure src/lib/FirebaseClient.js exists and exports `auth` and `db`.
 */

export default function EmployeeDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null); // { uid, email, displayName }
  const [tasks, setTasks] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingReminders, setLoadingReminders] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName || null } : null);
    });
    return unsub;
  }, []);

  // Subscribe to tasks by uid and by email (merge without duplicates)
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setLoadingTasks(false);
      return;
    }

    setLoadingTasks(true);

    const qByUid = query(
      collection(db, "tasks"),
      where("assignedTo", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const qByEmail = query(
      collection(db, "tasks"),
      where("assignedEmail", "==", user.email),
      orderBy("createdAt", "desc")
    );

    const map = new Map();
    const applySnap = (snap) => {
      snap.docs.forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
      setTasks(Array.from(map.values()));
      setLoadingTasks(false);
    };

    const unsub1 = onSnapshot(qByUid, applySnap, (err) => {
      console.error("tasks(uid) subscription error:", err);
      setLoadingTasks(false);
    });
    const unsub2 = onSnapshot(qByEmail, applySnap, (err) => {
      console.error("tasks(email) subscription error:", err);
      setLoadingTasks(false);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  // Subscribe to reminders targeted to this user and not seen
  useEffect(() => {
    if (!user) {
      setReminders([]);
      setLoadingReminders(false);
      return;
    }

    setLoadingReminders(true);

    const qUid = query(
      collection(db, "reminders"),
      where("recipientUid", "==", user.uid),
      where("seen", "==", false),
      orderBy("createdAt", "desc")
    );
    const qEmail = query(
      collection(db, "reminders"),
      where("recipientEmail", "==", user.email),
      where("seen", "==", false),
      orderBy("createdAt", "desc")
    );

    const remMap = new Map();
    const applyRemSnap = (snap) => {
      snap.docs.forEach((d) => remMap.set(d.id, { id: d.id, ...d.data() }));
      setReminders(Array.from(remMap.values()));
      setLoadingReminders(false);
    };

    const unsubR1 = onSnapshot(qUid, applyRemSnap, (err) => {
      console.error("reminders(uid) subscription error:", err);
      setLoadingReminders(false);
    });
    const unsubR2 = onSnapshot(qEmail, applyRemSnap, (err) => {
      console.error("reminders(email) subscription error:", err);
      setLoadingReminders(false);
    });

    return () => {
      unsubR1();
      unsubR2();
    };
  }, [user]);

  // Helpers
  const getDateFromField = (field) => {
    if (!field) return null;
    if (typeof field?.toDate === "function") return field.toDate();
    if (field && typeof field.seconds === "number") return new Date(field.seconds * 1000);
    if (typeof field === "string" || typeof field === "number") {
      const d = new Date(field);
      return isNaN(d.getTime()) ? null : d;
    }
    if (field instanceof Date) return field;
    return null;
  };
  const fmt = (f) => {
    const d = getDateFromField(f);
    return d ? d.toLocaleString() : "-";
  };

  const updateStatus = async (taskId, status) => {
    try {
      await updateDoc(doc(db, "tasks", taskId), {
        status,
        updatedAt: serverTimestamp(),
        completedAt: status === "completed" ? serverTimestamp() : null,
      });
      // Admin who listens to tasks collection will see the change in realtime
    } catch (err) {
      console.error("updateStatus error:", err);
      alert("Failed to update task status: " + (err?.message || err));
    }
  };

  const dismissReminder = async (reminderId) => {
    try {
      await updateDoc(doc(db, "reminders", reminderId), { seen: true, seenAt: serverTimestamp() });
    } catch (err) {
      console.error("dismissReminder error:", err);
      alert("Failed to dismiss reminder: " + (err?.message || err));
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  const remindersByTask = useMemo(() => {
    const m = new Map();
    reminders.forEach((r) => {
      if (r.taskId) {
        const arr = m.get(r.taskId) || [];
        arr.push(r);
        m.set(r.taskId, arr);
      }
    });
    return m;
  }, [reminders]);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Employee Dashboard</h1>
          {user && (
            <div className="text-sm text-gray-700 mt-1">
              Signed in as <span className="font-semibold">{user.displayName || user.email || user.uid}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={handleLogout} className="bg-red-500 text-white px-4 py-1 rounded">
            Logout
          </button>
        </div>
      </div>

      {/* Reminders */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Reminders</h2>
        {loadingReminders ? (
          <p className="text-sm text-gray-600">Loading reminders...</p>
        ) : reminders.length === 0 ? (
          <p className="text-sm text-gray-600">No new reminders.</p>
        ) : (
          <div className="space-y-2 mt-2">
            {reminders.map((r) => (
              <div key={r.id} className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded flex justify-between">
                <div>
                  <div className="text-sm text-gray-800 font-medium">{r.message || "Reminder"}</div>
                  <div className="text-xs text-gray-600">For task: {r.taskId || "N/A"}</div>
                  <div className="text-xs text-gray-500 mt-1">Sent: {fmt(r.createdAt)}</div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => dismissReminder(r.id)} className="text-xs bg-white border px-2 py-1 rounded">
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-3">My Tasks</h2>

        {loadingTasks ? (
          <p className="text-sm text-gray-600">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-600">No tasks assigned yet.</p>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const due = getDateFromField(task.endDate || task.dueDate);
              const start = getDateFromField(task.startDate);
              const taskReminders = remindersByTask.get(task.id) || [];

              return (
                <div key={task.id} className="border p-4 rounded flex flex-col md:flex-row md:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-gray-800">{task.title || "(no title)"}</div>
                        <div className="text-sm text-gray-600 mt-1">{task.description || ""}</div>
                        <div className="text-xs text-gray-500 mt-1">Assigned by: {task.createdByName || task.createdBy || "Admin"}</div>
                      </div>

                      <div className="text-right">
                        {task.priority && (
                          <div className={`text-xs font-semibold inline-block px-2 py-1 rounded ${
                            task.priority === "high" ? "text-red-700 bg-red-100" :
                            task.priority === "medium" ? "text-yellow-700 bg-yellow-100" : "text-green-700 bg-green-100"
                          }`}>
                            {task.priority}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-gray-600">
                      <div>Start: {fmt(start)}</div>
                      <div>Due: {fmt(due)}</div>
                      <div className="mt-1">Status: <span className={`font-semibold ${task.status === "completed" ? "text-green-700" : "text-yellow-700"}`}>{task.status}</span></div>
                      {task.actualStatus && <div className="mt-1 text-sm text-gray-700">Note: {task.actualStatus}</div>}
                      {taskReminders.length > 0 && <div className="mt-2 text-xs text-yellow-800">{taskReminders.length} reminder(s) for this task</div>}
                    </div>
                  </div>

                  <div className="flex flex-col items-start md:items-end gap-2">
                    {task.status === "pending" && <button onClick={() => updateStatus(task.id, "in_progress")} className="bg-yellow-500 text-white px-3 py-1 rounded">Start</button>}
                    {task.status === "in_progress" && <button onClick={() => updateStatus(task.id, "completed")} className="bg-green-600 text-white px-3 py-1 rounded">Complete</button>}
                    {task.completedAt && <div className="text-xs text-gray-500">Completed: {fmt(task.completedAt)}</div>}
                    <div className="text-xs text-gray-500 mt-2">Last updated: {fmt(task.updatedAt || task.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}