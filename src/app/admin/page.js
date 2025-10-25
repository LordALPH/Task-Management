"use client";
import { useState, useEffect } from "react";
import { auth, db } from "../lib/FirebaseClient";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { useRouter } from "next/navigation";
import DashboardAnalytics from "./component/DashboardAnalytics";

export default function AdminDashboard() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Employee form state
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const defaultPassword = "12345678";

  // 🔹 Fetch all users + tasks
  useEffect(() => {
    const fetchData = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const tasksSnap = await getDocs(collection(db, "tasks"));
      setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    };
    fetchData();
  }, []);
  useEffect(() => {
  // Real-time listener for users
  const usersRef = collection(db, "users");
  const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
    setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  });

  // Real-time listener for tasks
  const tasksRef = collection(db, "tasks");
  const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
    setTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  });

  setLoading(false);

  // Clean up listeners on unmount
  return () => {
    unsubscribeUsers();
    unsubscribeTasks();
  };
}, []);

useEffect(() => {
  const fetchData = async () => {
    const usersSnap = await getDocs(collection(db, "users"));
    const tasksSnap = await getDocs(collection(db, "tasks"));
    setUsers(usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setTasks(tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };
  fetchData();
}, []);


  // 🔹 Add new employee
  const addEmployee = async (e) => {
    e.preventDefault();
    try {
      const userCred = await createUserWithEmailAndPassword(
        auth,
        empEmail,
        defaultPassword
      );
      await setDoc(doc(db, "users", userCred.user.uid), {
        uid: userCred.user.uid,
        name: empName,
        email: empEmail,
        role: "employee",
        createdAt: serverTimestamp(),
      });
      alert("👤 Employee created successfully!");
      setEmpEmail("");
      setEmpName("");
    } catch (err) {
      alert("Error: " + err.message);
    }
  };

  // 🔹 Add Task (assign by email instead of ID)
  const addTask = async (e) => {
    e.preventDefault();

    // Find employee by email
    const employeeSnap = await getDocs(
      query(collection(db, "users"), where("email", "==", assignedEmail))
    );

    if (employeeSnap.empty) {
      alert("❌ No employee found with that email.");
      return;
    }

    const employee = employeeSnap.docs[0].data();

    await addDoc(collection(db, "tasks"), {
      title,
      assignedTo: employee.uid,
      assignedEmail: employee.email,
      assignedName: employee.name || "",
      dueDate: new Date(dueDate),
      createdAt: serverTimestamp(),
      status: "pending",
    });

    setTitle("");
    setAssignedEmail("");
    setDueDate("");
    alert("✅ Task added successfully!");
  };

  // 🔹 Logout
  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold text-gray-800">🧩 Admin Dashboard</h1>
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-md"
        >
          Logout
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Employee Section */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">👷 Add Employee</h2>
          <form onSubmit={addEmployee}>
            <input
              type="text"
              placeholder="Employee Name"
              className="border p-2 w-full mb-3 rounded"
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Employee Email"
              className="border p-2 w-full mb-3 rounded"
              value={empEmail}
              onChange={(e) => setEmpEmail(e.target.value)}
              required
            />
            <button className="bg-green-600 hover:bg-green-700 text-white w-full py-2 rounded">
              Add Employee
            </button>
          </form>
          <p className="text-sm text-gray-500 mt-3">
            Default password for all new employees:{" "}
            <span className="font-semibold">{defaultPassword}</span>
          </p>
        </div>

        {/* Task Section */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">📝 Add Task</h2>
          <form onSubmit={addTask}>
            <input
              type="text"
              placeholder="Task Title"
              className="border p-2 w-full mb-3 rounded"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="Assign to (Employee Email)"
              className="border p-2 w-full mb-3 rounded"
              value={assignedEmail}
              onChange={(e) => setAssignedEmail(e.target.value)}
              required
            />
            <input
              type="date"
              className="border p-2 w-full mb-3 rounded"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
            <button className="bg-blue-600 hover:bg-blue-700 text-white w-full py-2 rounded">
              Add Task
            </button>
          </form>
        </div>
      </div>

      {/* 🔹 Show all users with roles */}
      <div className="bg-white p-6 rounded-2xl shadow-md mt-8">
        <h2 className="text-xl font-semibold mb-4">👥 All Users</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{u.name || "-"}</td>
                  <td className="p-2">{u.email}</td>
                  <td
                    className={`p-2 font-semibold ${
                      u.role === "admin" ? "text-blue-600" : "text-green-600"
                    }`}
                  >
                    {u.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 🔹 Show all tasks */}
      <div className="bg-white p-6 rounded-2xl shadow-md mt-8">
        <h2 className="text-xl font-semibold mb-4">📋 All Tasks</h2>
        {loading ? (
          <p>Loading...</p>
        ) : tasks.length > 0 ? (
          <div className="divide-y">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex justify-between items-center py-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{task.title}</p>
                  <p className="text-sm text-gray-500">
                    Assigned to:{" "}
                    {task.assignedName
                      ? `${task.assignedName} (${task.assignedEmail})`
                      : task.assignedEmail || "Unknown"}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    task.status === "completed"
                      ? "text-green-600"
                      : "text-yellow-600"
                  }`}
                >
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No tasks found.</p>
        )}
      </div>

      <DashboardAnalytics tasks={tasks} />
    </div>
  );
}
