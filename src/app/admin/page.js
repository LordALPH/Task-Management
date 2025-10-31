"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../lib/FirebaseClient";
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut } from "firebase/auth";
import DashboardAnalytics from "./component/DashboardAnalytics";

export default function AdminDashboard() {
  const router = useRouter();
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(""); // new: dropdown selection
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Add Employee form state
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const defaultPassword = "12345678";

  // Task priority state (new)
  const [priority, setPriority] = useState("medium"); // options: low, medium, high

  // delete-mode toggles shown at section headings (right side)
  const [showDeleteUsers, setShowDeleteUsers] = useState(false);
  const [showDeleteTasks, setShowDeleteTasks] = useState(false);

  // actual status map (editable boxes per task)
  const [actualStatusMap, setActualStatusMap] = useState({});

  // reminder selection
  const [selectedReminderIds, setSelectedReminderIds] = useState(new Set());
  const [sending, setSending] = useState(false);

  // 🔹 Fetch all users + tasks (initial)
  useEffect(() => {
    const fetchData = async () => {
      const usersSnap = await getDocs(collection(db, "users"));
      const tasksSnap = await getDocs(collection(db, "tasks"));
      const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const tasksData = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(usersData);
      setTasks(tasksData);
      // initialise actualStatusMap from tasks
      const map = {};
      tasksData.forEach((t) => (map[t.id] = t.actualStatus || ""));
      setActualStatusMap(map);
      setLoading(false);
    };
    fetchData();
  }, []);

  // Real-time listeners
  useEffect(() => {
    const usersRef = collection(db, "users");
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const tasksRef = collection(db, "tasks");
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      const t = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTasks(t);
      // keep actualStatusMap in sync with latest tasks
      setActualStatusMap((prev) => {
        const next = { ...prev };
        t.forEach((task) => {
          if (typeof task.actualStatus !== "undefined") next[task.id] = task.actualStatus;
          else if (!(task.id in next)) next[task.id] = "";
        });
        // remove keys for deleted tasks
        Object.keys(next).forEach((k) => {
          if (!t.find((x) => x.id === k)) delete next[k];
        });
        return next;
      });
    });

    setLoading(false);

    return () => {
      unsubscribeUsers();
      unsubscribeTasks();
    };
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

  // helper to convert Firestore Timestamp or Date-like to Date object
  const toDateObj = (d) => {
    if (!d) return null;
    if (d.toDate && typeof d.toDate === "function") return d.toDate();
    if (d instanceof Date) return d;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? null : parsed;
  };

  // 🔹 Add Task (assign by dropdown or email + start & end dates + priority)
  const addTask = async (e) => {
    e.preventDefault();

    if (!startDate || !endDate) {
      alert("Please select both start and end dates.");
      return;
    }

    const sDate = new Date(startDate);
    const eDate = new Date(endDate);
    if (sDate > eDate) {
      alert("Start date cannot be after end date.");
      return;
    }

    let employee = null;
    // if admin selected from dropdown, use that user directly
    if (selectedUserId) {
      employee = users.find((u) => u.id === selectedUserId);
      if (!employee) {
        alert("Selected member not found. Try selecting again.");
        return;
      }
    } else {
      // fallback: lookup by entered email
      const employeeSnap = await getDocs(
        query(collection(db, "users"), where("email", "==", assignedEmail))
      );

      if (employeeSnap.empty) {
        alert("❌ No employee found with that email.");
        return;
      }
      employee = employeeSnap.docs[0].data();
    }

    await addDoc(collection(db, "tasks"), {
      title,
      assignedTo: employee.uid,
      assignedEmail: employee.email,
      assignedName: employee.name || "",
      startDate: sDate,
      endDate: eDate,
      priority: priority, // new field
      createdAt: serverTimestamp(),
      status: "pending",
      actualStatus: "",
    });

    // reset form
    setTitle("");
    setSelectedUserId("");
    setAssignedEmail("");
    setStartDate("");
    setEndDate("");
    setPriority("medium");
    alert("✅ Task added successfully!");
  };

  // 🔹 Delete user and all related tasks
  const deleteUser = async (userId, userName, userEmailParam = null) => {
    const ok = confirm(
      `Delete user "${userName}"? This will remove their Firestore record and ALL related tasks.`
    );
    if (!ok) return;

    try {
      // get email if not provided
      let userEmail = userEmailParam;
      if (!userEmail) {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        if (userSnap && userSnap.exists()) {
          userEmail = userSnap.data().email;
        }
      }

      // collect related task ids (assignedTo uid and assignedEmail)
      const idsToDelete = new Set();

      const qByUid = query(collection(db, "tasks"), where("assignedTo", "==", userId));
      const snapByUid = await getDocs(qByUid);
      snapByUid.forEach((d) => idsToDelete.add(d.id));

      if (userEmail) {
        const qByEmail = query(
          collection(db, "tasks"),
          where("assignedEmail", "==", userEmail)
        );
        const snapByEmail = await getDocs(qByEmail);
        snapByEmail.forEach((d) => idsToDelete.add(d.id));
      }

      // delete tasks
      const deleteTasksPromises = Array.from(idsToDelete).map((tid) =>
        deleteDoc(doc(db, "tasks", tid))
      );
      await Promise.all(deleteTasksPromises);

      // delete user doc
      await deleteDoc(doc(db, "users", userId));

      alert(`User removed. Deleted ${idsToDelete.size} related task(s).`);
      // onSnapshot listeners will update UI automatically
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  // 🔹 Delete single task
  const deleteTask = async (taskId, taskTitle) => {
    const ok = confirm(`Delete task "${taskTitle}"?`);
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "tasks", taskId));
      alert("Task removed.");
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  // save actual status to Firestore
  const saveActualStatus = async (taskId) => {
    try {
      const value = actualStatusMap[taskId] ?? "";
      await updateDoc(doc(db, "tasks", taskId), { actualStatus: value });
      alert("Actual status saved.");
    } catch (err) {
      alert("Save failed: " + err.message);
    }
  };

  const handleActualChange = (taskId, v) => {
    setActualStatusMap((p) => ({ ...p, [taskId]: v }));
  };

  // 🔹 Logout
  const handleLogout = async () => {
    await signOut(auth);
    router.push("/login");
  };

  // 🔹 Evaluation: compute completion rate, grade, remarks for each user
  const evaluation = useMemo(() => {
    if (!users || users.length === 0) return [];

    return users.map((u) => {
      const userTasks = tasks.filter(
        (t) =>
          (t.assignedTo && t.assignedTo === u.uid) ||
          (t.assignedEmail && t.assignedEmail === u.email)
      );
      const total = userTasks.length;
      const completed = userTasks.filter((t) => t.status === "completed")
        .length;
      const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

      let grade;
      if (rate > 90) grade = "A";
      else if (rate >= 85 && rate <= 90) grade = "B";
      else if (rate >= 80 && rate <= 84) grade = "C";
      else if (rate >= 70 && rate <= 79) grade = "D";
      else grade = "F";

      const remarks = grade === "F" ? "need improvment" : "";

      return {
        id: u.id,
        name: u.name || "-",
        email: u.email,
        total,
        completed,
        rate,
        grade,
        remarks,
      };
    });
  }, [users, tasks]);

  // compute reminders: tasks pending and due within next 3 days (including today)
  const remindersList = useMemo(() => {
    const results = [];

    tasks.forEach((t) => {
      if (!t.endDate) return;
      if (t.status === "completed") return;

      const end = toDateObj(t.endDate);
      if (!end) return;

      // compute days left (difference in days, whole number)
      const today = new Date();
      const diffMs = end.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (daysLeft <= 3 && daysLeft >= 0) {
        // find user info
        const user = users.find(
          (u) => (t.assignedTo && u.uid === t.assignedTo) || (u.email === t.assignedEmail)
        );
        results.push({
          taskId: t.id,
          taskTitle: t.title,
          assignedName: t.assignedName || (user ? user.name : t.assignedEmail || "Unknown"),
          assignedEmail: t.assignedEmail || (user ? user.email : ""),
          assignedUid: t.assignedTo || (user ? user.uid : null),
          status: t.status,
          endDate: end,
          daysLeft,
        });
      }
    });

    return results.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [tasks, users]);

  const formatDate = (d) => {
    if (!d) return "-";
    // Firestore Timestamp
    if (d.toDate && typeof d.toDate === "function") {
      return d.toDate().toLocaleDateString();
    }
    // Date object
    if (d instanceof Date) return d.toLocaleDateString();
    // string fallback
    try {
      return new Date(d).toLocaleDateString();
    } catch {
      return "-";
    }
  };

  // toggle selection
  const toggleSelect = (taskId) => {
    const ns = new Set(selectedReminderIds);
    if (ns.has(taskId)) ns.delete(taskId);
    else ns.add(taskId);
    setSelectedReminderIds(ns);
  };

  // create portal notifications in Firestore for selected tasks' recipients
  const sendPortalReminders = async () => {
    if (selectedReminderIds.size === 0) {
      alert("Select at least one task to send portal reminders.");
      return;
    }
    setSending(true);
    try {
      const promises = [];
      remindersList.forEach((r) => {
        if (!selectedReminderIds.has(r.taskId)) return;
        const message = `Reminder: Task "${r.taskTitle}" is due in ${r.daysLeft} day(s). Please complete it.`;
        const payload = {
          taskId: r.taskId,
          recipientUid: r.assignedUid || null,
          recipientEmail: r.assignedEmail || null,
          title: `Task due soon: ${r.taskTitle}`,
          message,
          sentBy: auth.currentUser ? auth.currentUser.uid : "admin",
          read: false,
          createdAt: serverTimestamp(),
        };
        promises.push(addDoc(collection(db, "notifications"), payload));
      });
      await Promise.all(promises);
      alert("Portal reminders created.");
    } catch (err) {
      alert("Failed to create reminders: " + err.message);
    } finally {
      setSending(false);
    }
  };

  // open mailto compose for selected recipients (grouped)
  const openEmailCompose = () => {
    if (selectedReminderIds.size === 0) {
      alert("Select at least one task to email.");
      return;
    }
    const emails = new Set();
    const subjects = [];
    const bodies = [];

    remindersList.forEach((r) => {
      if (!selectedReminderIds.has(r.taskId)) return;
      if (r.assignedEmail) emails.add(r.assignedEmail);
      subjects.push(`${r.taskTitle} due in ${r.daysLeft} day(s)`);
      bodies.push(`${r.assignedName || r.assignedEmail} — Task: ${r.taskTitle}\nDue: ${formatDate(r.endDate)} (${r.daysLeft} day(s) left)\nStatus: ${r.status}\n\n`);
    });

    const to = Array.from(emails).join(",");
    const subject = encodeURIComponent(`Task Reminder: ${subjects.slice(0,3).join("; ")}`);
    const body = encodeURIComponent(`Dear team,\n\nYou have urgent tasks due soon:\n\n${bodies.join("")}\nPlease complete them as soon as possible.\n\nRegards,\nAdmin`);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank");
  };

  // convenience: send both portal notification and open email compose
  const sendBoth = async () => {
    await sendPortalReminders();
    openEmailCompose();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-6 rounded-2xl mb-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center items-center mb-3">
            <div className="inline-flex items-center gap-3">
              <div className="bg-white/10 p-2 rounded-md">
                <svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect width="48" height="48" rx="8" fill="white" fillOpacity="0.06" />
                  <path d="M12 9v30M36 9v30M12 24h24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <span className="text-2xl md:text-3xl font-extrabold tracking-wider">Haier</span>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h1 className="text-lg md:text-2xl font-bold flex items-center gap-2"><span>🧩</span>Admin Dashboard</h1>
            <button onClick={handleLogout} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-md">Logout</button>
          </div>
        </div>
      </div>

      {/* 1) Evaluation + Analytics */}
      <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-4">📊 Employee Performance Overview</h2>
        <div className="bg-gray-50 p-4 rounded-lg border mb-4">
          <h3 className="text-lg font-semibold mb-2">Evaluation</h3>
          <div className="text-xs text-gray-500 mb-3">Grades: A (&gt;90), B (85-90), C (80-84), D (70-79), F (&lt;70)</div>

          <div className="max-h-64 overflow-auto mb-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white sticky top-0">
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Rate</th>
                  <th className="p-2 text-left">Grade</th>
                  <th className="p-2 text-left">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {evaluation.length === 0 ? (
                  <tr><td colSpan="4" className="p-2 text-gray-500">No members yet.</td></tr>
                ) : (
                  evaluation.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-white/50">
                      <td className="p-2">{e.name}</td>
                      <td className="p-2">{e.rate}%</td>
                      <td className={`p-2 font-semibold ${e.grade === "A" ? "text-green-600" : e.grade === "B" ? "text-blue-600" : e.grade === "C" ? "text-yellow-600" : e.grade === "D" ? "text-orange-600" : "text-red-600"}`}>{e.grade}</td>
                      <td className="p-2 text-sm text-red-600">{e.remarks}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-gray-500">Note: "need improvment" shown for F grade.</div>
        </div>

        <div className="mt-2">
          <h4 className="text-md font-semibold mb-2">Additional Analytics</h4>
          <div className="p-3 bg-gray-50 rounded-lg">
            <DashboardAnalytics tasks={tasks} />
          </div>
        </div>
      </div>

      {/* 2) All Users */}
      <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">👥 All Users</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowDeleteUsers((s) => !s)} className={`text-sm px-3 py-1 rounded ${showDeleteUsers ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{showDeleteUsers ? "Exit delete" : "Enable delete"}</button>
          </div>
        </div>

        {loading ? <p>Loading...</p> : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2 text-left">Name</th>
                <th className="p-2 text-left">Email</th>
                <th className="p-2 text-left">Role</th>
                {showDeleteUsers && <th className="p-2 text-left">Action</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="p-2">{u.name || "-"}</td>
                  <td className="p-2">{u.email}</td>
                  <td className={`p-2 font-semibold ${u.role === "admin" ? "text-blue-600" : "text-green-600"}`}>{u.role}</td>
                  {showDeleteUsers && (
                    <td className="p-2">
                      <button onClick={() => deleteUser(u.id, u.name || u.email, u.email)} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded">Delete</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 3) All Tasks */}
      <div className="bg-white p-6 rounded-2xl shadow-md mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📋 All Tasks</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowDeleteTasks((s) => !s)} className={`text-sm px-3 py-1 rounded ${showDeleteTasks ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{showDeleteTasks ? "Exit delete" : "Enable delete"}</button>
          </div>
        </div>

        {loading ? <p>Loading...</p> : tasks.length > 0 ? (
          <div className="divide-y">
            {tasks.map((task) => (
              <div key={task.id} className="flex flex-col md:flex-row md:justify-between items-start md:items-center py-4 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800">
                    {task.title}
                    {task.priority && (
                      <span className={`ml-2 text-xs font-semibold inline-block px-2 py-1 rounded ${task.priority === "high" ? "bg-red-100 text-red-700" : task.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                        {task.priority}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Assigned to: {task.assignedName ? `${task.assignedName} (${task.assignedEmail})` : task.assignedEmail || "Unknown"}</p>
                  <p className="text-sm text-gray-500">Duration: {formatDate(task.startDate)} — {formatDate(task.endDate)}</p>
                </div>

                <div className="w-full md:w-1/3 flex flex-col items-center">
                  <div className="text-center mb-2">
                    <div className="text-sm font-semibold">Actual Status</div>
                  </div>
                  <textarea value={actualStatusMap[task.id] ?? ""} onChange={(e) => handleActualChange(task.id, e.target.value)} className="w-full md:w-11/12 border rounded p-2 text-sm min-h-[60px] resize-y" placeholder="Write actual status here..." />
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => saveActualStatus(task.id)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded text-sm">Save</button>
                    {showDeleteTasks && <button onClick={() => deleteTask(task.id, task.title)} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm">Delete</button>}
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <span className={`text-sm font-semibold inline-block px-3 py-1 rounded ${task.status === "completed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>{task.status}</span>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="text-gray-500">No tasks found.</p>}
      </div>

      {/* 4) Add Employee & Add Task */}
      <div className="grid md:grid-cols-2 gap-6 mb-6">
        {/* Add Employee */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">👷 Add Employee</h2>
          <form onSubmit={addEmployee}>
            <input type="text" placeholder="Employee Name" className="border p-2 w-full mb-3 rounded" value={empName} onChange={(e) => setEmpName(e.target.value)} required />
            <input type="email" placeholder="Employee Email" className="border p-2 w-full mb-3 rounded" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} required />
            <button className="bg-green-600 hover:bg-green-700 text-white w-full py-2 rounded">Add Employee</button>
          </form>
          <p className="text-sm text-gray-500 mt-3">Default password for all new employees: <span className="font-semibold">{defaultPassword}</span></p>
        </div>

        {/* Add Task */}
        <div className="bg-white p-6 rounded-2xl shadow-md">
          <h2 className="text-xl font-semibold mb-4">📝 Add Task</h2>
          <form onSubmit={addTask}>
            <input type="text" placeholder="Task Title" className="border p-2 w-full mb-3 rounded" value={title} onChange={(e) => setTitle(e.target.value)} required />

            <label className="text-sm text-gray-600">Assign to (choose member)</label>
            <select value={selectedUserId} onChange={(e) => {
              const id = e.target.value;
              setSelectedUserId(id);
              if (id) {
                const u = users.find((x) => x.id === id);
                setAssignedEmail(u ? u.email : "");
              } else {
                setAssignedEmail("");
              }
            }} className="border p-2 w-full mb-3 rounded appearance-none">
              <option value="">-- Select member --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name ? `${u.name} (${u.email})` : u.email}
                </option>
              ))}
            </select>

            <div className="mb-3">
              <label className="text-sm text-gray-600">Or enter email</label>
              <input
                type="email"
                placeholder="Employee Email (if not in list)"
                className="border p-2 w-full rounded"
                value={assignedEmail}
                onChange={(e) => {
                  setAssignedEmail(e.target.value);
                  // clear dropdown selection when admin edits email manually
                  if (selectedUserId) setSelectedUserId("");
                }}
              />
            </div>

            <label className="text-sm text-gray-600">Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="border p-2 w-full mb-3 rounded">
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>

            <label className="text-sm text-gray-600">Start Date</label>
            <input type="date" className="border p-2 w-full mb-3 rounded" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />

            <label className="text-sm text-gray-600">End Date</label>
            <input type="date" className="border p-2 w-full mb-3 rounded" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />

            <button className="bg-blue-600 hover:bg-blue-700 text-white w-full py-2 rounded">Add Task</button>
          </form>
        </div>
      </div>

      {/* 5) Reminders */}
      <div className="bg-white p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">⏰ Reminders — Tasks due within 3 days</h2>
          <div className="text-sm text-gray-500">Select tasks and send reminders</div>
        </div>

        {remindersList.length === 0 ? <p className="text-gray-500 mb-4">No pending tasks due within 3 days.</p> : (
          <div className="mb-4 max-h-60 overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 text-left">Select</th>
                  <th className="p-2 text-left">Employee</th>
                  <th className="p-2 text-left">Email</th>
                  <th className="p-2 text-left">Task</th>
                  <th className="p-2 text-left">Due</th>
                  <th className="p-2 text-left">Days left</th>
                  <th className="p-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {remindersList.map((r) => (
                  <tr key={r.taskId} className="border-b hover:bg-gray-50">
                    <td className="p-2"><input type="checkbox" checked={selectedReminderIds.has(r.taskId)} onChange={() => toggleSelect(r.taskId)} /></td>
                    <td className="p-2">{r.assignedName}</td>
                    <td className="p-2">{r.assignedEmail || "-"}</td>
                    <td className="p-2">{r.taskTitle}</td>
                    <td className="p-2">{formatDate(r.endDate)}</td>
                    <td className="p-2">{r.daysLeft}</td>
                    <td className="p-2"><span className={`text-sm font-semibold inline-block px-3 py-1 rounded ${r.status === "completed" ? "text-green-700 bg-green-100" : "text-yellow-700 bg-yellow-100"}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={sendPortalReminders} disabled={sending} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-60">Send Portal Reminder</button>
          <button onClick={openEmailCompose} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Open Email Compose</button>
          <button onClick={sendBoth} disabled={sending} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">Send Both</button>
        </div>

        <div className="text-xs text-gray-500 mt-3">Notes: Portal reminders create a notification document in Firestore (collection "notifications") — employees' portal should listen to that collection to show pop-up reminders. Email compose opens Gmail compose in a new tab so admin can send actual emails.</div>
      </div>
    </div>
  );
}
//working code (fine tunned )