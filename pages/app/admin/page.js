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
import Papa from "papaparse";
import * as XLSX from "xlsx";

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

  // controls to show/hide Add panels from sidebar
  const [showAddEmployeePanel, setShowAddEmployeePanel] = useState(false);
  const [showAddTaskPanel, setShowAddTaskPanel] = useState(false);
  // Bulk import panel state
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkAssignedUserId, setBulkAssignedUserId] = useState("");
  const [bulkAssignedEmail, setBulkAssignedEmail] = useState("");
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  // Bulk user import state
  const [showBulkUserPanel, setShowBulkUserPanel] = useState(false);
  const [bulkUserFile, setBulkUserFile] = useState(null);
  const [bulkUserUploading, setBulkUserUploading] = useState(false);
  const [bulkUserResult, setBulkUserResult] = useState(null);
  // Members search
  const [userSearch, setUserSearch] = useState("");
  // preview / confirm states for bulk operations
  const [bulkPreviewRows, setBulkPreviewRows] = useState(null);
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [bulkUserPreviewRows, setBulkUserPreviewRows] = useState(null);
  const [showBulkUserPreview, setShowBulkUserPreview] = useState(false);

  // Task priority state (new)
  const [priority, setPriority] = useState("medium"); // options: low, medium, high

  // delete-mode toggles shown at section headings (right side)
  const [showDeleteUsers, setShowDeleteUsers] = useState(false);
  const [showDeleteTasks, setShowDeleteTasks] = useState(false);

  // UI view state: 'progress' | 'alltasks' | 'members'
  const [activeView, setActiveView] = useState("progress");
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // actual status map (editable boxes per task)
  const [actualStatusMap, setActualStatusMap] = useState({});

  // reminder selection
  const [selectedReminderIds, setSelectedReminderIds] = useState(new Set());
  const [sending, setSending] = useState(false);
  // transient UI states for status updates and reactions
  const [statusChangingIds, setStatusChangingIds] = useState(new Set());
  const [statusReactions, setStatusReactions] = useState({});

  // Welcome popup shown to admins on dashboard load (5s)
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);

  useEffect(() => {
    let hideTimer = null;
    let unmountTimer = null;
    const run = async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc && userDoc.exists() && userDoc.data().role === "admin") {
          setShowWelcome(true);
          // trigger enter animation
          setTimeout(() => setWelcomeVisible(true), 50);
          // hide after 5s
          hideTimer = setTimeout(() => setWelcomeVisible(false), 5000);
          // unmount after animation ends (500ms)
          unmountTimer = setTimeout(() => setShowWelcome(false), 5600);
        }
      } catch (err) {
        // fail silently
        console.error("Welcome popup check failed:", err);
      }
    };
    run();
    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, []);

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

  // normalize status strings and map to canonical set
  const normalize = (s) => (s || "").toString().toLowerCase().trim();
  const canonicalStatus = (s) => {
    const n = normalize(s).replace(/[_\-]/g, " ");
    if (!n) return "in process";
    if (n.includes("complete")) return "completed";
    if (n.includes("cancel")) return "cancelled";
    if (n.includes("delay")) return "delayed";
    // cover variants: in_progress, in process, in-process, pending -> treat as in process
    if (n.includes("in process") || n.includes("in process") || n.includes("in progress") || n.includes("pending")) return "in process";
    // fallback
    return "in process";
  };

  // status -> tailwind classes for colored display
  const statusClass = (s) => {
    const c = canonicalStatus(s);
    if (c === "completed") return "bg-green-600 text-white";
    if (c === "delayed" || c === "cancelled") return "bg-red-600 text-white";
    if (c === "in process") return "bg-yellow-400 text-black";
    return "bg-gray-100 text-black";
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
      // call server API that deletes auth user (if present), user doc and related tasks atomically
      // provide either uid or email
      let userEmail = userEmailParam;
      if (!userEmail) {
        try {
          const userRef = doc(db, "users", userId);
          const userSnap = await getDoc(userRef);
          if (userSnap && userSnap.exists()) userEmail = userSnap.data().email;
        } catch (e) {
          // ignore
        }
      }

      const resp = await fetch('/api/admin/deleteUser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: userId, email: userEmail }) });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Delete failed');
      alert('User removed. Server deletion complete.');
      // onSnapshot listeners will update UI automatically
    } catch (err) {
      console.error(err);
      alert('Delete failed: ' + (err.message || err));
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

  // update task status (admin action)
  const updateTaskStatus = async (taskId, newStatus) => {
    // optimistic update: update local state immediately so Evaluation updates
    const prev = tasks;
    // mark as changing for animation
    setStatusChangingIds((s) => new Set([...s, taskId]));
    try {
      setTasks((tlist) => tlist.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      await updateDoc(doc(db, "tasks", taskId), { status: newStatus });
      // set a reaction based on the new status
      const n = (newStatus || "").toString().toLowerCase();
      let reaction = null;
      if (n.includes("complete")) reaction = "completed";
      else if (n.includes("cancel")) reaction = "cancelled";
      else if (n.includes("delay")) reaction = "delayed";
      else reaction = "in process";
      if (reaction) {
        setStatusReactions((prevMap) => ({ ...prevMap, [taskId]: reaction }));
        // clear after 2.5s
        setTimeout(() => setStatusReactions((m) => { const copy = { ...m }; delete copy[taskId]; return copy; }), 2500);
      }
    } catch (err) {
      // revert local change on failure
      setTasks(prev);
      alert("Failed to update status: " + err.message);
    } finally {
      // remove the animation marker shortly after
      setTimeout(() => setStatusChangingIds((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      }), 800);
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
      // Build evaluation considering rules:
      // - 'cancelled' tasks do not affect evaluation (skip)
      // - 'in process' tasks that are not overdue count as full marks (treated as completed)
      // - 'in process' tasks that are overdue are treated as 'delayed' and deduct marks
      // - 'delayed' tasks deduct marks
      const now = new Date();

      const relevant = tasks
        .filter((t) => {
          const belongs = (t.assignedTo && t.assignedTo === u.uid) || (t.assignedEmail && t.assignedEmail === u.email);
          return belongs;
        })
        .map((t) => {
          const st = canonicalStatus(t.status);
          // skip cancelled tasks from evaluation
          if (st === "cancelled") return null;

          const end = toDateObj(t.endDate);
          // if in process and not overdue -> treat as completed for evaluation
          if (st === "in process") {
            if (!end) {
              // no end date -> assume not overdue => full marks
              return { ...t, evalStatus: "completed" };
            }
            if (end >= now) {
              return { ...t, evalStatus: "completed" };
            }
            // end < now => overdue -> treat as delayed
            return { ...t, evalStatus: "delayed", autoConverted: true };
          }

          // for completed or delayed, use their status (delayed deducts marks)
          if (st === "completed") return { ...t, evalStatus: "completed" };
          if (st === "delayed") return { ...t, evalStatus: "delayed" };

          // fallback: treat other statuses (e.g., pending) as in process semantics
          const endFallback = toDateObj(t.endDate);
          if (!endFallback || endFallback >= now) return { ...t, evalStatus: "completed" };
          return { ...t, evalStatus: "delayed" };
        })
        .filter(Boolean);

      const total = relevant.length;
      const completed = relevant.filter((t) => (t.evalStatus || canonicalStatus(t.status)) === "completed").length;
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

  // Graph filters for DashboardAnalytics in progress view
  const [graphUserFilter, setGraphUserFilter] = useState(""); // '' => all
  const [graphStartDate, setGraphStartDate] = useState("");
  const [graphEndDate, setGraphEndDate] = useState("");

  const filteredTasksForGraph = useMemo(() => {
    let list = tasks;
    if (graphUserFilter) {
      list = list.filter((t) => (t.assignedTo === graphUserFilter) || (t.assignedEmail && users.find((u)=> (u.uid||u.id)===graphUserFilter && u.email===t.assignedEmail)));
    }
    if (graphStartDate) {
      const s = new Date(graphStartDate);
      list = list.filter((t) => {
        const sd = toDateObj(t.startDate);
        return sd && sd >= s;
      });
    }
    if (graphEndDate) {
      const e = new Date(graphEndDate);
      list = list.filter((t) => {
        const ed = toDateObj(t.endDate);
        return ed && ed <= e;
      });
    }
    return list;
  }, [tasks, graphUserFilter, graphStartDate, graphEndDate, users]);

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
      const eCopy = new Date(end.getTime());
      eCopy.setHours(0, 0, 0, 0);
      const tCopy = new Date(today.getTime());
      tCopy.setHours(0, 0, 0, 0);
      const diffMs = eCopy - tCopy;
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

  // Reminder view filter: 'due' (default), 'delayed', 'overdue', 'all'
  const [reminderView, setReminderView] = useState("due");
  const [delayedSinceMonths, setDelayedSinceMonths] = useState(0);
  const [filterRemindersText, setFilterRemindersText] = useState("");

  // Helper to build an active reminder list based on current filter
  const getActiveReminders = () => {
    const now = new Date();
    const list = [];
    tasks.forEach((t) => {
      // find user info
      const user = users.find((u) => (t.assignedTo && u.uid === t.assignedTo) || (u.email === t.assignedEmail));
      const end = toDateObj(t.endDate);
      const daysLeft = end ? Math.ceil((new Date(end.getTime()).setHours(0,0,0,0) - new Date(now.getTime()).setHours(0,0,0,0)) / (1000*60*60*24)) : null;

      list.push({
        taskId: t.id,
        taskTitle: t.title,
        assignedName: t.assignedName || (user ? user.name : t.assignedEmail || "Unknown"),
        assignedEmail: t.assignedEmail || (user ? user.email : ""),
        assignedUid: t.assignedTo || (user ? user.uid : null),
        status: t.status,
        endDate: end,
        daysLeft,
      });
    });

    if (reminderView === "due") {
      return list.filter((r) => r.endDate && r.daysLeft !== null && r.daysLeft <= 3 && r.daysLeft >= 0).sort((a,b)=>a.daysLeft-b.daysLeft);
    }

    if (reminderView === "delayed") {
      // delayed tasks by status OR overdue + not completed
      const months = Number(delayedSinceMonths) || 0;
      return list.filter((r) => {
        const st = canonicalStatus(r.status);
        if (st === "delayed") {
          if (months <= 0) return true;
          if (!r.endDate) return false;
          const cutoff = new Date();
          cutoff.setMonth(cutoff.getMonth() - months);
          return r.endDate <= cutoff;
        }
        return false;
      }).sort((a,b)=> (a.endDate && b.endDate) ? b.endDate - a.endDate : 0);
    }

    if (reminderView === "overdue") {
      return list.filter((r) => r.endDate && r.endDate < now && canonicalStatus(r.status) !== 'completed').sort((a,b)=> b.endDate - a.endDate);
    }

    // all
    return list.sort((a,b)=> (a.endDate && b.endDate) ? b.endDate - a.endDate : 0);
  };

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
    const active = getActiveReminders();
    if (selectedReminderIds.size === 0) {
      alert("Select at least one task to send portal reminders.");
      return;
    }
    setSending(true);
    try {
      const promises = [];
      active.forEach((r) => {
        if (!selectedReminderIds.has(r.taskId)) return;
        const daysText = typeof r.daysLeft === "number" ? `${r.daysLeft} day(s)` : "N/A";
        const message = `Reminder: Task "${r.taskTitle}" is due in ${daysText}. Please complete it.`;
        const payload = {
          taskId: r.taskId,
          recipientUid: r.assignedUid || null,
          recipientEmail: r.assignedEmail || null,
          title: `Task reminder: ${r.taskTitle}`,
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

  // open Outlook web compose for selected recipients (grouped)
  const openEmailCompose = () => {
    const active = getActiveReminders();
    if (selectedReminderIds.size === 0) {
      alert("Select at least one task to email.");
      return;
    }
    const emails = new Set();
    const subjects = [];
    const bodies = [];

    active.forEach((r) => {
      if (!selectedReminderIds.has(r.taskId)) return;
      if (r.assignedEmail) emails.add(r.assignedEmail);
      const daysText = typeof r.daysLeft === "number" ? `${r.daysLeft} day(s)` : "N/A";
      subjects.push(`${r.taskTitle} due in ${daysText}`);
      bodies.push(`${r.assignedName || r.assignedEmail} — Task: ${r.taskTitle}\nDue: ${formatDate(r.endDate)} (${daysText})\nStatus: ${r.status}\n\n`);
    });

    const to = Array.from(emails).join(";");
    const subject = `Task Reminder: ${subjects.slice(0,3).join("; ")}`;
    const body = `Dear team,\n\nYou have tasks to review:\n\n${bodies.join("")}\nPlease address them as appropriate.\n\nRegards,\nAdmin`;
    // Outlook deeplink compose (web): open compose with prefilled fields
    const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(outlookUrl, "_blank");
  };

  // convenience: send both portal notification and open email compose
  const sendBoth = async () => {
    await sendPortalReminders();
    openEmailCompose();
  };

  // Automatically convert overdue 'in process' tasks to 'delayed'
  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    const now = new Date();
    tasks.forEach((t) => {
      const st = canonicalStatus(t.status);
      if (st === "in process") {
        const end = toDateObj(t.endDate);
        if (end && end < now) {
          // change to delayed
          updateTaskStatus(t.id, "delayed");
        }
      }
    });
  }, [tasks]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 min-h-screen px-5 py-6 bg-gradient-to-b from-blue-700 to-indigo-800 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-6 animate-slide-left">
              <div className="bg-white/10 p-2 rounded-md">
                <svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <rect width="48" height="48" rx="8" fill="white" fillOpacity="0.06" />
                  <path d="M12 9v30M36 9v30M12 24h24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="text-xl font-extrabold">Haier</div>
                <div className="text-xs text-white/80">Admin Panel</div>
              </div>
            </div>

            <nav className="mt-4 space-y-2">
              <button onClick={() => setActiveView("progress")} className={`w-full text-left px-4 py-3 rounded-md nav-item ${activeView === "progress" ? "bg-white/10" : "hover:bg-white/6"}`}>
                <span className="font-medium">Employee Progress</span>
              </button>
              <button onClick={() => setActiveView("alltasks")} className={`w-full text-left px-4 py-3 rounded-md nav-item ${activeView === "alltasks" ? "bg-white/10" : "hover:bg-white/6"}`}>
                <span className="font-medium">All Tasks</span>
              </button>
              <button onClick={() => setActiveView("members")} className={`w-full text-left px-4 py-3 rounded-md nav-item ${activeView === "members" ? "bg-white/10" : "hover:bg-white/6"}`}>
                <span className="font-medium">Members</span>
              </button>
            </nav>

            <div className="sidebar-divider" />

            <div className="mt-4 text-sm text-white/80 px-2">
              <p className="mb-1">Quick Actions</p>
                <div className="flex flex-col gap-2">
                <button onClick={() => { setShowDeleteUsers((s) => !s); }} className="text-sm px-3 py-2 rounded bg-white/6">Toggle Delete Users</button>
                <button onClick={() => { setShowDeleteTasks((s) => !s); }} className="text-sm px-3 py-2 rounded bg-white/6">Toggle Delete Tasks</button>
                <button onClick={() => { setShowAddEmployeePanel((s) => !s); setShowAddTaskPanel(false); setShowBulkPanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Add Employee</button>
                <button onClick={() => { setShowAddTaskPanel((s) => !s); setShowAddEmployeePanel(false); setShowBulkPanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Add Task</button>
                <button onClick={() => { setShowBulkPanel((s) => !s); setShowAddTaskPanel(false); setShowAddEmployeePanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Bulk Add Tasks</button>
                <button onClick={() => { setShowBulkUserPanel((s) => !s); setShowBulkPanel(false); setShowAddTaskPanel(false); setShowAddEmployeePanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Bulk Add Users</button>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <div className="sidebar-divider" />
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-white/90">{auth.currentUser ? auth.currentUser.email : "Admin"}</div>
              <button onClick={handleLogout} className="bg-white text-indigo-700 px-3 py-2 rounded-md">Logout</button>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 p-6">
          {/* Welcome overlay shown on admin login */}
          {showWelcome && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className={`bg-white rounded-2xl p-8 max-w-xl mx-4 text-center transform transition-all duration-500 ${welcomeVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95"}`}>
                <h2 className="text-2xl md:text-3xl font-bold mb-2">Good Afternoon Mr.Ammar</h2>
                <p className="text-gray-600">Your efforts is the backbone of the workplace</p>
              </div>
            </div>
          )}

          {/* Bulk Tasks Preview / Confirm */}
          {showBulkPreview && bulkPreviewRows && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
              <div className="bg-white p-6 rounded-2xl shadow-lg w-[90%] max-w-4xl">
                <h3 className="text-lg font-semibold mb-3">Preview Tasks ({bulkPreviewRows.length})</h3>
                <div className="max-h-80 overflow-auto mb-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left">Title</th>
                        <th className="p-2 text-left">Start</th>
                        <th className="p-2 text-left">End</th>
                        <th className="p-2 text-left">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreviewRows.map((r, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{r.title}</td>
                          <td className="p-2">{r.startDate || '-'}</td>
                          <td className="p-2">{r.endDate || '-'}</td>
                          <td className="p-2">{r.priority}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowBulkPreview(false); }} className="bg-gray-100 px-4 py-2 rounded">Back</button>
                  <button onClick={async () => {
                    // confirm -> send to server API
                    setBulkUploading(true);
                    try {
                      const tasksToSend = bulkPreviewRows.map((r) => ({
                        title: r.title,
                        startDate: r.startDate || null,
                        endDate: r.endDate || null,
                        priority: r.priority || 'medium',
                        assignedTo: bulkAssignedUserId || '',
                        assignedEmail: bulkAssignedEmail || '',
                        assignedName: (() => {
                          const a = users.find(u=> (u.id===bulkAssignedUserId || u.uid===bulkAssignedUserId) || (u.email===bulkAssignedEmail));
                          return a ? (a.name||'') : '';
                        })(),
                      }));

                      const res = await fetch('/api/admin/bulkTasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasks: tasksToSend }) });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Upload failed');
                      alert(`Created ${data.count || 0} tasks.`);
                      setShowBulkPreview(false);
                      setShowBulkPanel(false);
                      setBulkFile(null);
                      setBulkAssignedUserId('');
                      setBulkAssignedEmail('');
                    } catch (err) {
                      console.error(err);
                      alert('Bulk create failed: ' + (err.message || err));
                    } finally {
                      setBulkUploading(false);
                    }
                  }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Confirm Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Users Preview / Confirm */}
          {showBulkUserPreview && bulkUserPreviewRows && (
            <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
              <div className="bg-white p-6 rounded-2xl shadow-lg w-[90%] max-w-3xl">
                <h3 className="text-lg font-semibold mb-3">Preview Users ({bulkUserPreviewRows.length})</h3>
                <div className="max-h-80 overflow-auto mb-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left">Name</th>
                        <th className="p-2 text-left">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkUserPreviewRows.map((u, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{u.name}</td>
                          <td className="p-2">{u.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => { setShowBulkUserPreview(false); }} className="bg-gray-100 px-4 py-2 rounded">Back</button>
                  <button onClick={async () => {
                    setBulkUserUploading(true);
                    try {
                      const res = await fetch('/api/admin/bulkUsers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users: bulkUserPreviewRows }) });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Import failed');
                      alert(`Created ${data.count || 0} users.`);
                      setShowBulkUserPreview(false);
                      setShowBulkUserPanel(false);
                      setBulkUserFile(null);
                    } catch (err) {
                      console.error(err);
                      alert('Bulk user import failed: ' + (err.message || err));
                    } finally {
                      setBulkUserUploading(false);
                    }
                  }} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Confirm Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Bulk Add Users overlay */}
          {showBulkUserPanel && (
            <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
              <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                <div className="absolute right-3 top-3">
                  <button onClick={() => setShowBulkUserPanel(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                </div>
                <h2 className="text-xl font-semibold mb-4">👥 Bulk Add Users (CSV / XLSX)</h2>

                <div className="mb-3">
                  <label className="text-sm text-gray-600">Upload file with user list</label>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setBulkUserFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="mt-2" />
                  <div className="text-xs text-gray-500 mt-2">File should have headers: <code>Name</code> and <code>mail id</code> (case-insensitive). Example: <code>Name,mail id</code></div>
                </div>

                <div className="flex gap-3">
                  <button onClick={async () => {
                    // parse and show preview for users
                    if (!bulkUserFile) { alert('Please choose a file to upload.'); return; }
                    setBulkUserUploading(true);
                    try {
                      const rows = [];
                      const name = (bulkUserFile.name || '').toLowerCase();
                      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                        const data = await bulkUserFile.arrayBuffer();
                        const workbook = XLSX.read(data, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                        json.forEach((r) => rows.push(r));
                      } else {
                        const result = await new Promise((resolve, reject) => {
                          Papa.parse(bulkUserFile, {
                            header: true,
                            skipEmptyLines: true,
                            complete: (res) => resolve(res),
                            error: (err) => reject(err),
                          });
                        });
                        (result.data || []).forEach((r) => rows.push(r));
                      }

                      if (!rows || rows.length === 0) {
                        alert('No rows found in file.');
                        setBulkUserUploading(false);
                        return;
                      }

                      const normalized = rows.map((r) => {
                        const keys = Object.keys(r || {});
                        const norm = {};
                        keys.forEach((k) => { norm[k.toString().toLowerCase().replace(/\s|_/g,'')] = r[k]; });
                        const nameVal = norm['name'] || '';
                        const emailVal = (norm['mailid'] || norm['mail'] || norm['email'] || '').toString().trim();
                        return { name: nameVal, email: emailVal };
                      }).filter(u => u.email);

                      if (!normalized || normalized.length === 0) {
                        alert('No valid user rows found in file. Ensure there is a Name and mail id column.');
                        setBulkUserUploading(false);
                        return;
                      }

                      setBulkUserPreviewRows(normalized);
                      setShowBulkUserPreview(true);
                    } catch (err) {
                      console.error(err);
                      alert('Bulk user parse failed: ' + (err.message || err));
                    } finally {
                      setBulkUserUploading(false);
                    }
                  }} disabled={bulkUserUploading} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">Preview</button>

                  <button type="button" onClick={() => { setShowBulkUserPanel(false); setBulkUserFile(null); }} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <div className="flex items-center gap-3">
              <div className="hidden md:block text-sm text-gray-500">Manage tasks, members and reminders</div>
            </div>
          </div>

          {/* Top overlay panels for Add Employee / Add Task */}
          {showAddEmployeePanel && (
            <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
              <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                <div className="absolute right-3 top-3">
                  <button onClick={() => setShowAddEmployeePanel(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                </div>
                <h2 className="text-xl font-semibold mb-4">👷 Add Employee</h2>
                <form onSubmit={addEmployee}>
                  <input type="text" placeholder="Employee Name" className="border p-2 w-full mb-3 rounded" value={empName} onChange={(e) => setEmpName(e.target.value)} required />
                  <input type="email" placeholder="Employee Email" className="border p-2 w-full mb-3 rounded" value={empEmail} onChange={(e) => setEmpEmail(e.target.value)} required />
                  <div className="flex gap-3">
                    <button className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded">Add Employee</button>
                    <button type="button" onClick={() => setShowAddEmployeePanel(false)} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                  </div>
                </form>
                <p className="text-sm text-gray-500 mt-3">Default password for all new employees: <span className="font-semibold">{defaultPassword}</span></p>
              </div>
            </div>
          )}

          {showAddTaskPanel && (
            <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
              <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                <div className="absolute right-3 top-3">
                  <button onClick={() => setShowAddTaskPanel(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                </div>
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="text-sm text-gray-600">Start Date</label>
                      <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border p-2 w-full rounded" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600">End Date</label>
                      <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border p-2 w-full rounded" />
                    </div>
                  </div>

                  <label className="text-sm text-gray-600">Priority</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="border p-2 w-full mb-3 rounded">
                    <option value="high">High Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="low">Low Priority</option>
                  </select>

                  <div className="flex gap-3">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">Add Task</button>
                    <button type="button" onClick={() => setShowAddTaskPanel(false)} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Bulk Add Tasks overlay */}
          {showBulkPanel && (
            <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
              <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                <div className="absolute right-3 top-3">
                  <button onClick={() => setShowBulkPanel(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                </div>
                <h2 className="text-xl font-semibold mb-4">📥 Bulk Add Tasks (CSV / XLSX)</h2>

                <div className="mb-3">
                  <label className="text-sm text-gray-600">Assign all tasks to (choose member)</label>
                  <select value={bulkAssignedUserId} onChange={(e) => {
                    const id = e.target.value;
                    setBulkAssignedUserId(id);
                    if (id) {
                      const u = users.find((x) => x.id === id || x.uid === id);
                      setBulkAssignedEmail(u ? u.email : "");
                    } else {
                      setBulkAssignedEmail("");
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
                      value={bulkAssignedEmail}
                      onChange={(e) => {
                        setBulkAssignedEmail(e.target.value);
                        if (bulkAssignedUserId) setBulkAssignedUserId("");
                      }}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="text-sm text-gray-600">Upload file (.csv or .xlsx)</label>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setBulkFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="mt-2" />
                  <div className="text-xs text-gray-500 mt-2">File must have headers: <code>title</code>, <code>startDate</code>, <code>endDate</code>. <code>priority</code> optional.</div>
                </div>

                <div className="flex gap-3">
                  <button onClick={async () => {
                    // parse and show preview for confirmation
                    if (!bulkFile) { alert('Please choose a file to upload.'); return; }
                    if (!bulkAssignedUserId && !bulkAssignedEmail) { alert('Please choose or enter an assignee.'); return; }

                    setBulkUploading(true);
                    try {
                      const rows = [];
                      const name = (bulkFile.name || '').toLowerCase();
                      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                        const data = await bulkFile.arrayBuffer();
                        const workbook = XLSX.read(data, { type: 'array' });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                        json.forEach((r) => rows.push(r));
                      } else {
                        const result = await new Promise((resolve, reject) => {
                          Papa.parse(bulkFile, {
                            header: true,
                            skipEmptyLines: true,
                            complete: (res) => resolve(res),
                            error: (err) => reject(err),
                          });
                        });
                        (result.data || []).forEach((r) => rows.push(r));
                      }

                      if (!rows || rows.length === 0) {
                        alert('No rows found in file.');
                        setBulkUploading(false);
                        return;
                      }

                      // normalize rows for preview
                      const normalized = rows.map((r) => {
                        const keys = Object.keys(r || {});
                        const norm = {};
                        keys.forEach((k) => { norm[k.toString().toLowerCase().replace(/\s|_/g,'')] = r[k]; });
                        const titleVal = norm['title'] || norm['task'] || '';
                        const sdRaw = norm['startdate'] || norm['start_date'] || '';
                        const edRaw = norm['enddate'] || norm['end_date'] || '';
                        const rawPr = (norm['priority'] || '').toString().toLowerCase().trim();
                        const allowed = ['high', 'medium', 'low'];
                        const pr = allowed.includes(rawPr) ? rawPr : 'medium';
                        return {
                          title: titleVal,
                          startDate: sdRaw || null,
                          endDate: edRaw || null,
                          priority: pr,
                        };
                      }).filter(r=>r.title);

                      if (!normalized || normalized.length === 0) {
                        alert('No valid task rows found in file. Ensure there is a title column.');
                        setBulkUploading(false);
                        return;
                      }

                      setBulkPreviewRows(normalized);
                      setShowBulkPreview(true);
                    } catch (err) {
                      console.error(err);
                      alert('Bulk upload parse failed: ' + (err.message || err));
                    } finally {
                      setBulkUploading(false);
                    }
                  }} disabled={bulkUploading} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">Preview</button>

                  <button type="button" onClick={() => { setShowBulkPanel(false); setBulkFile(null); setBulkAssignedEmail(''); setBulkAssignedUserId(''); }} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                </div>
              </div>
            </div>
          )}

      {/* 1) Evaluation + Analytics */}
      {activeView === "progress" && (
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6 transition-all duration-300 ease-in-out transform">
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
          <div className="p-3 bg-gray-50 rounded-lg mb-4">
            <div className="flex flex-col md:flex-row md:items-end md:gap-4 gap-2">
              <div className="flex items-center gap-2">
                <label className="text-sm">User:</label>
                <select value={graphUserFilter} onChange={(e) => setGraphUserFilter(e.target.value)} className="border p-2 rounded text-sm">
                  <option value="">All users</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.uid || u.id}>{u.name ? `${u.name} (${u.email})` : u.email}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm">Start</label>
                <input type="date" value={graphStartDate} onChange={(e) => setGraphStartDate(e.target.value)} className="border p-2 rounded text-sm" />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm">End</label>
                <input type="date" value={graphEndDate} onChange={(e) => setGraphEndDate(e.target.value)} className="border p-2 rounded text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setGraphUserFilter(""); setGraphStartDate(""); setGraphEndDate(""); }} className="text-sm px-3 py-1 rounded bg-gray-100">Clear</button>
              </div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-lg">
            <DashboardAnalytics tasks={filteredTasksForGraph} />
          </div>
        </div>
      </div>
        )}

        {/* 2) All Users */}
      {activeView === "members" && (
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6 transition-all duration-300 ease-in-out transform">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">👥 All Users</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowDeleteUsers((s) => !s)} className={`text-sm px-3 py-1 rounded ${showDeleteUsers ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{showDeleteUsers ? "Exit delete" : "Enable delete"}</button>
          </div>
        </div>
        <div className="mb-4">
          <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search name or email" className="px-3 py-2 rounded border w-full md:w-72 text-sm" />
        </div>

        {loading ? <p>Loading...</p> : (() => {
          const q = (userSearch || '').trim().toLowerCase();
          const visibleUsers = q === '' ? users : users.filter((u) => {
            return (u.name && u.name.toLowerCase().includes(q)) || (u.email && u.email.toLowerCase().includes(q));
          });

          if (visibleUsers.length === 0) return <p className="text-gray-500">No members match your search.</p>;

          return (
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
                {visibleUsers.map((u) => (
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
          );
        })()}
      </div>
      )}

      {/* 3) All Tasks */}
      {activeView === "alltasks" && (
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6 transition-all duration-300 ease-in-out transform">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">📋 All Tasks</h2>
            <div className="flex items-center gap-3">
              <input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Filter by name/email" className="px-3 py-1 rounded border text-sm" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-1 rounded border text-sm">
                <option value="all">All status</option>
                <option value="completed">completed</option>
                <option value="in process">in process</option>
                <option value="delayed">delayed</option>
                <option value="cancelled">cancelled</option>
              </select>
              <button onClick={() => setShowDeleteTasks((s) => !s)} className={`text-sm px-3 py-1 rounded ${showDeleteTasks ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>{showDeleteTasks ? "Exit delete" : "Enable delete"}</button>
            </div>
          </div>
        

        {loading ? (
          <p>Loading...</p>
        ) : (
          (() => {
            const filtered = tasks.filter((task) => {
              const nameMatch =
                filterName.trim() === "" ||
                (task.assignedName && task.assignedName.toLowerCase().includes(filterName.toLowerCase())) ||
                (task.assignedEmail && task.assignedEmail.toLowerCase().includes(filterName.toLowerCase()));
              const statusMatch = filterStatus === "all" || canonicalStatus(task.status) === filterStatus;
              return nameMatch && statusMatch;
            });

            if (filtered.length === 0) return <p className="text-gray-500">No tasks found.</p>;

            return (
              <div className="divide-y">
                {filtered.map((task) => (
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

                    <div className="flex-shrink-0 flex items-center gap-2">
                      <div className="relative flex items-center">
                        <select value={canonicalStatus(task.status)} onChange={(e) => updateTaskStatus(task.id, e.target.value)} className={`border p-2 rounded text-sm ${statusClass(task.status)}`}>
                          <option value="completed">completed</option>
                          <option value="in process">in process</option>
                          <option value="delayed">delayed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                        {statusReactions[task.id] && (
                          <span aria-hidden className="ml-3 -mr-2">
                            {statusReactions[task.id] === 'completed' && <span className="text-2xl animate-bounce">👏</span>}
                            {statusReactions[task.id] === 'cancelled' && <span className="text-2xl animate-pulse">😢</span>}
                            {statusReactions[task.id] === 'delayed' && <span className="text-2xl animate-pulse text-red-600">😭</span>}
                            {statusReactions[task.id] === 'in process' && <span className="text-2xl animate-bounce text-yellow-500">🚀</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>
      )}

      {/* Add panels are shown as top overlays when toggled (see below) */}

      {/* 5) Reminders */}
      <div className="bg-white p-6 rounded-2xl shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">⏰ Reminders</h2>
          <div className="text-sm text-gray-500">Select tasks and send reminders</div>
        </div>

        <div className="mb-4 flex flex-col md:flex-row md:items-center md:gap-4 gap-2">
          <div className="flex items-center gap-2">
            <label className="text-sm">View:</label>
            <select value={reminderView} onChange={(e) => setReminderView(e.target.value)} className="border p-2 rounded text-sm">
              <option value="due">Due in 3 days</option>
              <option value="delayed">All delayed</option>
              <option value="overdue">All overdue</option>
              <option value="all">All tasks</option>
            </select>
          </div>

          <div className="flex-1 md:flex md:justify-end md:items-center">
            <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto">
              <input value={filterRemindersText} onChange={(e) => setFilterRemindersText(e.target.value)} placeholder="Search name, email or task" className="border p-2 rounded text-sm w-full md:w-64" />
            </div>
          </div>

          {reminderView === "delayed" && (
            <div className="flex items-center gap-2">
              <label className="text-sm">Delayed since (months):</label>
              <input type="number" min="0" value={delayedSinceMonths} onChange={(e) => setDelayedSinceMonths(e.target.value)} className="border p-2 rounded text-sm w-24" />
              <div className="text-xs text-gray-500">Set 0 to show all delayed tasks regardless of age.</div>
            </div>
          )}
        </div>

        {(() => {
          const activeReminders = getActiveReminders();
          if (!activeReminders || activeReminders.length === 0) return <p className="text-gray-500 mb-4">No reminders for the selected view.</p>;

          const q = (filterRemindersText || "").trim().toLowerCase();
          const visibleReminders = q === "" ? activeReminders : activeReminders.filter((r) => {
            return (
              (r.assignedName && r.assignedName.toLowerCase().includes(q)) ||
              (r.assignedEmail && r.assignedEmail.toLowerCase().includes(q)) ||
              (r.taskTitle && r.taskTitle.toLowerCase().includes(q))
            );
          });

          if (!visibleReminders || visibleReminders.length === 0) return <p className="text-gray-500 mb-4">No reminders match the search for the selected view.</p>;

          return (
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
                  {visibleReminders.map((r) => (
                    <tr key={r.taskId} className="border-b hover:bg-gray-50">
                      <td className="p-2"><input type="checkbox" checked={selectedReminderIds.has(r.taskId)} onChange={() => toggleSelect(r.taskId)} /></td>
                      <td className="p-2">{r.assignedName}</td>
                      <td className="p-2">{r.assignedEmail || "-"}</td>
                      <td className="p-2">{r.taskTitle}</td>
                      <td className="p-2">{formatDate(r.endDate)}</td>
                      <td className="p-2">{typeof r.daysLeft === 'number' ? r.daysLeft : (r.endDate ? Math.ceil((new Date() - new Date(r.endDate.getTime()))/(1000*60*60*24)) : 'N/A')}</td>
                      <td className="p-2"><span className={`text-sm font-semibold inline-block px-3 py-1 rounded ${canonicalStatus(r.status) === "completed" ? "text-green-700 bg-green-100" : canonicalStatus(r.status) === "delayed" ? "text-red-700 bg-red-100" : "text-yellow-700 bg-yellow-100"}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}

        <div className="flex gap-3">
          <button onClick={sendPortalReminders} disabled={sending} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded disabled:opacity-60">Send Portal Reminder</button>
          <button onClick={openEmailCompose} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Open Email Compose</button>
          <button onClick={sendBoth} disabled={sending} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-60">Send Both</button>
        </div>

        <div className="text-xs text-gray-500 mt-3">Notes: Portal reminders create a notification document in Firestore (collection "notifications") — employees' portal should listen to that collection to show pop-up reminders. Reminder compose opens Outlook web compose in a new tab with a prefilled message.</div>
      </div>
      </main>
    </div>
  </div>
  );
}
//working code (fine tunned )