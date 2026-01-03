"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
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
import { createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import DashboardAnalytics from "../admin/component/DashboardAnalytics";

const canonicalStatus = (status = "") => {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized.includes("complete")) return "completed";
  if (normalized.includes("delay")) return "delayed";
  return normalized;
};

const MONTH_NAME_TO_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const gradeFromScore = (score = 0) => {
  if (score > 90) return "A";
  if (score >= 85 && score <= 90) return "B";
  if (score >= 80 && score <= 84) return "C";
  if (score >= 70 && score <= 79) return "D";
  return "F";
};

const formatOneDecimal = (value) => {
  if (!Number.isFinite(value)) return "0.0";
  return (Math.round(value * 10) / 10).toFixed(1);
};

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

  // UI view state: 'progress' | 'alltasks' | 'members'
  const [activeView, setActiveView] = useState("progress");
  const [filterName, setFilterName] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // actual status map (editable boxes per task)
  const [actualStatusMap, setActualStatusMap] = useState({});

  // reminder selection
  const [selectedReminderIds, setSelectedReminderIds] = useState(new Set());
  const [sending, setSending] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState(null);
  // employee welcome popup
  const [showWelcomeEmployee, setShowWelcomeEmployee] = useState(false);
  const [welcomeVisibleEmployee, setWelcomeVisibleEmployee] = useState(false);
  // animate status changes
  const [statusChangingIds, setStatusChangingIds] = useState(new Set());
  // store transient reaction per task id (e.g., 'completed'|'delayed'|'cancelled'|'in process')
  const [statusReactions, setStatusReactions] = useState({});
  const [pendingRequests, setPendingRequests] = useState(new Set());
  const [taskFilterStart, setTaskFilterStart] = useState("");
  const [taskFilterEnd, setTaskFilterEnd] = useState("");
  const [evaluationStartDate, setEvaluationStartDate] = useState("");
  const [evaluationEndDate, setEvaluationEndDate] = useState("");
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [kpiRecords, setKpiRecords] = useState([]);
  const [kpiLoading, setKpiLoading] = useState(false);
  const [kpiError, setKpiError] = useState("");

  // Load KPI data directly from Firestore, falling back to the API route only if needed
  const fetchKpisViaApi = useCallback(async () => {
    if (!currentUser) {
      setKpiRecords([]);
      setKpiError("");
      return;
    }

    const serializeSnapshot = (docSnap) => {
      const data = docSnap.data() || {};
      let addedAt = data.addedAt || null;
      if (addedAt && typeof addedAt.toDate === "function") {
        try {
          addedAt = addedAt.toDate().toISOString();
        } catch (err) {
          console.warn("Failed to convert KPI timestamp", err);
          addedAt = null;
        }
      } else if (addedAt instanceof Date) {
        addedAt = addedAt.toISOString();
      } else if (typeof addedAt !== "string") {
        addedAt = null;
      }

      return {
        id: docSnap.id,
        userId: data.userId || null,
        userEmail: data.userEmail || null,
        userName: data.userName || null,
        month: data.month || null,
        year: data.year || null,
        score: typeof data.score === "number" ? data.score : Number(data.score) || 0,
        addedAt,
        addedBy: data.addedBy || null,
      };
    };

    const gatherFromFirestore = async () => {
      const queryFactories = [];
      if (currentUser.uid) {
        queryFactories.push({
          label: "userId",
          run: () => getDocs(query(collection(db, "kpi"), where("userId", "==", currentUser.uid))),
        });
      }
      if (currentUser.email) {
        queryFactories.push({
          label: "userEmail",
          run: () => getDocs(query(collection(db, "kpi"), where("userEmail", "==", currentUser.email))),
        });
      }
      if (!queryFactories.length) {
        throw new Error("Missing employee identifiers");
      }

      const seen = new Map();
      for (const { label, run } of queryFactories) {
        try {
          const snap = await run();
          snap.forEach((docSnap) => {
            const entry = serializeSnapshot(docSnap);
            seen.set(entry.id, entry);
          });
        } catch (error) {
          console.warn(`KPI query failed for ${label}`, error);
        }
      }

      return Array.from(seen.values());
    };

    const gatherViaApi = async () => {
      const tokenProvider = currentUser || auth.currentUser;
      const idToken = await tokenProvider?.getIdToken?.();
      if (!idToken) {
        throw new Error("Unable to verify your session");
      }

      const response = await fetch("/api/employee/kpi", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load KPI records");
      }
      return Array.isArray(payload?.entries) ? payload.entries : [];
    };

    try {
      setKpiLoading(true);
      setKpiError("");
      const directEntries = await gatherFromFirestore();
      const orderedDirect = directEntries
        .sort((a, b) => {
          const aTime = a.addedAt ? Date.parse(a.addedAt) : 0;
          const bTime = b.addedAt ? Date.parse(b.addedAt) : 0;
          return bTime - aTime;
        })
        .slice(0, 50);

      setKpiRecords(orderedDirect);
      if (!orderedDirect.length) {
        setKpiError("No KPI records found yet.");
      }
    } catch (firestoreError) {
      console.warn("Direct KPI fetch failed, attempting API fallback", firestoreError);
      try {
        const fallbackEntries = await gatherViaApi();
        const orderedFallback = fallbackEntries
          .sort((a, b) => {
            const aTime = a.addedAt ? Date.parse(a.addedAt) : 0;
            const bTime = b.addedAt ? Date.parse(b.addedAt) : 0;
            return bTime - aTime;
          })
          .slice(0, 50);

        setKpiRecords(orderedFallback);
        if (!orderedFallback.length) {
          setKpiError("No KPI records found yet.");
        }
      } catch (apiError) {
        console.error("Failed to load KPI records", apiError);
        setKpiRecords([]);
        setKpiError(apiError?.message || "Unable to load KPI records");
      }
    } finally {
      setKpiLoading(false);
    }
  }, [currentUser]);

  // 🔹 Fetch current user profile (role-aware) + initial tasks
  useEffect(() => {
    if (!currentUser) return;

    const fetchData = async () => {
      try {
        const meRef = doc(db, "users", currentUser.uid);
        const meSnap = await getDoc(meRef);
        const meData = meSnap.exists() ? { id: meSnap.id, ...meSnap.data() } : null;
        const normalizedRole = (meData?.role || "employee").toLowerCase();
        setCurrentUserRole(normalizedRole);

        let usersData = [];
        if (normalizedRole === "admin") {
          const usersSnap = await getDocs(collection(db, "users"));
          usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } else if (meData) {
          usersData = [meData];
        } else {
          usersData = [{ id: currentUser.uid, uid: currentUser.uid, email: currentUser.email || "", role: "employee" }];
        }
        setUsers(usersData);

        const tasksSnap = await getDocs(collection(db, "tasks"));
        const tasksData = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTasks(tasksData);
        const map = {};
        tasksData.forEach((t) => (map[t.id] = t.actualStatus || ""));
        setActualStatusMap(map);
      } catch (error) {
        console.error("Failed to load initial dashboard data", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentUser]);

  // watch auth state so we know who is signed in (employee)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push("/login");
        return;
      }
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  // listen for this user's pending statusRequests so we can show pending badges
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'statusRequests'), where('requestedByUid', '==', currentUser.uid));
    const unsub = onSnapshot(q, (snap) => {
      const pending = new Set();
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.status === 'pending' && data.taskId) pending.add(data.taskId);
      });
      setPendingRequests(pending);
    });
    return () => unsub();
  }, [currentUser]);

  // show a welcome popup for employees (5s) when they sign in / visit
  useEffect(() => {
    if (!currentUser || !users || users.length === 0) return;
    const me = users.find((u) => u.uid === currentUser.uid || u.id === currentUser.uid || u.email === currentUser.email);
    if (!me || me.role === "admin") return;

    let hideTimer = null;
    let unmountTimer = null;
    setShowWelcomeEmployee(true);
    // trigger enter animation
    setTimeout(() => setWelcomeVisibleEmployee(true), 50);
    // hide after 5s
    hideTimer = setTimeout(() => setWelcomeVisibleEmployee(false), 5000);
    // unmount after animation ends (500ms)
    unmountTimer = setTimeout(() => setShowWelcomeEmployee(false), 5600);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (unmountTimer) clearTimeout(unmountTimer);
    };
  }, [currentUser, users]);

  // Real-time listeners
  useEffect(() => {
    const tasksRef = collection(db, "tasks");
    const unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
      const t = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setTasks(t);
      setActualStatusMap((prev) => {
        const next = { ...prev };
        t.forEach((task) => {
          if (typeof task.actualStatus !== "undefined") next[task.id] = task.actualStatus;
          else if (!(task.id in next)) next[task.id] = "";
        });
        Object.keys(next).forEach((k) => {
          if (!t.find((x) => x.id === k)) delete next[k];
        });
        return next;
      });
    });

    return () => {
      unsubscribeTasks();
    };
  }, []);

  useEffect(() => {
    if (!currentUser || currentUserRole !== "admin") return;
    const usersRef = collection(db, "users");
    const unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
      setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribeUsers();
  }, [currentUser, currentUserRole]);

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

  const normalizeDateOnly = (rawValue) => {
    const date = toDateObj(rawValue);
    if (!date) return null;
    const normalized = new Date(date.getTime());
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };

  const isWithinRange = (dateObj, start, end) => {
    if (!start && !end) return true;
    if (!dateObj) return false;
    const value = normalizeDateOnly(dateObj);
    if (!value) return false;
    if (start) {
      const startDate = normalizeDateOnly(start);
      if (startDate && value < startDate) return false;
    }
    if (end) {
      const endDate = normalizeDateOnly(end);
      if (endDate && value > endDate) return false;
    }
    return true;
  };

  const getTaskAssignmentDate = (task) => {
    if (!task) return null;
    return (
      normalizeDateOnly(task.startDate) ||
      normalizeDateOnly(task.assignedDate) ||
      normalizeDateOnly(task.createdAt) ||
      normalizeDateOnly(task.endDate)
    );
  };

  const getKpiEntryDate = (entry) => {
    if (!entry) return null;
    if (entry.date) return normalizeDateOnly(entry.date);
    const monthIndex = MONTH_NAME_TO_INDEX[(entry.month || "").toString().trim().toLowerCase()];
    const yearNumber = Number(entry.year);
    if (!Number.isFinite(monthIndex) || !Number.isFinite(yearNumber)) return null;
    const date = new Date(yearNumber, monthIndex, 1);
    date.setHours(0, 0, 0, 0);
    return date;
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

  // allow employee to request a status change (create approval request instead of direct change)
  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const t = tasks.find((x) => x.id === taskId) || {};
      await addDoc(collection(db, 'statusRequests'), {
        taskId,
        taskTitle: t.title || "",
        requestedByUid: currentUser ? currentUser.uid : null,
        requestedByEmail: currentUser ? currentUser.email : null,
        requestedByName: currentUser ? (currentUser.displayName || currentUser.email) : null,
        fromStatus: t.status || "",
        requestedStatus: newStatus,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      // mark locally as pending for quick feedback
      setPendingRequests((prev) => new Set(prev).add(taskId));
      alert('Request submitted for admin approval.');
    } catch (err) {
      console.error('Request failed', err);
      alert('Failed to submit request: ' + (err.message || err));
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
    const body = encodeURIComponent(`Dear team,\n\nYou have urgent tasks due soon:\n\n${bodies.join("")}\nPlease complete them as soon as possible.\n\nRegard\nQuality Manager\nShahid Ali`);
    const gmailUrl = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${subject}&body=${body}`;
    window.open(gmailUrl, "_blank");
  };

  // convenience: send both portal notification and open email compose
  const sendBoth = async () => {
    await sendPortalReminders();
    openEmailCompose();
  };

  // Notifications for portal reminders targeted to current user
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    const getSortValue = (input) => {
      if (!input) return 0;
      if (input.seconds) return input.seconds;
      if (typeof input === "number") return input / 1000;
      if (input instanceof Date) return input.getTime() / 1000;
      if (input.toDate && typeof input.toDate === "function") {
        return input.toDate().getTime() / 1000;
      }
      return 0;
    };

    let uidDocs = [];
    let emailDocs = [];

    const syncNotifications = () => {
      const map = {};
      uidDocs.forEach((doc) => {
        map[doc.id] = doc;
      });
      emailDocs.forEach((doc) => {
        map[doc.id] = doc;
      });
      const combined = Object.values(map).sort((a, b) => getSortValue(b.createdAt) - getSortValue(a.createdAt));
      setNotifications(combined);
    };

    const uidQuery = query(collection(db, "notifications"), where("recipientUid", "==", currentUser.uid));
    const unsubUid = onSnapshot(uidQuery, (snap) => {
      uidDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      syncNotifications();
    });

    let unsubEmail = () => {};
    if (currentUser.email) {
      const emailQuery = query(collection(db, "notifications"), where("recipientEmail", "==", currentUser.email));
      unsubEmail = onSnapshot(emailQuery, (snap) => {
        emailDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        syncNotifications();
      });
    }

    return () => {
      unsubUid();
      unsubEmail();
    };
  }, [currentUser]);

  // derive employee profile and tasks
  const meProfile = useMemo(() => {
    if (!currentUser || !users) return null;
    return users.find((u) => u.uid === currentUser.uid || u.id === currentUser.uid || u.email === currentUser.email) || null;
  }, [currentUser, users]);

  const meProfileUid = meProfile?.uid || "";
  const meProfileId = meProfile?.id || "";
  const meProfileEmail = meProfile?.email || "";

  useEffect(() => {
    if (!currentUser) return;
    const identifiers = new Set();
    if (currentUser.uid) identifiers.add(currentUser.uid);
    if (meProfileUid) identifiers.add(meProfileUid);
    if (meProfileId) identifiers.add(meProfileId);

    const idList = Array.from(identifiers).filter(Boolean);
    if (idList.length === 0) return;

    const limitedIds = idList.slice(0, 10);
    const attendanceQuery =
      limitedIds.length === 1
        ? query(collection(db, "attendance"), where("userId", "==", limitedIds[0]))
        : query(collection(db, "attendance"), where("userId", "in", limitedIds));

    const unsub = onSnapshot(attendanceQuery, (snap) => {
      setAttendanceRecords(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [currentUser, meProfileUid, meProfileId]);

  useEffect(() => {
    fetchKpisViaApi();
  }, [fetchKpisViaApi]);

  const myTasks = useMemo(() => {
    if (!currentUser || !tasks) return [];
    const email = currentUser.email || null;
    return tasks.filter((t) => (t.assignedTo && t.assignedTo === currentUser.uid) || (t.assignedEmail && email && t.assignedEmail === email));
  }, [tasks, currentUser]);

  const recentTasks = useMemo(() => {
    return myTasks.slice().sort((a, b) => {
      const aTime = a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
      const bTime = b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
      return bTime - aTime;
    }).slice(0, 6);
  }, [myTasks]);

  const myEvaluation = useMemo(() => {
    const total = myTasks.length;
    const completed = myTasks.filter((t) => (t.status || '').toLowerCase().includes('complete')).length;
    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);
    let grade;
    if (rate > 90) grade = 'A';
    else if (rate >= 85 && rate <= 90) grade = 'B';
    else if (rate >= 80 && rate <= 84) grade = 'C';
    else if (rate >= 70 && rate <= 79) grade = 'D';
    else grade = 'F';
    return { total, completed, rate, grade, remarks: grade === 'F' ? 'need improvment' : '' };
  }, [myTasks]);

  const filteredMyTasks = useMemo(() => {
    return myTasks.filter((task) => isWithinRange(getTaskAssignmentDate(task), taskFilterStart, taskFilterEnd));
  }, [myTasks, taskFilterStart, taskFilterEnd]);

  const portalReminders = useMemo(() => {
    if (!notifications || notifications.length === 0) return [];
    const taskLookup = myTasks.reduce((acc, task) => {
      acc[task.id] = task;
      return acc;
    }, {});
    return notifications
      .filter((notif) => {
        const title = (notif.title || "").toLowerCase();
        const message = (notif.message || "").toLowerCase();
        const looksLikeReminder = title.includes("reminder") || message.includes("reminder");
        const belongsToTask = notif.taskId ? Boolean(taskLookup[notif.taskId]) : true;
        return looksLikeReminder && belongsToTask;
      })
      .map((notif) => ({
        ...notif,
        task: notif.taskId ? taskLookup[notif.taskId] : null,
      }));
  }, [notifications, myTasks]);

  const evaluationTasks = useMemo(() => {
    return myTasks.filter((task) => isWithinRange(getTaskAssignmentDate(task), evaluationStartDate, evaluationEndDate));
  }, [myTasks, evaluationStartDate, evaluationEndDate]);

  const filteredAttendanceRecords = useMemo(() => {
    return attendanceRecords.filter((record) => {
      const rawDate = record.date || record.dateKey || record.fullDate;
      return isWithinRange(normalizeDateOnly(rawDate), evaluationStartDate, evaluationEndDate);
    });
  }, [attendanceRecords, evaluationStartDate, evaluationEndDate]);

  const filteredKpiRecords = useMemo(() => {
    return kpiRecords.filter((entry) => isWithinRange(getKpiEntryDate(entry), evaluationStartDate, evaluationEndDate));
  }, [kpiRecords, evaluationStartDate, evaluationEndDate]);

  const sortedKpiRecords = useMemo(() => {
    return filteredKpiRecords.slice().sort((a, b) => {
      const dateA = getKpiEntryDate(a);
      const dateB = getKpiEntryDate(b);
      return (dateB?.getTime() || 0) - (dateA?.getTime() || 0);
    });
  }, [filteredKpiRecords]);

  const evaluationStats = useMemo(() => {
    const completedCount = evaluationTasks.filter((task) => canonicalStatus(task.status || task.actualStatus || "") === "completed").length;
    const delayedCount = evaluationTasks.filter((task) => canonicalStatus(task.status || task.actualStatus || "") === "delayed").length;
    const closingDenominator = completedCount + delayedCount;
    const completionRate = closingDenominator > 0 ? (completedCount / closingDenominator) * 100 : 0;
    const taskClosingScore = (completionRate / 100) * 50;

    const qualityMarks = evaluationTasks
      .map((task) => (typeof task.qualityMark === "number" ? task.qualityMark : null))
      .filter((mark) => typeof mark === "number");
    const qualityAverage = qualityMarks.length > 0 ? qualityMarks.reduce((sum, mark) => sum + mark, 0) / qualityMarks.length : 0;
    const qualityScore = (qualityAverage / 100) * 20;

    const attendanceCounts = filteredAttendanceRecords.reduce(
      (acc, record) => {
        const status = record.status || record.attendanceStatus;
        if (!status) return acc;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      { present: 0, outdoor: 0, shortLeave: 0, absent: 0, off: 0 }
    );

    const attendanceNumerator =
      (attendanceCounts.present || 0) +
      (attendanceCounts.outdoor || 0) +
      (attendanceCounts.shortLeave || 0) * 0.8;
    const attendanceDenominator =
      (attendanceCounts.present || 0) +
      (attendanceCounts.outdoor || 0) +
      (attendanceCounts.shortLeave || 0) +
      (attendanceCounts.absent || 0);
    const attendancePercentage = attendanceDenominator > 0 ? (attendanceNumerator / attendanceDenominator) * 100 : 0;
    const attendanceScore = (attendancePercentage / 100) * 15;

    const kpiValues = filteredKpiRecords
      .map((entry) => Number(entry.score))
      .filter((value) => Number.isFinite(value) && value >= 0);
    const kpiAverage = kpiValues.length > 0 ? kpiValues.reduce((sum, value) => sum + value, 0) / kpiValues.length : 0;
    const kpiScore = (kpiAverage / 100) * 15;

    const totalScore = taskClosingScore + attendanceScore + qualityScore + kpiScore;
    const grade = gradeFromScore(totalScore);

    return {
      completionRate,
      taskClosingScore,
      attendancePercentage,
      attendanceScore,
      qualityAverage,
      qualityScore,
      kpiAverage,
      kpiScore,
      totalScore,
      grade,
      attendanceCounts,
      closingDenominator,
    };
  }, [evaluationTasks, filteredAttendanceRecords, filteredKpiRecords]);

  const evaluationRangeActive = Boolean(evaluationStartDate || evaluationEndDate);
  const taskFilterActive = Boolean(taskFilterStart || taskFilterEnd);

  // If current user is an employee, render a minimal employee dashboard only
  if (currentUser && meProfile && meProfile.role !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-indigo-50 p-6">
        <div className="sticky top-0 z-50 bg-white/70 backdrop-blur-sm py-3">
          <div className="max-w-6xl mx-auto px-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-3">
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-600 drop-shadow">
                <rect width="48" height="48" rx="8" fill="#0ea5e9" />
                <path d="M12 9v30M36 9v30M12 24h24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-2xl font-extrabold text-blue-600">Haier</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-lg font-semibold text-gray-800">{meProfile?.name ? `${meProfile.name}` : (meProfile?.email || '')}</div>
              <button onClick={handleLogout} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition transform hover:-translate-y-0.5">Logout</button>
            </div>
          </div>
        </div>

        {/* Employee welcome overlay */}
        {showWelcomeEmployee && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className={`bg-white rounded-2xl p-8 max-w-xl mx-4 text-center transform transition-all duration-500 ${welcomeVisibleEmployee ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}`}>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">{new Date().getHours() >= 12 ? 'Good Afternoon' : 'Good Morning'} {meProfile.name || ''}</h2>
              <p className="text-gray-600">Your hard work will pay off</p>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="bg-white/90 p-6 rounded-2xl shadow-xl ring-1 ring-gray-100 hover:shadow-2xl transform transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold">Your Evaluation</h3>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{evaluationRangeActive ? 'Filtered progress' : 'Overall progress'}</span>
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={evaluationStartDate}
                  onChange={(e) => setEvaluationStartDate(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={evaluationEndDate}
                  onChange={(e) => setEvaluationEndDate(e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setEvaluationStartDate("");
                  setEvaluationEndDate("");
                }}
                disabled={!evaluationRangeActive}
                className={`rounded-md px-4 py-2 text-sm font-semibold transition ${evaluationRangeActive ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
              >
                Clear filter
              </button>
            </div>

            <p className="text-sm text-gray-600 mt-3">
              Reviewing <span className="font-semibold text-gray-800">{evaluationTasks.length}</span> task{evaluationTasks.length === 1 ? '' : 's'} {evaluationRangeActive ? 'in the selected range.' : 'across your full assignment history.'}
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border p-4 bg-gradient-to-br from-slate-50 to-white">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Task closing marks</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{formatOneDecimal(evaluationStats.taskClosingScore)} <span className="text-sm text-gray-500">/ 50</span></p>
                <p className="text-xs text-gray-500 mt-1">{formatOneDecimal(evaluationStats.completionRate)}% completion rate</p>
              </div>
              <div className="rounded-2xl border p-4 bg-gradient-to-br from-slate-50 to-white">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attendance marks %</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{formatOneDecimal(evaluationStats.attendancePercentage)}%</p>
                <p className="text-xs text-gray-500 mt-1">{formatOneDecimal(evaluationStats.attendanceScore)} / 15 marks</p>
              </div>
              <div className="rounded-2xl border p-4 bg-gradient-to-br from-slate-50 to-white">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quality of work score</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{formatOneDecimal(evaluationStats.qualityScore)} <span className="text-sm text-gray-500">/ 20</span></p>
                <p className="text-xs text-gray-500 mt-1">Avg quality: {formatOneDecimal(evaluationStats.qualityAverage)}</p>
              </div>
              <div className="rounded-2xl border p-4 bg-gradient-to-br from-slate-50 to-white">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">KPI score</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900">{formatOneDecimal(evaluationStats.kpiScore)} <span className="text-sm text-gray-500">/ 15</span></p>
                <p className="text-xs text-gray-500 mt-1">Avg KPI: {formatOneDecimal(evaluationStats.kpiAverage)}</p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-blue-500 p-5 text-white shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Overall progress</p>
                  <div className="text-4xl font-extrabold leading-tight">{formatOneDecimal(evaluationStats.totalScore)}%</div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/80">Grade</p>
                  <div className="text-3xl font-black">{evaluationStats.grade}</div>
                </div>
              </div>
              <div className="mt-4 h-2 w-full rounded-full bg-white/30">
                <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, Math.max(0, evaluationStats.totalScore))}%` }} />
              </div>
              <p className="mt-3 text-xs text-white/80">When no filter is applied you are viewing your overall performance.</p>
            </div>

            <p className="mt-4 text-xs text-gray-500">Lifetime summary: {myEvaluation.completed}/{myEvaluation.total} tasks closed ({myEvaluation.rate}%).</p>

            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <h4 className="text-md font-semibold text-gray-800">KPI history</h4>
                  <p className="text-xs text-gray-500">Only your KPI scores {evaluationRangeActive ? "in this range" : "recorded to date"} are shown.</p>
                </div>
                {kpiLoading && <span className="text-xs font-semibold text-indigo-600">Loading…</span>}
              </div>

              {kpiError ? (
                <p className="text-sm text-red-600">{kpiError}</p>
              ) : sortedKpiRecords.length === 0 ? (
                <p className="text-sm text-gray-500">{evaluationRangeActive ? "No KPI entries fall inside this range." : "No KPI scores have been recorded yet."}</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-widest text-gray-500">
                        <th className="px-4 py-2">Month</th>
                        <th className="px-4 py-2">Score</th>
                        <th className="px-4 py-2">Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedKpiRecords.map((entry) => (
                        <tr key={entry.id} className="border-t last:border-b-0">
                          <td className="px-4 py-2 text-gray-800">{entry.month || "-"} {entry.year || ""}</td>
                          <td className="px-4 py-2 font-semibold text-gray-900">{formatOneDecimal(Number(entry.score) || 0)}</td>
                          <td className="px-4 py-2 text-xs text-gray-500">{entry.addedAt ? formatDate(entry.addedAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white/90 p-6 rounded-2xl shadow-xl mb-6 ring-1 ring-gray-100 hover:shadow-2xl transform transition-all duration-300 hover:-translate-y-1">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">Your Tasks</h2>
            <div className="text-sm text-gray-500">
              {taskFilterActive
                ? `Showing ${filteredMyTasks.length} of ${myTasks.length} tasks`
                : `Only your assigned tasks are shown here (${myTasks.length})`}
            </div>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-end mb-4">
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Start date</label>
              <input
                type="date"
                value={taskFilterStart}
                onChange={(e) => setTaskFilterStart(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">End date</label>
              <input
                type="date"
                value={taskFilterEnd}
                onChange={(e) => setTaskFilterEnd(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setTaskFilterStart("");
                setTaskFilterEnd("");
              }}
              disabled={!taskFilterActive}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition ${taskFilterActive ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-200 text-gray-500 cursor-not-allowed'}`}
            >
              Clear filter
            </button>
          </div>

          {filteredMyTasks.length === 0 ? (
            <p className="text-gray-500">{taskFilterActive ? 'No tasks match this date range.' : 'You have no tasks assigned.'}</p>
          ) : (
            <div className="divide-y">
              {filteredMyTasks.map((task) => (
                <div key={task.id} className={`py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 ${statusChangingIds.has(task.id) ? 'animate-pulse ring-2 ring-indigo-200' : 'hover:shadow-sm'}`}>
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{task.title} {task.priority && (<span className={`ml-2 text-xs font-semibold inline-block px-2 py-1 rounded ${task.priority === 'high' ? 'bg-red-100 text-red-700' : task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{task.priority}</span>)} {pendingRequests.has(task.id) && (<span className="ml-2 text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded">Pending approval</span>)}</p>
                    <p className="text-sm text-gray-500 mt-1">Duration: {formatDate(task.startDate)} — {formatDate(task.endDate)}</p>
                  </div>

                  <div className="flex-shrink-0 flex items-center gap-2">
                    <div className="relative flex items-center">
                      <select value={task.status || 'in process'} onChange={(e) => updateTaskStatus(task.id, e.target.value)} className={`border p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 transition transform hover:scale-105 ${task.status === 'completed' ? 'bg-green-600 text-white' : task.status === 'delayed' || task.status === 'cancelled' ? 'bg-red-600 text-white' : 'bg-yellow-400 text-black'}`}>
                        <option value="completed">completed</option>
                        <option value="in process">in process</option>
                        <option value="delayed">delayed</option>
                        <option value="cancelled">cancelled</option>
                      </select>
                      {/* Reaction emoji shown briefly when status changes */}
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
          )}
        </div>

        <div className="mb-6">
          <div className="bg-white/90 p-6 rounded-2xl shadow-xl ring-1 ring-gray-100 hover:shadow-2xl transform transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Portal Reminders</h3>
              <span className="text-xs uppercase tracking-wide text-gray-500">{portalReminders.length} active</span>
            </div>
            {portalReminders.length === 0 ? <p className="text-gray-500">No portal reminders yet. You will see admin reminders for your tasks here.</p> : (
              <ul className="space-y-2">
                {portalReminders.map((reminder) => (
                  <li key={reminder.id} className="p-3 border rounded hover:bg-gray-50 transition">
                    <div className="font-medium">{reminder.task?.title || reminder.title}</div>
                    <div className="text-sm text-gray-600">{reminder.message}</div>
                    {reminder.task && (
                      <div className="text-xs text-gray-500 mt-1">Due: {formatDate(reminder.task.endDate)} • Status: {reminder.task.status || 'pending'}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      Sent {reminder.createdAt && reminder.createdAt.toDate ? reminder.createdAt.toDate().toLocaleString() : formatDate(reminder.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white/90 p-6 rounded-2xl shadow-xl ring-1 ring-gray-100 hover:shadow-2xl transform transition-all duration-300 hover:-translate-y-1">
          <h3 className="text-lg font-semibold mb-3">Recent Tasks</h3>
          {recentTasks.length === 0 ? <p className="text-gray-500">No recent tasks.</p> : (
            <ul className="space-y-2">
              {recentTasks.map((t) => (
                <li key={t.id} className="p-2 border rounded">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-xs text-gray-500">Due: {formatDate(t.endDate)}</div>
                    </div>
                    <div className="text-sm font-semibold">{t.status}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {/* Employee welcome overlay */}
      {showWelcomeEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className={`bg-white rounded-2xl p-8 max-w-xl mx-4 text-center transform transition-all duration-500 ${welcomeVisibleEmployee ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-6 scale-95"}`}>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">{new Date().getHours() >= 12 ? 'Good Afternoon' : 'Good Morning'} {(() => {
              const me = users.find((u) => u.uid === (currentUser && currentUser.uid) || u.id === (currentUser && currentUser.uid) || u.email === (currentUser && currentUser.email));
              return me ? me.name || '' : '';
            })()}</h2>
            <p className="text-gray-600">Your hard work will pay off</p>
          </div>
        </div>
      )}
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
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <button onClick={() => setActiveView("progress")} className={`px-3 py-1 rounded-md text-sm ${activeView === "progress" ? "bg-white/20" : "bg-white/10"}`}>Employee Progress</button>
                <button onClick={() => setActiveView("alltasks")} className={`px-3 py-1 rounded-md text-sm ${activeView === "alltasks" ? "bg-white/20" : "bg-white/10"}`}>All Task</button>
                <button onClick={() => setActiveView("members")} className={`px-3 py-1 rounded-md text-sm ${activeView === "members" ? "bg-white/20" : "bg-white/10"}`}>Member/Task Assigned</button>
              </div>
              <button onClick={handleLogout} className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-md">Logout</button>
            </div>
          </div>
        </div>
      </div>

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
          <div className="p-3 bg-gray-50 rounded-lg">
            <DashboardAnalytics tasks={tasks} />
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

      )}

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