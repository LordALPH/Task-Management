"use client";
import { useEffect, useState } from "react";
import { auth, db } from "../lib/FirebaseClient";
import { signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function EmployeeDashboard() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, "tasks"), where("assignedTo", "==", auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(list);
      setLoading(false);
    });
    return unsubscribe;
  }, [auth.currentUser]);

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, "tasks", id), {
      status,
      completedAt: status === "completed" ? serverTimestamp() : null,
    });
  };

  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between mb-6">
        <h1 className="text-2xl font-bold">Employee Dashboard</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-4 py-1 rounded"
        >
          Logout
        </button>
      </div>

      {loading ? (
        <p>Loading tasks...</p>
      ) : tasks.length === 0 ? (
        <p>No tasks assigned yet.</p>
      ) : (
        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="border-b pb-3 flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{task.title}</p>
                <p className="text-sm text-gray-500">
                  Due: {new Date(task.dueDate.seconds * 1000).toLocaleDateString()}
                </p>
                <p
                  className={`text-sm font-semibold ${
                    task.status === "completed"
                      ? "text-green-600"
                      : "text-yellow-600"
                  }`}
                >
                  {task.status}
                </p>
              </div>
              <div>
                {task.status === "pending" && (
                  <button
                    onClick={() => updateStatus(task.id, "in_progress")}
                    className="bg-yellow-500 text-white px-3 py-1 rounded"
                  >
                    Start
                  </button>
                )}
                {task.status === "in_progress" && (
                  <button
                    onClick={() => updateStatus(task.id, "completed")}
                    className="bg-green-600 text-white px-3 py-1 rounded"
                  >
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
