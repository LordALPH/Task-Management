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
  writeBatch,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import DashboardAnalytics from "./component/DashboardAnalytics";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import Papa from "papaparse";
import * as XLSX from "xlsx";

const KPI_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const KPI_MONTH_INDEX = KPI_MONTHS.reduce((acc, month, index) => {
  acc[month] = index;
  return acc;
}, {});

const ATTENDANCE_STATUS_CONFIG = {
  present: {
    label: "Present",
    badgeClass: "bg-green-100 text-green-700",
    button: {
      active: "bg-green-600 text-white",
      inactive: "bg-green-100 text-green-700 hover:bg-green-200",
    },
  },
  outdoor: {
    label: "Outdoor",
    badgeClass: "bg-emerald-100 text-emerald-700",
    button: {
      active: "bg-emerald-600 text-white",
      inactive: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
    },
  },
  shortLeave: {
    label: "Short leave",
    badgeClass: "bg-purple-100 text-purple-700",
    button: {
      active: "bg-purple-600 text-white",
      inactive: "bg-purple-100 text-purple-700 hover:bg-purple-200",
    },
  },
  absent: {
    label: "Absent",
    badgeClass: "bg-red-100 text-red-700",
    button: {
      active: "bg-red-600 text-white",
      inactive: "bg-red-100 text-red-700 hover:bg-red-200",
    },
  },
  off: {
    label: "Off",
    badgeClass: "bg-blue-100 text-blue-700",
    button: {
      active: "bg-blue-600 text-white",
      inactive: "bg-blue-100 text-blue-700 hover:bg-blue-200",
    },
  },
};

const ATTENDANCE_STATUS_ORDER = ["present", "outdoor", "shortLeave", "absent", "off"];

const INLINE_STATUS_OPTIONS = ["pending", "in process", "completed", "delayed", "cancelled"];
const INLINE_PRIORITY_OPTIONS = ["high", "medium", "low"];

const createInlineRow = () => ({
  id: `inline-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  title: "",
  startDate: "",
  endDate: "",
  status: "pending",
  priority: "medium",
});

const buildInitialInlineRows = () => Array.from({ length: 5 }, () => createInlineRow());

const normalizeDateInputString = (value) => {
  if (!value) return "";
  const trimmed = value.toString().trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const sanitizeInlineStatus = (value) => {
  if (!value) return "pending";
  const normalized = value.toString().trim().toLowerCase();
  if (INLINE_STATUS_OPTIONS.includes(normalized)) return normalized;
  if (normalized.includes("complete")) return "completed";
  if (normalized.includes("delay")) return "delayed";
  if (normalized.includes("cancel")) return "cancelled";
  if (normalized.includes("process")) return "in process";
  return "pending";
};

const sanitizeInlinePriority = (value) => {
  if (!value) return "medium";
  const normalized = value.toString().trim().toLowerCase();
  if (INLINE_PRIORITY_OPTIONS.includes(normalized)) return normalized;
  return "medium";
};

export default function AdminDashboard() {
  const router = useRouter();
  const getTodayISO = () => {
    const now = new Date();
    const tzOffsetMs = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - tzOffsetMs).toISOString().split("T")[0];
  };
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [assignedEmail, setAssignedEmail] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
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
  const [priority, setPriority] = useState("medium");
  const [reminderOnAdd, setReminderOnAdd] = useState(false);

  // delete-mode toggles shown at section headings (right side)
  const [showDeleteUsers, setShowDeleteUsers] = useState(false);
  const [showDeleteTasks, setShowDeleteTasks] = useState(false);

  // UI view state: 'progress' | 'alltasks' | 'members'
  const [activeView, setActiveView] = useState("progress");
  const [filterName, setFilterName] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState(new Set(["all"]));
  const [performanceStartDate, setPerformanceStartDate] = useState("");
  const [performanceEndDate, setPerformanceEndDate] = useState("");
  const [bulkEntryMode, setBulkEntryMode] = useState("file");
  const [inlineBulkRows, setInlineBulkRows] = useState(() => buildInitialInlineRows());
  const [inlinePasteValue, setInlinePasteValue] = useState("");

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
  // client-only current user email to avoid hydration mismatch
  const [currentEmail, setCurrentEmail] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const ensureAdminProfile = useCallback(async () => {
    const current = auth.currentUser;
    if (!current) return null;
    try {
      const adminRef = doc(db, "users", current.uid);
      const adminSnap = await getDoc(adminRef);
      const basePayload = {
        uid: current.uid,
        email: current.email || "",
        name: current.displayName || current.email || "Admin",
        role: "admin",
      };

      if (!adminSnap.exists()) {
        await setDoc(adminRef, { ...basePayload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        return basePayload;
      }

      const data = adminSnap.data() || {};
      if (data.role !== "admin" || data.email !== basePayload.email || !data.name) {
        await setDoc(adminRef, { ...data, ...basePayload, updatedAt: serverTimestamp() }, { merge: true });
        return { ...data, ...basePayload };
      }

      return data;
    } catch (err) {
      console.error("Failed to ensure admin profile:", err);
      return null;
    }
  }, []);
  // approvals list
  const [showApprovalsPanel, setShowApprovalsPanel] = useState(false);
  const [approvals, setApprovals] = useState([]);
  // Task closing feature state
  const [showTaskClosingPanel, setShowTaskClosingPanel] = useState(false);
  const [selectedMemberForClosing, setSelectedMemberForClosing] = useState("");
  const [marksDraft, setMarksDraft] = useState({});
  const [savingMarkTaskId, setSavingMarkTaskId] = useState("");
  // Quality of Work panel state
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [selectedMemberForQuality, setSelectedMemberForQuality] = useState("");
  const [qualityMarksDraft, setQualityMarksDraft] = useState({});
  const [savingQualityMarkTaskId, setSavingQualityMarkTaskId] = useState("");
  const [kpiData, setKpiData] = useState({});
  const [showKpiPanel, setShowKpiPanel] = useState(false);
  const [selectedMemberForKpi, setSelectedMemberForKpi] = useState("");
  const [selectedKpiMonth, setSelectedKpiMonth] = useState("");
  const [selectedKpiYear, setSelectedKpiYear] = useState(new Date().getFullYear().toString());
  const [kpiScoreInput, setKpiScoreInput] = useState("");
  const [savingKpiScore, setSavingKpiScore] = useState(false);
  // Attendance feature state
  const [showAttendancePanel, setShowAttendancePanel] = useState(false);
  const [attendanceData, setAttendanceData] = useState({});
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(() => getTodayISO());
  const [savingAttendanceKey, setSavingAttendanceKey] = useState("");
  // Bulk attendance state
  const [bulkAttendanceDate, setBulkAttendanceDate] = useState("");
  const [bulkAttendanceAction, setBulkAttendanceAction] = useState("present");
  const [applyingBulkAttendance, setApplyingBulkAttendance] = useState(false);

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

  // keep a client-side current email state in sync with auth to avoid SSR/CSR mismatch
  useEffect(() => {
    try {
      const unsub = onAuthStateChanged(auth, (u) => {
        setCurrentEmail(u ? u.email : null);
        setAuthReady(true);
        if (!u) {
          router.push("/login");
        }
      });
      return () => unsub && unsub();
    } catch (e) {
      // ignore in non-browser environments
      setAuthReady(true);
    }
  }, [router]);

  // 🔹 Fetch all users + tasks (initial)
  useEffect(() => {
    if (!authReady) return;
    const run = async () => {
      const current = auth.currentUser;
      if (!current) return;
      await ensureAdminProfile();
      const [usersSnap, tasksSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "tasks")),
      ]);
      const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const tasksData = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(usersData);
      setTasks(tasksData);
      const map = {};
      tasksData.forEach((t) => (map[t.id] = t.actualStatus || ""));
      setActualStatusMap(map);
      setLoading(false);
    };
    run();
  }, [authReady, ensureAdminProfile]);

  // Real-time listeners (users, tasks, approvals)
  useEffect(() => {
    if (!authReady) return;
    const current = auth.currentUser;
    if (!current) return;
    let unsubscribeUsers = () => {};
    let unsubscribeTasks = () => {};
    let unsubscribeApprovals = () => {};

    const setup = async () => {
      await ensureAdminProfile();

      const usersRef = collection(db, "users");
      unsubscribeUsers = onSnapshot(usersRef, (snapshot) => {
        setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      });

      const tasksRef = collection(db, "tasks");
      unsubscribeTasks = onSnapshot(tasksRef, (snapshot) => {
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

      const approvalsRef = collection(db, 'statusRequests');
      unsubscribeApprovals = onSnapshot(query(approvalsRef, where('status', '==', 'pending')), (snap) => {
        setApprovals(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      setLoading(false);
    };

    setup();

    return () => {
      unsubscribeUsers();
      unsubscribeTasks();
      unsubscribeApprovals();
    };
  }, [authReady, ensureAdminProfile]);

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

  const normalizeToMidnight = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    date.setHours(0, 0, 0, 0);
    return date;
  };

  const resetInlineSheet = () => {
    setInlineBulkRows(buildInitialInlineRows());
    setInlinePasteValue("");
  };

  const resetBulkPanelInputs = () => {
    setBulkFile(null);
    setBulkAssignedUserId("");
    setBulkAssignedEmail("");
    setBulkPreviewRows(null);
    setShowBulkPreview(false);
    setBulkEntryMode("file");
    resetInlineSheet();
  };

  const closeBulkPanel = () => {
    setShowBulkPanel(false);
    resetBulkPanelInputs();
  };

  const updateInlineRow = (rowId, field, value) => {
    setInlineBulkRows((prev) => prev.map((row) => (row.id === rowId ? { ...row, [field]: value } : row)));
  };

  const addInlineRows = (count = 1) => {
    setInlineBulkRows((prev) => [...prev, ...Array.from({ length: count }, () => createInlineRow())]);
  };

  const removeInlineRow = (rowId) => {
    setInlineBulkRows((prev) => {
      if (prev.length === 1) return prev;
      return prev.filter((row) => row.id !== rowId);
    });
  };

  const handleInlinePasteApply = () => {
    if (!inlinePasteValue.trim()) {
      alert("Paste rows into the sheet textbox first.");
      return;
    }

    const lines = inlinePasteValue
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      alert("No valid rows detected in pasted content.");
      return;
    }

    const parsed = lines.map((line) => {
      const parts = line.split(/\t|,/).map((part) => part.trim());
      const [title, start, end, status, priority] = parts;
      const base = createInlineRow();
      return {
        ...base,
        title: title || "",
        startDate: normalizeDateInputString(start) || "",
        endDate: normalizeDateInputString(end) || "",
        status: sanitizeInlineStatus(status),
        priority: sanitizeInlinePriority(priority),
      };
    });

    setInlineBulkRows(parsed.length ? parsed : buildInitialInlineRows());
    setInlinePasteValue("");
  };

  const handleInlinePreview = () => {
    if (!bulkAssignedUserId && !bulkAssignedEmail) {
      alert("Choose or enter an assignee before previewing.");
      return;
    }

    const rows = inlineBulkRows
      .map((row) => ({
        title: row.title.trim(),
        startDate: row.startDate || null,
        endDate: row.endDate || null,
        status: sanitizeInlineStatus(row.status),
        priority: sanitizeInlinePriority(row.priority),
      }))
      .filter((row) => row.title);

    if (rows.length === 0) {
      alert("Add at least one task title before previewing.");
      return;
    }

    const invalidRow = rows.find((row) => row.startDate && row.endDate && new Date(row.startDate) > new Date(row.endDate));
    if (invalidRow) {
      alert(`Start date cannot be after end date for "${invalidRow.title}".`);
      return;
    }

    setBulkPreviewRows(rows);
    setShowBulkPreview(true);
  };

  const handleBulkEntryModeChange = (mode) => {
    if (mode === bulkEntryMode) return;
    setBulkEntryMode(mode);
    if (mode === "sheet") {
      setBulkFile(null);
    }
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

  // Completed tasks derived from realtime `tasks`
  const completedTasks = useMemo(() => {
    return (tasks || []).filter((t) => {
      const s = canonicalStatus(t.status || t.actualStatus || "");
      return s === "completed" || s === "delayed";
    });
  }, [tasks]);

  // Resolve member name by uid/email
  const memberNameByTask = (t) => {
    if (t.assignedName) return t.assignedName;
    const uid = t.assignedTo;
    const email = t.assignedEmail;
    const u = users.find((x) => x.uid === uid || x.id === uid || x.email === email);
    return u ? (u.name || u.email || u.uid || u.id) : (email || uid || "Unknown");
  };

  // Per-member total out of 100 = sum of closing marks normalized to 100
  const memberSummaries = useMemo(() => {
    const grouped = {};
    completedTasks.forEach((t) => {
      const key = t.assignedTo || t.assignedEmail || "unassigned";
      if (!grouped[key]) {
        grouped[key] = {
          key,
          marks: [],
          completedCount: 0,
          delayedCount: 0,
        };
      }
      const status = canonicalStatus(t.status || t.actualStatus || "");
      if (status === "completed") grouped[key].completedCount += 1;
      else if (status === "delayed") grouped[key].delayedCount += 1;
      if (typeof t.closingMark === "number") grouped[key].marks.push(t.closingMark);
    });
    return Object.values(grouped).map((g) => {
      const totalTasks = g.completedCount + g.delayedCount;
      const completionPercentage = totalTasks > 0 ? Math.round((g.completedCount / totalTasks) * 100) : 0;
      const labelUser = users.find((x) => x.uid === g.key || x.id === g.key || x.email === g.key);
      const name = labelUser ? (labelUser.name || labelUser.email) : g.key;
      return {
        idOrEmail: g.key,
        name,
        totalOutOf100: completionPercentage,
        tasksCompleted: g.completedCount,
        tasksDelayed: g.delayedCount,
        totalTasks,
      };
    });
  }, [completedTasks, users]);

  const qualitySummaries = useMemo(() => {
    const grouped = {};
    completedTasks.forEach((t) => {
      const status = canonicalStatus(t.status || t.actualStatus || "");
      if (status !== "completed") return;
      const key = t.assignedTo || t.assignedEmail || "unassigned";
      if (!grouped[key]) grouped[key] = { key, marks: [], count: 0 };
      grouped[key].count += 1;
      if (typeof t.qualityMark === "number") grouped[key].marks.push(t.qualityMark);
    });
    return Object.values(grouped).map((g) => {
      const sum = g.marks.reduce((a, b) => a + b, 0);
      const denom = g.marks.length * 100;
      const totalScaled = denom > 0 ? Math.round((sum / denom) * 100) : 0;
      const labelUser = users.find((x) => x.uid === g.key || x.id === g.key || x.email === g.key);
      const name = labelUser ? (labelUser.name || labelUser.email) : g.key;
      return { idOrEmail: g.key, name, totalOutOf100: totalScaled, tasksCompleted: g.count, markedCount: g.marks.length };
    });
  }, [completedTasks, users]);

  // Selected member detailed summary (scaled and raw obtained/total)
  const selectedMemberSummary = useMemo(() => {
    if (!selectedMemberForClosing) return null;
    const list = completedTasks.filter(
      (t) => t.assignedTo === selectedMemberForClosing || t.assignedEmail === selectedMemberForClosing
    );
    const completedList = list.filter((t) => canonicalStatus(t.status || t.actualStatus || "") === "completed");
    const delayedList = list.filter((t) => canonicalStatus(t.status || t.actualStatus || "") === "delayed");
    const totalCount = completedList.length + delayedList.length;
    const completionRate = totalCount > 0 ? Math.round((completedList.length / totalCount) * 100) : 0;
    const marked = list.filter((t) => typeof t.closingMark === "number");
    const sum = marked.reduce((a, t) => a + (t.closingMark || 0), 0);
    const denom = marked.length * 100;
    const scaled = denom > 0 ? Math.round((sum / denom) * 100) : 0;
    const labelUser = users.find((x) => x.uid === selectedMemberForClosing || x.id === selectedMemberForClosing || x.email === selectedMemberForClosing);
    const name = labelUser ? (labelUser.name || labelUser.email) : selectedMemberForClosing;
    return {
      name,
      sum,
      denom,
      scaled,
      markedCount: marked.length,
      completedCount: completedList.length,
      delayedCount: delayedList.length,
      totalCount,
      completionRate,
    };
  }, [selectedMemberForClosing, completedTasks, users]);

  const openTaskClosingPanel = () => {
    setShowTaskClosingPanel(true);
  };
  const closeTaskClosingPanel = () => {
    setShowTaskClosingPanel(false);
    setSelectedMemberForClosing("");
    setMarksDraft({});
    setSavingMarkTaskId("");
  };

  const openQualityPanel = () => {
    setShowQualityPanel(true);
  };
  const closeQualityPanel = () => {
    setShowQualityPanel(false);
    setSelectedMemberForQuality("");
    setQualityMarksDraft({});
    setSavingQualityMarkTaskId("");
  };

  const saveTaskMark = async (taskId, value) => {
    const markNum = Number(value);
    if (Number.isNaN(markNum) || markNum < 0 || markNum > 100) {
      alert("Please enter a valid mark between 0 and 100");
      return;
    }
    try {
      setSavingMarkTaskId(taskId);
      await updateDoc(doc(db, "tasks", taskId), { closingMark: markNum, closingMarkedAt: serverTimestamp() });
      setMarksDraft((prev) => ({ ...prev, [taskId]: markNum }));
    } catch (err) {
      alert("Failed to save mark: " + (err?.message || err));
    } finally {
      setSavingMarkTaskId("");
    }
  };

  const saveQualityMark = async (taskId, value) => {
    const markNum = Number(value);
    if (Number.isNaN(markNum) || markNum < 0 || markNum > 100) {
      alert("Please enter a valid mark between 0 and 100");
      return;
    }
    try {
      setSavingQualityMarkTaskId(taskId);
      await updateDoc(doc(db, "tasks", taskId), { qualityMark: markNum, qualityMarkedAt: serverTimestamp() });
      setQualityMarksDraft((prev) => ({ ...prev, [taskId]: markNum }));
    } catch (err) {
      alert("Failed to save quality mark: " + (err?.message || err));
    } finally {
      setSavingQualityMarkTaskId("");
    }
  };

  // Attendance helpers
  const getHolidays = useCallback((month, year) => {
    const holidays = [];
    // Christmas
    if (month === 11) holidays.push({ date: 25, name: "Christmas" });
    // New Year
    if (month === 0) holidays.push({ date: 1, name: "New Year" });
    // Islamic holidays (approximate - 2025/2026)
    if (year === 2025 && month === 2) holidays.push({ date: 31, name: "Eid al-Fitr" });
    if (year === 2025 && month === 5) holidays.push({ date: 7, name: "Eid al-Adha" });
    if (year === 2026 && month === 2) holidays.push({ date: 20, name: "Eid al-Fitr" });
    if (year === 2026 && month === 4) holidays.push({ date: 27, name: "Eid al-Adha" });
    return holidays;
  }, []);

  const generateCalendarDays = useCallback((month, year) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    const holidays = getHolidays(month, year);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(year, month, d);
      const dayOfWeek = date.getDay();
      const holiday = holidays.find(h => h.date === d);
      days.push({
        date: d,
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
        isSunday: dayOfWeek === 0,
        holiday: holiday?.name || null,
        fullDate: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      });
    }
    return days;
  }, [getHolidays]);

  const loadAttendanceData = useCallback(async () => {
    try {
      const attendanceSnap = await getDocs(collection(db, "attendance"));
      const data = {};
      attendanceSnap.forEach((docSnap) => {
        data[docSnap.id] = docSnap.data().status;
      });
      if (Object.keys(data).length) {
        setAttendanceData((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error("Failed to load attendance:", err);
    }
  }, []);

  const loadKpiData = useCallback(async () => {
    try {
      const kpiSnap = await getDocs(collection(db, "kpi"));
      const data = {};
      kpiSnap.forEach((docSnap) => {
        data[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      setKpiData(data);
    } catch (err) {
      console.error("Failed to load KPI data:", err);
    }
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const user = auth.currentUser;
    if (!user) return;
    ensureAdminProfile().then(() => {
      loadAttendanceData();
      loadKpiData();
    });
  }, [authReady, ensureAdminProfile, loadAttendanceData, loadKpiData]);

  const openAttendancePanel = async () => {
    setShowAttendancePanel(true);
    setSelectedAttendanceDate(getTodayISO());
    // Fetch attendance from Firestore
    try {
      await loadAttendanceData();
    } catch (err) {
      console.error("Failed to load attendance:", err);
    }
  };

  const openKpiPanel = async () => {
    setShowKpiPanel(true);
    const firstEmployee = employeeMembers[0];
    if (firstEmployee && !selectedMemberForKpi) {
      setSelectedMemberForKpi(firstEmployee.uid || firstEmployee.id || firstEmployee.email || "");
    }
    try {
      await loadKpiData();
    } catch (err) {
      console.error("Failed to refresh KPI data:", err);
    }
  };

  const closeKpiPanel = () => {
    setShowKpiPanel(false);
    setSelectedKpiMonth("");
    setKpiScoreInput("");
    setSavingKpiScore(false);
  };

  const closeAttendancePanel = () => {
    setShowAttendancePanel(false);
    setSavingAttendanceKey("");
  };

  const saveKpiScore = async () => {
    if (!selectedMemberForKpi) {
      alert("Select an employee before saving a KPI score.");
      return;
    }

    if (!selectedKpiMonth || !selectedKpiYear) {
      alert("Select both month and year for the KPI score.");
      return;
    }

    const scoreText = `${kpiScoreInput}`.trim();
    if (!scoreText) {
      alert("Enter a KPI score before saving.");
      return;
    }

    const scoreValue = Number(scoreText);
    if (Number.isNaN(scoreValue)) {
      alert("Enter a numeric KPI score of 0 or higher.");
      return;
    }

    if (scoreValue < 0) {
      alert("KPI score cannot be negative.");
      return;
    }

    if (pendingKpiScoreExists) {
      const name = selectedKpiMember?.name
        || selectedKpiMember?.displayName
        || selectedKpiMember?.email
        || "This member";
      alert(`${name} already has a KPI score for ${selectedKpiMonth} ${selectedKpiYear}.`);
      return;
    }

    const member = selectedKpiMember
      || employeeMembers.find((entry) => (entry.uid || entry.id || entry.email) === selectedMemberForKpi)
      || null;
    const memberName = member?.name || member?.displayName || member?.email || "Member";
    const memberEmail = member?.email || "";

    const docId = `${selectedMemberForKpi}_${selectedKpiYear}_${selectedKpiMonth}`;
    const kpiRef = doc(db, "kpi", docId);

    setSavingKpiScore(true);
    try {
      const existing = await getDoc(kpiRef);
      if (existing.exists()) {
        alert(`${memberName} already has a KPI score for ${selectedKpiMonth} ${selectedKpiYear}.`);
        return;
      }

      await setDoc(kpiRef, {
        userId: selectedMemberForKpi,
        userName: memberName,
        userEmail: memberEmail,
        month: selectedKpiMonth,
        year: selectedKpiYear,
        score: scoreValue,
        addedBy: auth.currentUser ? auth.currentUser.uid : "admin",
        addedAt: serverTimestamp(),
      });

      await loadKpiData();
      setKpiScoreInput("");
      alert(`Saved KPI score for ${memberName} (${selectedKpiMonth} ${selectedKpiYear}).`);
    } catch (err) {
      console.error("Failed to save KPI score:", err);
      alert("Failed to save KPI score: " + (err?.message || err));
    } finally {
      setSavingKpiScore(false);
    }
  };

  const markAttendance = async (userId, dateStr, status) => {
    const key = `${userId}_${dateStr}`;
    try {
      if (!dateStr) {
        alert("Select a date first");
        return;
      }
      setSavingAttendanceKey(key);
      await setDoc(doc(db, "attendance", key), {
        userId,
        date: dateStr,
        status,
        markedAt: serverTimestamp()
      });
      setAttendanceData((prev) => ({ ...prev, [key]: status }));
    } catch (err) {
      alert("Failed to mark attendance: " + (err?.message || err));
    } finally {
      setSavingAttendanceKey("");
    }
  };

  const applyBulkAttendance = async () => {
    if (!bulkAttendanceDate) {
      alert("Please select a date first");
      return;
    }
    
    const actionLabel = ATTENDANCE_STATUS_CONFIG[bulkAttendanceAction]?.label || bulkAttendanceAction;
    const confirmed = window.confirm(
      `Are you sure you want to mark ALL employees as "${actionLabel}" for ${bulkAttendanceDate}?`
    );
    
    if (!confirmed) return;
    
    try {
      setApplyingBulkAttendance(true);
      const batch = writeBatch(db);
      let count = 0;
      
      users.forEach((user) => {
        const userId = user.uid || user.id;
        const key = `${userId}_${bulkAttendanceDate}`;
        const docRef = doc(db, "attendance", key);
        batch.set(docRef, {
          userId,
          date: bulkAttendanceDate,
          status: bulkAttendanceAction,
          markedAt: serverTimestamp(),
          bulkMarked: true
        });
        count++;
      });
      
      await batch.commit();
      
      // Update local state
      const updates = {};
      users.forEach((user) => {
        const userId = user.uid || user.id;
        const key = `${userId}_${bulkAttendanceDate}`;
        updates[key] = bulkAttendanceAction;
      });
      setAttendanceData((prev) => ({ ...prev, ...updates }));
      
      alert(`✓ Successfully marked ${count} employees as "${bulkAttendanceAction}" for ${bulkAttendanceDate}`);
      setBulkAttendanceDate("");
    } catch (err) {
      console.error("Bulk attendance error:", err);
      alert("Failed to apply bulk attendance: " + (err?.message || err));
    } finally {
      setApplyingBulkAttendance(false);
    }
  };

  const calculateAttendanceMetrics = useCallback((userId) => {
    const days = generateCalendarDays(currentMonth, currentYear);
    const workingDays = days.filter((d) => !d.isSunday && !d.holiday);
    const counts = {
      present: 0,
      outdoor: 0,
      shortLeave: 0,
      absent: 0,
      off: 0,
    };

    workingDays.forEach((day) => {
      const key = `${userId}_${day.fullDate}`;
      const status = attendanceData[key];
      if (status === "off") {
        counts.off += 1;
        return;
      }
      if (status === "present") {
        counts.present += 1;
        return;
      }
      if (status === "outdoor") {
        counts.outdoor += 1;
        return;
      }
      if (status === "shortLeave") {
        counts.shortLeave += 1;
        return;
      }
      if (status === "absent") {
        counts.absent += 1;
      }
    });

    const numerator = counts.present + counts.outdoor + counts.shortLeave * 0.8;
    const denominator = counts.present + counts.outdoor + counts.shortLeave + counts.absent;
    const percentage = denominator > 0 ? (numerator / denominator) * 100 : 0;

    return { ...counts, percentage };
  }, [attendanceData, currentMonth, currentYear, generateCalendarDays]);

  const calculateAttendancePercentage = useCallback((userId) => {
    return calculateAttendanceMetrics(userId).percentage;
  }, [calculateAttendanceMetrics]);

  const attendanceSummaries = useMemo(() => {
    return users.map((u) => {
      const uid = u.uid || u.id;
      const metrics = calculateAttendanceMetrics(uid);
      return {
        uid,
        name: u.name || u.email,
        present: metrics.present,
        outdoor: metrics.outdoor,
        shortLeave: metrics.shortLeave,
        absent: metrics.absent,
        off: metrics.off,
        percentage: metrics.percentage,
      };
    });
  }, [users, calculateAttendanceMetrics]);

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
      const d = employeeSnap.docs[0];
      employee = { id: d.id, ...(d.data() || {}) };
    }

    // ensure assignedTo is not undefined (Firestore rejects undefined fields)
    const assignedToVal = employee?.uid || employee?.id || null;
    const assignedEmailVal = employee?.email || assignedEmail || "";

    await addDoc(collection(db, "tasks"), {
      title,
      assignedTo: assignedToVal,
      assignedEmail: assignedEmailVal,
      assignedName: employee?.name || "",
      startDate: sDate,
      endDate: eDate,
      priority: priority, // new field
      createdAt: serverTimestamp(),
      status: "pending",
      actualStatus: "",
    });

    // optionally open mail compose to notify assigned user
    try {
      if (reminderOnAdd && typeof window !== 'undefined') {
        const to = employee.email || "";
        const subject = `New Task Assigned: ${title}`;
        const body = `Hello ${employee.name || ''},\n\nYou have been assigned a new task:\n\nTitle: ${title}\nStart: ${formatDate(sDate)}\nEnd: ${formatDate(eDate)}\nPriority: ${priority}\n\nPlease acknowledge this task.\n\nRegard\nQuality Manager\nShahid Ali`;
        const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(to)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(outlookUrl, "_blank");
      }
    } catch (e) {
      // ignore pop-up failures
    }
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
      // optimistically remove from local UI immediately so admin sees instant feedback
      setUsers((prev) => prev.filter((u) => (u.id !== userId && (u.uid ? u.uid !== userId : true))));
      setTasks((prev) => prev.filter((t) => t.assignedTo !== userId && t.assignedEmail !== userEmail));

      // also refetch users and tasks from Firestore to ensure UI reflects server state
      try {
        const [usersSnap, tasksSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'tasks')),
        ]);
        const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const tasksData = tasksSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setUsers(usersData);
        setTasks(tasksData);
      } catch (refetchErr) {
        console.error('Refetch after delete failed', refetchErr);
      }
    } catch (err) {
      console.error(err);
      alert('Delete failed: ' + (err.message || err));
    }
  };

  // 🔹 Edit user (name / email) without affecting tasks association
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserOldEmail, setEditUserOldEmail] = useState("");
  const [editing, setEditing] = useState(false);

  const openEditUser = (u) => {
    setEditUserId(u.uid || u.id);
    setEditUserName(u.name || "");
    setEditUserEmail(u.email || "");
    setEditUserOldEmail(u.email || "");
    setShowEditUserModal(true);
  };

  // Approve / reject handlers for statusRequests
  const approveRequest = async (req) => {
    try {
      if (!req || !req.taskId) throw new Error('Invalid request');
      // update task status
      await updateDoc(doc(db, 'tasks', req.taskId), { status: req.requestedStatus, adminApprovalNote: `Approved by ${auth.currentUser ? auth.currentUser.email : 'admin'} on ${new Date().toLocaleString()}` });
      // mark request resolved
      await updateDoc(doc(db, 'statusRequests', req.id), { status: 'approved', resolvedAt: serverTimestamp(), resolvedBy: auth.currentUser ? auth.currentUser.uid : null });
      alert('Request approved. Task status updated.');
    } catch (err) {
      console.error('Approve failed', err);
      alert('Approve failed: ' + (err.message || err));
    }
  };

  const rejectRequest = async (req) => {
    try {
      if (!req) throw new Error('Invalid request');
      await updateDoc(doc(db, 'statusRequests', req.id), { status: 'rejected', resolvedAt: serverTimestamp(), resolvedBy: auth.currentUser ? auth.currentUser.uid : null });
      alert('Request rejected.');
    } catch (err) {
      console.error('Reject failed', err);
      alert('Reject failed: ' + (err.message || err));
    }
  };

  const saveEditedUser = async (e) => {
    e && e.preventDefault && e.preventDefault();
    if (!editUserId) return;
    setEditing(true);
    try {
      // update user doc
      const userRef = doc(db, "users", editUserId);
      await updateDoc(userRef, { name: editUserName, email: editUserEmail });

      // update related tasks' assignedName/assignedEmail
      // 1) tasks where assignedTo == uid
      const tasksByUidSnap = await getDocs(query(collection(db, "tasks"), where("assignedTo", "==", editUserId)));
      // 2) tasks where assignedEmail == oldEmail
      const tasksByEmailSnap = editUserOldEmail ? await getDocs(query(collection(db, "tasks"), where("assignedEmail", "==", editUserOldEmail))) : { docs: [] };

      const batch = writeBatch(db);
      const touched = new Set();

      tasksByUidSnap.docs.forEach((d) => {
        touched.add(d.id);
        batch.update(d.ref, { assignedName: editUserName, assignedEmail: editUserEmail });
      });

      tasksByEmailSnap.docs.forEach((d) => {
        if (touched.has(d.id)) return;
        touched.add(d.id);
        batch.update(d.ref, { assignedName: editUserName, assignedEmail: editUserEmail });
      });

      await batch.commit();

      // optimistic UI updates
      setUsers((prev) => prev.map((u) => (u.id === editUserId ? { ...u, name: editUserName, email: editUserEmail } : u)));
      setTasks((prev) => prev.map((t) => (t.assignedTo === editUserId || t.assignedEmail === editUserOldEmail ? { ...t, assignedName: editUserName, assignedEmail: editUserEmail } : t)));

      setShowEditUserModal(false);
      alert('User updated successfully. Related tasks updated to reflect new name/email.');
    } catch (err) {
      console.error('Edit user failed', err);
      alert('Edit failed: ' + (err.message || err));
    } finally {
      setEditing(false);
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

  const calcAverage = (values) => {
    if (!values || values.length === 0) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  };

  const toOneDecimal = (value) => {
    if (!Number.isFinite(value)) return 0;
    return Number(value.toFixed(1));
  };

  const gradeFromTotal = (score) => {
    if (score > 90) return "A"; // totals above 90 (even 100+) should always be grade A
    if (score >= 81) return "B";
    return "C";
  };

  const gradeColorClass = (grade) => {
    if (grade === "A") return "text-green-600";
    if (grade === "B") return "text-yellow-600";
    return "text-red-600";
  };

  const formatOneDecimalString = (value) => toOneDecimal(value).toFixed(1);

  const employeeMembers = useMemo(() => (
    (users || []).filter((member) => (member.role || "employee").toLowerCase() === "employee")
  ), [users]);

  const selectedKpiMember = useMemo(() => (
    employeeMembers.find((member) => (member.uid || member.id || member.email) === selectedMemberForKpi) || null
  ), [employeeMembers, selectedMemberForKpi]);

  const selectedMemberKpiHistory = useMemo(() => {
    if (!selectedMemberForKpi) return [];
    return Object.values(kpiData || {})
      .filter((entry) => entry.userId === selectedMemberForKpi)
      .sort((a, b) => {
        const yearDiff = (Number(b.year) || 0) - (Number(a.year) || 0);
        if (yearDiff !== 0) return yearDiff;
        const monthA = KPI_MONTH_INDEX[a.month] ?? -1;
        const monthB = KPI_MONTH_INDEX[b.month] ?? -1;
        return monthB - monthA;
      });
  }, [selectedMemberForKpi, kpiData]);

  const selectedMemberAverageKpi = useMemo(() => {
    if (!selectedMemberKpiHistory.length) return 0;
    const scores = selectedMemberKpiHistory.map((entry) => Number(entry.score) || 0);
    return Math.round(calcAverage(scores));
  }, [selectedMemberKpiHistory]);

  const pendingKpiScoreKey = useMemo(() => {
    if (!selectedMemberForKpi || !selectedKpiMonth || !selectedKpiYear) return null;
    return `${selectedMemberForKpi}_${selectedKpiYear}_${selectedKpiMonth}`;
  }, [selectedMemberForKpi, selectedKpiMonth, selectedKpiYear]);

  const pendingKpiScoreExists = pendingKpiScoreKey ? kpiData[pendingKpiScoreKey] : null;

  const performanceFilteredTasks = useMemo(() => {
    if (!performanceStartDate && !performanceEndDate) return tasks;
    const startFilter = performanceStartDate ? normalizeToMidnight(performanceStartDate) : null;
    const endFilter = performanceEndDate ? normalizeToMidnight(performanceEndDate) : null;

    return tasks.filter((task) => {
      const start = normalizeToMidnight(toDateObj(task.startDate));
      const end = normalizeToMidnight(toDateObj(task.endDate));
      const comparisonDate = end || start;
      if (!comparisonDate) return false;
      if (startFilter && comparisonDate < startFilter) return false;
      if (endFilter && comparisonDate > endFilter) return false;
      return true;
    });
  }, [tasks, performanceStartDate, performanceEndDate]);

  // 🔹 Evaluation: aggregate weighted scores across modules
  const evaluation = useMemo(() => {
    const employees = (users || []).filter((u) => (u.role || "employee").toLowerCase() === "employee");
    if (employees.length === 0) return [];

    const kpiEntries = Object.values(kpiData || {});

    return employees
      .map((u) => {
        const userId = u.uid || u.id || u.email;
        const emailLower = (u.email || "").toLowerCase();

        const userTasks = (performanceFilteredTasks || []).filter((task) => {
          const assignedId = task.assignedTo || task.assignedToId || "";
          const assignedEmail = (task.assignedEmail || "").toLowerCase();
          const matchesId = assignedId && (
            assignedId === userId || assignedId === u.uid || assignedId === u.id
          );
          const matchesEmail = assignedEmail && emailLower && assignedEmail === emailLower;
          return matchesId || matchesEmail;
        });

        const completionCounts = userTasks.reduce(
          (acc, task) => {
            const status = canonicalStatus(task.status || task.actualStatus || "");
            if (status === "completed") acc.completed += 1;
            else if (status === "delayed") acc.delayed += 1;
            return acc;
          },
          { completed: 0, delayed: 0 }
        );
        const trackedTotal = completionCounts.completed + completionCounts.delayed;
        const completionPercentage = trackedTotal > 0
          ? (completionCounts.completed / trackedTotal) * 100
          : 0;
        const taskClosingWeighted = toOneDecimal((completionPercentage / 100) * 50);

        const qualityMarks = userTasks
          .map((task) => (typeof task.qualityMark === "number" ? task.qualityMark : null))
          .filter((mark) => typeof mark === "number");
        const qualityAverage = calcAverage(qualityMarks);
        const qualityWeighted = toOneDecimal((qualityAverage / 100) * 20);

        const attendancePercentage = calculateAttendancePercentage(userId);
        const attendanceWeighted = toOneDecimal((attendancePercentage / 100) * 15);

        const userKpis = kpiEntries.filter((entry) => {
          if (!entry || typeof entry !== "object") return false;
          if (entry.userId && userId && entry.userId === userId) return true;
          if (entry.userId && u.uid && entry.userId === u.uid) return true;
          if (entry.userEmail && emailLower && entry.userEmail.toLowerCase() === emailLower) return true;
          return false;
        });
        const kpiScores = userKpis.map((entry) => Number(entry.score) || 0);
        const kpiAverage = calcAverage(kpiScores);
        const kpiWeighted = toOneDecimal((kpiAverage / 100) * 15);

        const total = toOneDecimal(
          taskClosingWeighted + attendanceWeighted + qualityWeighted + kpiWeighted
        );
        const grade = gradeFromTotal(total);

        return {
          id: userId,
          name: u.name || u.displayName || u.email || "Member",
          email: u.email || "",
          taskClosing: { weighted: taskClosingWeighted, raw: toOneDecimal(completionPercentage) },
          attendance: { weighted: attendanceWeighted, percentage: toOneDecimal(attendancePercentage) },
          quality: { weighted: qualityWeighted, raw: toOneDecimal(qualityAverage) },
          kpi: { weighted: kpiWeighted, raw: toOneDecimal(kpiAverage) },
          total,
          grade,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, performanceFilteredTasks, kpiData, calculateAttendancePercentage]);

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

  const pieData = useMemo(() => {
    const counts = { completed: 0, "in process": 0, delayed: 0, cancelled: 0 };
    tasks.forEach((t) => {
      const s = canonicalStatus(t.status);
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      { name: 'Completed', value: counts.completed },
      { name: 'In process', value: counts['in process'] },
      { name: 'Delayed', value: counts.delayed },
      { name: 'Cancelled', value: counts.cancelled },
    ];
  }, [tasks]);

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
        const message = `Reminder: Task "${r.taskTitle}" is due in ${daysText}. Please complete it.\n\nRegard\nQuality Manager\nShahid Ali`;
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
    const body = `Dear team,\n\nYou have tasks to review:\n\n${bodies.join("")}\nPlease address them as appropriate.\n\nRegard\nQuality Manager\nShahid Ali`;
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
              <p className="mb-2 font-medium">Features</p>
              <div className="flex flex-col gap-2 mb-4">
                <button onClick={openTaskClosingPanel} className="text-sm px-3 py-2 rounded bg-white/6 hover:bg-white/10 text-left">Task closing</button>
                <button onClick={openAttendancePanel} className="text-sm px-3 py-2 rounded bg-white/6 hover:bg-white/10 text-left">Attendence</button>
                <button onClick={openQualityPanel} className="text-sm px-3 py-2 rounded bg-white/6 hover:bg-white/10 text-left">Quality of work</button>
                <button onClick={openKpiPanel} className="text-sm px-3 py-2 rounded bg-white/6 hover:bg-white/10 text-left">KPI</button>
              </div>
              <p className="mb-1">Quick Actions</p>
                <div className="flex flex-col gap-2">
                <button onClick={() => { setShowDeleteUsers((s) => !s); }} className="text-sm px-3 py-2 rounded bg-white/6">Toggle Delete Users</button>
                <button onClick={() => { setShowDeleteTasks((s) => !s); }} className="text-sm px-3 py-2 rounded bg-white/6">Toggle Delete Tasks</button>
                <button onClick={() => { setShowAddEmployeePanel((s) => !s); setShowAddTaskPanel(false); setShowBulkPanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Add Employee</button>
                <button onClick={() => { setShowAddTaskPanel((s) => !s); setShowAddEmployeePanel(false); setShowBulkPanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Add Task</button>
                <button onClick={() => { setShowBulkPanel((s) => !s); setShowAddTaskPanel(false); setShowAddEmployeePanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Bulk Add Tasks</button>
                <button onClick={() => { setShowBulkUserPanel((s) => !s); setShowBulkPanel(false); setShowAddTaskPanel(false); setShowAddEmployeePanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Bulk Add Users</button>
                <button onClick={() => { setShowApprovalsPanel((s) => !s); setShowBulkUserPanel(false); setShowBulkPanel(false); setShowAddTaskPanel(false); setShowAddEmployeePanel(false); }} className="text-sm px-3 py-2 rounded bg-white/6">Approvals</button>
              </div>
            </div>
          </div>

          <div className="pt-6">
            <div className="sidebar-divider" />
            <div className="flex items-center justify-between mt-3">
              <div className="text-sm text-white/90">{currentEmail ? currentEmail : "Admin"}</div>
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
                <h2 className="text-2xl md:text-3xl font-bold mb-2">{new Date().getHours() >= 12 ? 'Good Afternoon' : 'Good Morning'}</h2>
              </div>
            </div>
          )}

              {showApprovalsPanel && (
                <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
                  <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                    <div className="absolute right-3 top-3">
                      <button onClick={() => setShowApprovalsPanel(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                    </div>
                    <h2 className="text-xl font-semibold mb-4">🔔 Approval Requests</h2>
                    {approvals.length === 0 ? (
                      <p className="text-gray-500">No pending approval requests.</p>
                    ) : (
                      <div className="max-h-80 overflow-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-2 text-left">Member</th>
                              <th className="p-2 text-left">Task</th>
                              <th className="p-2 text-left">From</th>
                              <th className="p-2 text-left">To</th>
                              <th className="p-2 text-left">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {approvals.map((r) => (
                              <tr key={r.id} className="border-b hover:bg-white/50">
                                <td className="p-2">{r.requestedByName || r.requestedByEmail}</td>
                                <td className="p-2 text-sm">{r.taskTitle || r.taskId}</td>
                                <td className="p-2">{r.fromStatus}</td>
                                <td className="p-2">{r.requestedStatus}</td>
                                <td className="p-2">
                                  <div className="flex gap-2">
                                    <button onClick={() => approveRequest(r)} className="bg-green-600 text-white px-3 py-1 rounded text-sm">Approve</button>
                                    <button onClick={() => rejectRequest(r)} className="bg-red-100 text-red-700 px-3 py-1 rounded text-sm">Reject</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {showAttendancePanel && (
                <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down max-h-[90vh] overflow-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                    <div className="absolute right-3 top-3 flex gap-2">
                      <button onClick={closeAttendancePanel} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                    </div>
                    <h2 className="text-xl font-semibold mb-4">📅 Attendance Management</h2>
                    
                    <div className="flex gap-4 mb-4 items-center">
                      <button onClick={() => {
                        if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
                        else setCurrentMonth(currentMonth - 1);
                      }} className="px-3 py-1 bg-gray-100 rounded">← Prev</button>
                      <h3 className="text-lg font-bold">{new Date(currentYear, currentMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
                      <button onClick={() => {
                        if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
                        else setCurrentMonth(currentMonth + 1);
                      }} className="px-3 py-1 bg-gray-100 rounded">Next →</button>
                    </div>

                    {/* Smart Bulk Attendance System */}
                    <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200">
                      <h3 className="text-md font-bold mb-3 text-blue-900 flex items-center gap-2">
                        <span>⚡</span>
                        <span>Smart Bulk Attendance</span>
                      </h3>
                      <p className="text-xs text-gray-600 mb-3">Mark all employees' attendance at once for a selected date</p>
                      <div className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[200px]">
                          <label className="block text-sm font-semibold mb-1 text-gray-700">Select Date</label>
                          <input
                            type="date"
                            value={bulkAttendanceDate}
                            onChange={(e) => setBulkAttendanceDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                          />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <label className="block text-sm font-semibold mb-1 text-gray-700">Select Action</label>
                          <select
                            value={bulkAttendanceAction}
                            onChange={(e) => setBulkAttendanceAction(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                          >
                            <option value="present">Present</option>
                            <option value="absent">Absent</option>
                            <option value="off">Off</option>
                          </select>
                        </div>
                        <button
                          onClick={applyBulkAttendance}
                          disabled={applyingBulkAttendance || !bulkAttendanceDate}
                          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors duration-200 shadow-md hover:shadow-lg"
                        >
                          {applyingBulkAttendance ? (
                            <span className="flex items-center gap-2">
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Applying...</span>
                            </span>
                          ) : (
                            `Apply to All (${users.length} employees)`
                          )}
                        </button>
                      </div>
                      <div className="mt-3 text-xs text-gray-600">
                        <span className="font-semibold">Note:</span> This will mark attendance for all employees in the system. Individual employees can still be adjusted later.
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-semibold mb-1 text-gray-700">Mark attendance for date</label>
                      <input
                        type="date"
                        value={selectedAttendanceDate}
                        onChange={(e) => setSelectedAttendanceDate(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                      />
                    </div>

                    {!selectedAttendanceDate ? (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                        Select a date to start marking attendance for each team member.
                      </div>
                    ) : (
                      <div className="mb-6 overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-3 text-left">Employee</th>
                              <th className="p-3 text-left">Department</th>
                              <th className="p-3 text-left">Current Status</th>
                              <th className="p-3 text-left">Quick Mark</th>
                            </tr>
                          </thead>
                          <tbody>
                            {users.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-sm text-gray-500">No employees found. Add team members to start tracking attendance.</td>
                              </tr>
                            ) : (
                              users.map((member) => {
                                const userId = member.uid || member.id;
                                const statusKey = `${userId}_${selectedAttendanceDate}`;
                                const currentStatus = attendanceData[statusKey];
                                const isSaving = savingAttendanceKey === statusKey;
                                const statusConfig = ATTENDANCE_STATUS_CONFIG[currentStatus];
                                const statusStyles = statusConfig?.badgeClass || "bg-gray-100 text-gray-600";
                                const statusLabel = statusConfig?.label || (currentStatus ? currentStatus : "Not marked");
                                return (
                                  <tr key={userId} className="border-b hover:bg-gray-50">
                                    <td className="p-3 font-semibold text-gray-800">
                                      {member.name || member.displayName || member.email}
                                      <div className="text-xs text-gray-500">{member.email}</div>
                                    </td>
                                    <td className="p-3 text-gray-600 text-xs md:text-sm">{member.department || "-"}</td>
                                    <td className="p-3">
                                      {isSaving ? (
                                        <span className="text-xs text-gray-500">Updating...</span>
                                      ) : (
                                        <span className={`text-xs px-2 py-1 rounded ${statusStyles}`}>
                                          {statusLabel}
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-3">
                                      <div className="flex flex-wrap gap-2">
                                        {ATTENDANCE_STATUS_ORDER.map((statusKey) => {
                                          const optionConfig = ATTENDANCE_STATUS_CONFIG[statusKey];
                                          const isActive = currentStatus === statusKey;
                                          const activeClass = optionConfig?.button?.active || "bg-indigo-600 text-white";
                                          const inactiveClass = optionConfig?.button?.inactive || "bg-gray-100 text-gray-700 hover:bg-gray-200";
                                          return (
                                            <button
                                              key={statusKey}
                                              onClick={() => markAttendance(userId, selectedAttendanceDate, statusKey)}
                                              className={`text-xs px-3 py-1 rounded transition ${isActive ? activeClass : inactiveClass}`}
                                              disabled={isSaving}
                                            >
                                              {isSaving ? "Saving..." : (optionConfig?.label || statusKey)}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <div className="mt-8">
                      <h3 className="text-lg font-bold mb-2">Monthly Attendance Overview</h3>
                      {attendanceSummaries.length === 0 ? (
                        <div className="text-sm text-gray-500">No attendance records captured for this month yet.</div>
                      ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {attendanceSummaries.map((summary) => (
                            <div key={summary.uid} className="border rounded-lg p-4 bg-white shadow-sm">
                              <div>
                                <p className="font-semibold text-gray-800">{summary.name}</p>
                                <p className="text-xs text-gray-500">Monthly attendance summary</p>
                              </div>
                              <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500">Present</span>
                                  <span className="font-semibold text-gray-800">{summary.present}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500">Outdoor</span>
                                  <span className="font-semibold text-gray-800">{summary.outdoor}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500">Short leaves</span>
                                  <span className="font-semibold text-gray-800">{summary.shortLeave}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-500">Absents</span>
                                  <span className="font-semibold text-gray-800">{summary.absent}</span>
                                </div>
                              </div>
                              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                <span className="text-xs uppercase tracking-wide text-gray-500">Attendance %</span>
                                <span className="text-lg font-bold text-blue-600">{toOneDecimal(summary.percentage)}%</span>
                              </div>
                              {summary.off > 0 && (
                                <div className="mt-2 text-[11px] text-gray-400">Off days excluded: {summary.off}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* KPI Panel */}
              {showKpiPanel && (
                <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down max-h-[90vh] overflow-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                    <div className="absolute right-3 top-3 flex gap-2">
                      <button onClick={closeKpiPanel} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                    </div>
                    <h2 className="text-xl font-semibold mb-4">📊 KPI Management</h2>

                    <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-800">
                        <span className="font-semibold">Monthly KPI:</span> Record one score per member per month. Scores start at 0 and can exceed 100, contributing 15 marks per entry to the evaluation weighting.
                      </p>
                    </div>

                    <h3 className="text-lg font-bold mb-3">Select a Team Member</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {employeeMembers.length === 0 ? (
                        <div className="col-span-full text-sm text-gray-500">No employees found. Add team members to begin tracking KPI scores.</div>
                      ) : (
                        employeeMembers.map((member) => {
                          const userId = member.uid || member.id || member.email;
                          const memberEntries = Object.values(kpiData || {}).filter((entry) => entry.userId === userId);
                          const averageScore = memberEntries.length ? Math.round(calcAverage(memberEntries.map((entry) => Number(entry.score) || 0))) : 0;
                          const monthsTracked = memberEntries.length;
                          const isSelected = selectedMemberForKpi === userId;
                          const displayName = member.name || member.displayName || member.email || "Member";
                          return (
                            <button
                              key={userId}
                              type="button"
                              onClick={() => {
                                setSelectedMemberForKpi(userId);
                                setSelectedKpiMonth("");
                                setKpiScoreInput("");
                              }}
                              className={`border-2 rounded-lg p-4 text-left transition ${
                                isSelected
                                  ? "border-blue-500 bg-blue-50 shadow-md"
                                  : "border-transparent bg-gray-50 hover:border-blue-300 hover:bg-blue-50"
                              }`}
                            >
                              <div className="font-semibold text-gray-800">{displayName}</div>
                              <div className="text-xs text-gray-500">{member.department || "Department not set"}</div>
                              <div className="flex items-center justify-between mt-3 text-sm">
                                <span className="text-gray-600">Avg Score</span>
                                <span className="font-semibold text-blue-600">{averageScore}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                                <span>Months Recorded</span>
                                <span>{monthsTracked}</span>
                              </div>
                              {isSelected && <div className="mt-2 text-xs font-semibold text-blue-600">Selected</div>}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {selectedKpiMember ? (
                      <div className="grid lg:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="text-md font-semibold text-gray-800">{selectedKpiMember.name || selectedKpiMember.displayName || selectedKpiMember.email}</h4>
                            <p className="text-xs text-gray-500 mt-1">Overall average KPI: <span className="font-semibold text-blue-600">{selectedMemberAverageKpi}</span></p>
                            <p className="text-xs text-gray-500">Recorded months: <span className="font-semibold text-gray-700">{selectedMemberKpiHistory.length}</span></p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm font-semibold mb-2">Month</label>
                              <select
                                value={selectedKpiMonth}
                                onChange={(e) => setSelectedKpiMonth(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="">-- Select Month --</option>
                                {KPI_MONTHS.map((month) => (
                                  <option key={month} value={month}>{month}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-2">Year</label>
                              <select
                                value={selectedKpiYear}
                                onChange={(e) => setSelectedKpiYear(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                {["2024", "2025", "2026", "2027"].map((yearOption) => (
                                  <option key={yearOption} value={yearOption}>{yearOption}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold mb-2">Score (0 or higher)</label>
                              <input
                                type="number"
                                min="0"
                                value={kpiScoreInput}
                                onChange={(e) => setKpiScoreInput(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                placeholder="e.g. 120"
                              />
                            </div>
                          </div>

                          {pendingKpiScoreExists && (
                            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                              A KPI score already exists for {selectedKpiMonth} {selectedKpiYear}. Please choose a different month.
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              onClick={saveKpiScore}
                              disabled={savingKpiScore || !selectedKpiMonth || !kpiScoreInput || !!pendingKpiScoreExists}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                            >
                              {savingKpiScore ? "Saving..." : "Save KPI Score"}
                            </button>
                          </div>
                        </div>

                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                          <h4 className="text-md font-semibold mb-3">Recorded KPI Scores</h4>
                          {selectedMemberKpiHistory.length === 0 ? (
                            <p className="text-sm text-gray-500">No KPI scores recorded yet for this member.</p>
                          ) : (
                            <div className="max-h-64 overflow-auto">
                              <table className="min-w-full text-sm">
                                <thead>
                                  <tr className="bg-gray-100 text-left text-xs uppercase text-gray-500">
                                    <th className="p-2">Month</th>
                                    <th className="p-2">Score</th>
                                    <th className="p-2">Weighted (15)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedMemberKpiHistory.map((entry) => (
                                    <tr key={entry.id} className="border-b">
                                      <td className="p-2 text-gray-700">{entry.month} {entry.year}</td>
                                      <td className="p-2 text-gray-700">{entry.score}</td>
                                      <td className="p-2 text-gray-500">{(((Number(entry.score) || 0) / 100) * 15).toFixed(1)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500">Select a member above to record a KPI score.</div>
                    )}
                  </div>
                </div>
              )}

                {showTaskClosingPanel && (
                  <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
                    <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                      <div className="absolute right-3 top-3 flex gap-2">
                        <button onClick={closeTaskClosingPanel} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                      </div>
                      <h2 className="text-xl font-semibold mb-4">📊 Task Completion Tracking (Completed & Delayed)</h2>
                      <div className="grid gap-4 md:grid-cols-3 mb-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-semibold mb-1">Filter by member</label>
                          <select
                            value={selectedMemberForClosing}
                            onChange={(e) => setSelectedMemberForClosing(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          >
                            <option value="">All members</option>
                            {users.map((u) => (
                              <option key={u.uid || u.id || u.email} value={u.uid || u.id || u.email}>
                                {u.name || u.email || u.uid || u.id}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                          <p className="text-sm text-indigo-700">
                            <strong>How totals are calculated:</strong> For each person we track tasks marked as <em>completed</em> or <em>delayed</em> from the All Tasks list.
                            Completion % = (Completed ÷ (Completed + Delayed)) × 100. Use this panel to mark closing scores (0-100) for quality review.
                          </p>
                        </div>
                      </div>

                      {selectedMemberSummary && (
                        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{selectedMemberSummary.name}</p>
                            <p className="text-sm text-blue-700">
                              Completion rate: {selectedMemberSummary.completionRate}% ({selectedMemberSummary.completedCount}/{selectedMemberSummary.totalCount} tasks) · Delayed: {selectedMemberSummary.delayedCount}
                              <span className="block text-xs text-blue-600 mt-1">
                                Closing marks recorded: {selectedMemberSummary.markedCount} task(s)
                                {selectedMemberSummary.denom > 0 ? ` — Sum ${selectedMemberSummary.sum} / ${selectedMemberSummary.denom}` : ""}
                              </span>
                            </p>
                          </div>
                          <button onClick={() => setSelectedMemberForClosing("")} className="text-sm px-3 py-1 rounded bg-white border border-blue-200 hover:bg-blue-100">Clear</button>
                        </div>
                      )}

                      {!selectedMemberForClosing && (
                        <div className="mb-6">
                          <h3 className="text-lg font-bold mb-2">Members — Task Completion Percentage</h3>
                          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {memberSummaries.map((m) => (
                              <div
                                key={m.idOrEmail}
                                onClick={() => setSelectedMemberForClosing(m.idOrEmail)}
                                className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold">{m.name}</p>
                                    <p className="text-xs text-green-600">Completed: {m.tasksCompleted}</p>
                                    <p className="text-xs text-red-600">Delayed: {m.tasksDelayed}</p>
                                    <p className="text-xs text-gray-600 font-medium">Total: {m.totalTasks}</p>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-2xl font-bold text-indigo-600">{m.totalOutOf100}%</div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedMemberForClosing(m.idOrEmail); }}
                                      className="mt-1 text-xs text-indigo-700 hover:underline"
                                    >
                                      Details
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-2 text-left">Title</th>
                              <th className="p-2 text-left">Assigned</th>
                              <th className="p-2 text-left">Status</th>
                              <th className="p-2 text-left">Mark (0-100)</th>
                              <th className="p-2 text-left">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {completedTasks
                              .filter((t) => !selectedMemberForClosing || t.assignedTo === selectedMemberForClosing || t.assignedEmail === selectedMemberForClosing)
                              .map((task) => (
                                <tr key={task.id} className="border-b">
                                  <td className="p-2">{task.title}</td>
                                  <td className="p-2">{memberNameByTask(task)}</td>
                                  <td className="p-2">
                                    {(() => {
                                      const status = canonicalStatus(task.status || task.actualStatus || "");
                                      const isCompleted = status === "completed";
                                      const badgeClass = isCompleted ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700";
                                      return <span className={`text-xs px-2 py-1 rounded ${badgeClass}`}>{status}</span>;
                                    })()}
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={(marksDraft[task.id] ?? task.closingMark ?? "")}
                                      onChange={(e) => setMarksDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                                      placeholder="0-100"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <button
                                      onClick={() => saveTaskMark(task.id, marksDraft[task.id] ?? task.closingMark ?? 0)}
                                      className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs"
                                      disabled={savingMarkTaskId === task.id}
                                    >
                                      {savingMarkTaskId === task.id ? "Saving..." : "Save"}
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                        {completedTasks.filter((t) => !selectedMemberForClosing || t.assignedTo === selectedMemberForClosing || t.assignedEmail === selectedMemberForClosing).length === 0 && (
                          <p className="p-4 text-center text-gray-500">No completed or delayed tasks for this selection</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              {/* Quality of Work Panel */}
              {showQualityPanel && (
                <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down max-h-[90vh] overflow-auto">
                  <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                    <div className="absolute right-3 top-3 flex gap-2">
                      <button onClick={closeQualityPanel} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                    </div>
                    <h2 className="text-xl font-semibold mb-4">⭐ Quality of Work Assessment</h2>
                    
                    {!selectedMemberForQuality ? (
                      <div>
                        <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm text-blue-800">
                            <span className="font-semibold">Note:</span> Each member's total score is normalized to 100 marks, regardless of the number of completed tasks.
                          </p>
                        </div>
                        
                        <h3 className="text-lg font-bold mb-3">📊 Members Quality Score (Out of 100)</h3>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {qualitySummaries.map((m) => (
                            <div
                              key={m.idOrEmail}
                              onClick={() => setSelectedMemberForQuality(m.idOrEmail)}
                              className="border-2 rounded-lg p-4 cursor-pointer hover:bg-blue-50 hover:border-blue-400 transition-all duration-200 shadow-sm hover:shadow-md"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex-1">
                                  <p className="font-semibold text-gray-800">{m.name}</p>
                                  <p className="text-xs text-gray-500">Completed Tasks: {m.tasksCompleted}</p>
                                </div>
                                <div className="text-right">
                                  <div className="text-3xl font-bold text-indigo-600">{m.totalOutOf100}</div>
                                  <p className="text-xs text-gray-500">/ 100</p>
                                </div>
                              </div>
                              <div className="mt-2">
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${m.totalOutOf100}%` }}
                                  ></div>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelectedMemberForQuality(m.idOrEmail); }}
                                className="mt-3 w-full text-xs text-indigo-700 hover:text-indigo-900 font-semibold bg-indigo-50 hover:bg-indigo-100 py-2 rounded"
                              >
                                View Details & Mark Tasks →
                              </button>
                            </div>
                          ))}
                        </div>
                        {qualitySummaries.length === 0 && (
                          <p className="text-center text-gray-500 py-8">No completed tasks available for quality assessment</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        {(() => {
                          const memberData = qualitySummaries.find(m => m.idOrEmail === selectedMemberForQuality);
                          const memberTasks = completedTasks.filter(
                            (t) => t.assignedTo === selectedMemberForQuality || t.assignedEmail === selectedMemberForQuality
                          );
                          const completedOnly = memberTasks.filter((t) => canonicalStatus(t.status || t.actualStatus || "") === "completed");
                          const markedTasks = completedOnly.filter(t => typeof t.qualityMark === 'number');
                          const totalMarks = markedTasks.reduce((sum, t) => sum + (t.qualityMark || 0), 0);
                          const avgMark = markedTasks.length > 0 ? (totalMarks / markedTasks.length).toFixed(1) : 0;
                          
                          return (
                            <>
                              <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <h3 className="text-xl font-bold text-gray-800">{memberData?.name || 'Member'}</h3>
                                    <div className="flex gap-4 mt-2 text-sm">
                                      <p className="text-gray-600">Completed Tasks: <span className="font-semibold text-gray-800">{completedOnly.length}</span></p>
                                      <p className="text-gray-600">Marked Tasks: <span className="font-semibold text-gray-800">{markedTasks.length}</span></p>
                                      <p className="text-gray-600">Average Score: <span className="font-semibold text-gray-800">{avgMark}/100</span></p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-gray-600 mb-1">Quality Score</p>
                                    <div className="text-4xl font-bold text-indigo-600">{memberData?.totalOutOf100 || 0}</div>
                                    <p className="text-sm text-gray-500">/ 100</p>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <div className="w-full bg-gray-200 rounded-full h-3">
                                    <div 
                                      className="bg-gradient-to-r from-indigo-500 to-purple-600 h-3 rounded-full transition-all duration-500"
                                      style={{ width: `${memberData?.totalOutOf100 || 0}%` }}
                                    ></div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => {
                                    setSelectedMemberForQuality('');
                                    setQualityMarksDraft({});
                                    setSavingQualityMarkTaskId("");
                                  }} 
                                  className="mt-3 text-sm text-indigo-700 hover:text-indigo-900 font-semibold flex items-center gap-1"
                                >
                                  ← Back to Members List
                                </button>
                              </div>

                              <h3 className="text-lg font-bold mb-3">📝 Completed Tasks</h3>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm border rounded-lg">
                                  <thead>
                                    <tr className="bg-gradient-to-r from-indigo-100 to-purple-100">
                                      <th className="p-3 text-left font-semibold">Task Title</th>
                                      <th className="p-3 text-left font-semibold">Start Date</th>
                                      <th className="p-3 text-left font-semibold">End Date</th>
                                      <th className="p-3 text-left font-semibold">Priority</th>
                                      <th className="p-3 text-left font-semibold">Status</th>
                                      <th className="p-3 text-left font-semibold">Mark (0-100)</th>
                                      <th className="p-3 text-left font-semibold">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {memberTasks.map((task, idx) => (
                                      <tr key={task.id} className={`border-b hover:bg-gray-50 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                        <td className="p-3">
                                          <div className="font-medium text-gray-800">{task.title}</div>
                                          {task.description && (
                                            <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">{task.description}</div>
                                          )}
                                        </td>
                                        <td className="p-3 text-gray-600">
                                          {task.startDate ? new Date(task.startDate).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-3 text-gray-600">
                                          {task.endDate ? new Date(task.endDate).toLocaleDateString() : '-'}
                                        </td>
                                        <td className="p-3">
                                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                            task.priority === 'high' ? 'bg-red-100 text-red-700' :
                                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                            'bg-green-100 text-green-700'
                                          }`}>
                                            {task.priority || 'medium'}
                                          </span>
                                        </td>
                                        <td className="p-3">
                                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">
                                            completed
                                          </span>
                                        </td>
                                        <td className="p-3">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            value={(qualityMarksDraft[task.id] ?? task.qualityMark ?? "")}
                                            onChange={(e) => setQualityMarksDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                            className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                                            placeholder="0-100"
                                          />
                                        </td>
                                        <td className="p-3">
                                          <button
                                            onClick={() => saveQualityMark(task.id, qualityMarksDraft[task.id] ?? task.qualityMark ?? 0)}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3 py-1.5 rounded transition-colors duration-200"
                                            disabled={savingQualityMarkTaskId === task.id}
                                          >
                                            {savingQualityMarkTaskId === task.id ? "Saving..." : "Save"}
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {memberTasks.length === 0 && (
                                  <p className="p-6 text-center text-gray-500">No completed tasks found for this member</p>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
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
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreviewRows.map((r, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{r.title}</td>
                          <td className="p-2">{r.startDate || '-'}</td>
                          <td className="p-2">{r.endDate || '-'}</td>
                          <td className="p-2 capitalize">{r.status || 'pending'}</td>
                          <td className="p-2 capitalize">{r.priority}</td>
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
                        status: sanitizeInlineStatus(r.status || 'pending'),
                        actualStatus: r.actualStatus || '',
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
                      closeBulkPanel();
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
                    <div className="flex items-center gap-3">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={reminderOnAdd} onChange={(e) => setReminderOnAdd(e.target.checked)} />
                        <span className="text-sm text-gray-600">Open reminder email after add</span>
                      </label>
                      <button className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">Add Task</button>
                    </div>
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
                  <button onClick={closeBulkPanel} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                </div>
                <h2 className="text-xl font-semibold mb-4">📥 Bulk Add Tasks</h2>

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
                  <label className="text-sm font-semibold text-gray-700">Choose entry mode</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleBulkEntryModeChange('file')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold ${bulkEntryMode === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >
                      Upload file
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkEntryModeChange('sheet')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold ${bulkEntryMode === 'sheet' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >
                      Inline sheet (no Excel)
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Select “Inline sheet” to paste tasks directly once a member is chosen.</p>
                </div>

                {bulkEntryMode === 'file' ? (
                  <>
                    <div className="mb-4">
                      <label className="text-sm text-gray-600">Upload file (.csv or .xlsx)</label>
                      <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setBulkFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="mt-2" />
                      <div className="text-xs text-gray-500 mt-2">
                        File must have headers: <code>title</code>, <code>startDate</code>, <code>endDate</code>. Columns <code>priority</code> & <code>status</code> are optional.
                      </div>
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
                            const rawStatus = norm['status'] || norm['taskstatus'] || '';
                            const rawPr = (norm['priority'] || '').toString();
                            const startDateVal = normalizeDateInputString(sdRaw) || (sdRaw || null);
                            const endDateVal = normalizeDateInputString(edRaw) || (edRaw || null);
                            return {
                              title: titleVal,
                              startDate: startDateVal,
                              endDate: endDateVal,
                              priority: sanitizeInlinePriority(rawPr),
                              status: sanitizeInlineStatus(rawStatus),
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

                      <button type="button" onClick={closeBulkPanel} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    {(!bulkAssignedUserId && !bulkAssignedEmail) ? (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                        Select a member or enter an email to unlock the paste-ready sheet.
                      </div>
                    ) : (
                      <>
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-800">
                          Paste rows from any spreadsheet (Title, Start Date, End Date, Status, Priority) or type directly into the grid below. Status accepts Pending, In process, Completed, Delayed or Cancelled.
                        </div>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="bg-gray-100 text-left">
                                <th className="p-2 text-xs text-gray-500">#</th>
                                <th className="p-2">Task title</th>
                                <th className="p-2">Start</th>
                                <th className="p-2">End</th>
                                <th className="p-2">Status</th>
                                <th className="p-2">Priority</th>
                                <th className="p-2 text-right">Remove</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inlineBulkRows.map((row, idx) => (
                                <tr key={row.id} className="border-b">
                                  <td className="p-2 text-xs text-gray-500">{idx + 1}</td>
                                  <td className="p-2">
                                    <input
                                      type="text"
                                      value={row.title}
                                      onChange={(e) => updateInlineRow(row.id, 'title', e.target.value)}
                                      placeholder="Task title"
                                      className="w-full border rounded px-2 py-1"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="date"
                                      value={row.startDate}
                                      onChange={(e) => updateInlineRow(row.id, 'startDate', e.target.value)}
                                      className="w-full border rounded px-2 py-1"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <input
                                      type="date"
                                      value={row.endDate}
                                      onChange={(e) => updateInlineRow(row.id, 'endDate', e.target.value)}
                                      className="w-full border rounded px-2 py-1"
                                    />
                                  </td>
                                  <td className="p-2">
                                    <select
                                      value={row.status}
                                      onChange={(e) => updateInlineRow(row.id, 'status', e.target.value)}
                                      className="w-full border rounded px-2 py-1"
                                    >
                                      {INLINE_STATUS_OPTIONS.map((status) => (
                                        <option key={status} value={status}>
                                          {status.replace(/\b\w/g, (char) => char.toUpperCase())}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    <select
                                      value={row.priority}
                                      onChange={(e) => updateInlineRow(row.id, 'priority', e.target.value)}
                                      className="w-full border rounded px-2 py-1"
                                    >
                                      {INLINE_PRIORITY_OPTIONS.map((priorityOpt) => (
                                        <option key={priorityOpt} value={priorityOpt}>
                                          {priorityOpt.charAt(0).toUpperCase() + priorityOpt.slice(1)}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="p-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => removeInlineRow(row.id)}
                                      disabled={inlineBulkRows.length === 1}
                                      className="text-xs px-3 py-1 rounded bg-red-50 text-red-600 disabled:opacity-40"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => addInlineRows(1)} className="px-3 py-1 rounded bg-gray-100 text-sm">+ Add row</button>
                          <button type="button" onClick={() => addInlineRows(5)} className="px-3 py-1 rounded bg-gray-100 text-sm">+ Add 5 rows</button>
                          <button type="button" onClick={resetInlineSheet} className="px-3 py-1 rounded bg-gray-100 text-sm">Clear sheet</button>
                        </div>
                        <div>
                          <label className="text-sm text-gray-600">Paste rows (Title, Start, End, Status, Priority)</label>
                          <textarea
                            rows={4}
                            value={inlinePasteValue}
                            onChange={(e) => setInlinePasteValue(e.target.value)}
                            placeholder="Task A\t2025-01-01\t2025-01-15\tPending\tHigh"
                            className="w-full border rounded px-3 py-2 text-sm mt-2"
                          ></textarea>
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              type="button"
                              onClick={handleInlinePasteApply}
                              disabled={!inlinePasteValue.trim()}
                              className="px-4 py-2 rounded text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40"
                            >
                              Fill sheet from paste
                            </button>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={closeBulkPanel} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                          <button type="button" onClick={handleInlinePreview} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">Save & Preview</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

            {/* Edit User Modal */}
            {showEditUserModal && (
              <div className="fixed left-72 right-6 top-6 z-50 animate-slide-down">
                <div className="bg-white p-6 rounded-2xl shadow-lg relative">
                  <div className="absolute right-3 top-3">
                    <button onClick={() => setShowEditUserModal(false)} className="text-sm px-3 py-1 rounded bg-gray-100">Close</button>
                  </div>
                  <h2 className="text-xl font-semibold mb-4">✏️ Edit Member</h2>
                  <form onSubmit={saveEditedUser}>
                    <input type="text" placeholder="Name" className="border p-2 w-full mb-3 rounded" value={editUserName} onChange={(e) => setEditUserName(e.target.value)} required />
                    <input type="email" placeholder="Email" className="border p-2 w-full mb-3 rounded" value={editUserEmail} onChange={(e) => setEditUserEmail(e.target.value)} required />
                    <div className="flex gap-3">
                      <button disabled={editing} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded">Save</button>
                      <button type="button" onClick={() => setShowEditUserModal(false)} className="bg-gray-100 px-4 py-2 rounded">Cancel</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">Note: Editing will update the member's name/email in Firestore and will update associated tasks' displayed name/email. This will not delete tasks or modify Auth accounts.</p>
                  </form>
                </div>
              </div>
            )}

      {/* 1) Evaluation + Analytics */}
      {activeView === "progress" && (
        <div className="bg-white p-6 rounded-2xl shadow-md mb-6 transition-all duration-300 ease-in-out transform">
          <h2 className="text-xl font-semibold mb-4">📊 Employee Performance Overview</h2>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-600">Start date</label>
              <input
                type="date"
                value={performanceStartDate}
                onChange={(e) => setPerformanceStartDate(e.target.value)}
                max={performanceEndDate || undefined}
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-sm font-semibold text-gray-600">End date</label>
              <input
                type="date"
                value={performanceEndDate}
                onChange={(e) => setPerformanceEndDate(e.target.value)}
                min={performanceStartDate || undefined}
                className="border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setPerformanceStartDate("");
                setPerformanceEndDate("");
              }}
              disabled={!performanceStartDate && !performanceEndDate}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Clear filters
            </button>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border mb-4">
          <h3 className="text-lg font-semibold mb-2">Evaluation</h3>
          <div className="text-xs text-gray-500 mb-3">
            Grades: A (91 and above), B (81-90), C (80 and below). Any total above 90 — even if KPI bonuses push it past 100 — is treated as grade A.
          </div>

            <div className="max-h-64 overflow-auto mb-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-white sticky top-0 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">
                      <div>Task Closing</div>
                      <div className="text-[10px] font-normal normal-case text-gray-400">(marks out of 50 weightage)</div>
                    </th>
                    <th className="p-3 text-left">
                      <div>Attendance</div>
                      <div className="text-[10px] font-normal normal-case text-gray-400">(marks out of 15 weightage)</div>
                    </th>
                    <th className="p-3 text-left">
                      <div>Quality</div>
                      <div className="text-[10px] font-normal normal-case text-gray-400">(marks out of 20 weightage)</div>
                    </th>
                    <th className="p-3 text-left">
                      <div>KPI</div>
                    </th>
                    <th className="p-3 text-left">
                      <div>Total</div>
                    </th>
                    <th className="p-3 text-left">
                      <div>Grade</div>
                      <div className="text-[10px] font-normal normal-case text-gray-400">(new scale)</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="p-3 text-gray-500 text-sm">No employees available yet.</td>
                    </tr>
                  ) : (
                    evaluation.map((e) => (
                      <tr key={e.id} className="border-b hover:bg-white/50">
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{e.name}</div>
                          {e.email && <div className="text-xs text-gray-500">{e.email}</div>}
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{formatOneDecimalString(e.taskClosing.weighted)} / 50</div>
                          <div className="text-xs text-gray-500">Avg {formatOneDecimalString(e.taskClosing.raw)}%</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{formatOneDecimalString(e.attendance.weighted)} / 15</div>
                          <div className="text-xs text-gray-500">Presence {formatOneDecimalString(e.attendance.percentage)}%</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{formatOneDecimalString(e.quality.weighted)} / 20</div>
                          <div className="text-xs text-gray-500">Avg {formatOneDecimalString(e.quality.raw)}%</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{formatOneDecimalString(e.kpi.weighted)} / 15</div>
                          <div className="text-xs text-gray-500">Total Avg {formatOneDecimalString(e.kpi.raw)}%</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-semibold text-gray-800">{formatOneDecimalString(e.total)}</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className={`text-sm font-semibold ${gradeColorClass(e.grade)}`}>{e.grade}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-gray-500">Weights: Task Closing 50, Attendance 15, Quality 20, KPI 15 per recorded score (totals can exceed 100 when multiple KPI scores are present).</div>
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <DashboardAnalytics tasks={filteredTasksForGraph} />
              </div>
              <div className="flex flex-col bg-white p-3 rounded h-full">
                <h5 className="text-sm font-semibold mb-2">Overall Status Distribution</h5>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie dataKey="value" data={pieData} innerRadius={40} outerRadius={60} paddingAngle={2} label={({ name, percent }) => `${name} (${Math.round(percent*100)}%)`}>
                        {pieData.map((entry, idx) => (
                          <Cell key={`cell-${idx}`} fill={["#10B981", "#F59E0B", "#EF4444", "#6B7280"][idx % 4]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Fill below the pie chart with recent task details so space is not empty */}
                <div className="mt-3 overflow-auto">
                  <h6 className="text-xs text-gray-500 mb-2">Recent Tasks</h6>
                  <div className="space-y-2">
                    {tasks.slice(0,6).map((t) => (
                      <div key={t.id} className="p-2 border rounded text-sm">
                        <div className="font-medium">{t.title}</div>
                        <div className="text-xs text-gray-500">{t.assignedName || t.assignedEmail} • {formatDate(t.endDate)}</div>
                      </div>
                    ))}
                    {tasks.length === 0 && <div className="text-xs text-gray-500">No tasks</div>}
                  </div>
                </div>
              </div>
            </div>
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
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEditUser(u)} className="text-sm bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded">Edit</button>
                          <button onClick={() => deleteUser(u.uid || u.id, u.name || u.email, u.email)} className="text-sm bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded">Delete</button>
                        </div>
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
              <div className="flex items-center gap-2">
                <label className="text-sm"><input type="checkbox" checked={selectedStatuses.has('all')} onChange={() => {
                  // toggle all
                  setSelectedStatuses(new Set(['all']));
                }} /> <span className="ml-2">All</span></label>
                <label className="text-sm"><input type="checkbox" checked={selectedStatuses.has('completed')} onChange={() => {
                  setSelectedStatuses((prev) => {
                    const ns = new Set(prev);
                    if (ns.has('all')) ns.delete('all');
                    if (ns.has('completed')) ns.delete('completed'); else ns.add('completed');
                    if (ns.size === 0) ns.add('all');
                    return ns;
                  });
                }} /> <span className="ml-2">Completed</span></label>
                <label className="text-sm"><input type="checkbox" checked={selectedStatuses.has('in process')} onChange={() => {
                  setSelectedStatuses((prev) => {
                    const ns = new Set(prev);
                    if (ns.has('all')) ns.delete('all');
                    if (ns.has('in process')) ns.delete('in process'); else ns.add('in process');
                    if (ns.size === 0) ns.add('all');
                    return ns;
                  });
                }} /> <span className="ml-2">In process</span></label>
                <label className="text-sm"><input type="checkbox" checked={selectedStatuses.has('delayed')} onChange={() => {
                  setSelectedStatuses((prev) => {
                    const ns = new Set(prev);
                    if (ns.has('all')) ns.delete('all');
                    if (ns.has('delayed')) ns.delete('delayed'); else ns.add('delayed');
                    if (ns.size === 0) ns.add('all');
                    return ns;
                  });
                }} /> <span className="ml-2">Delayed</span></label>
                <label className="text-sm"><input type="checkbox" checked={selectedStatuses.has('cancelled')} onChange={() => {
                  setSelectedStatuses((prev) => {
                    const ns = new Set(prev);
                    if (ns.has('all')) ns.delete('all');
                    if (ns.has('cancelled')) ns.delete('cancelled'); else ns.add('cancelled');
                    if (ns.size === 0) ns.add('all');
                    return ns;
                  });
                }} /> <span className="ml-2">Cancelled</span></label>
              </div>
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
              const statusMatch = (selectedStatuses.has('all')) || selectedStatuses.has(canonicalStatus(task.status));
              return nameMatch && statusMatch;
            });

            if (filtered.length === 0) return <p className="text-gray-500">No tasks found.</p>;

            return (
              <div className="divide-y">
                {filtered.map((task) => {
                  const normalizedStatus = canonicalStatus(task.status);
                  const draftQualityValue = Object.prototype.hasOwnProperty.call(qualityMarksDraft, task.id)
                    ? qualityMarksDraft[task.id]
                    : (typeof task.qualityMark === "number" ? task.qualityMark : "");
                  const savedQualityValue = typeof task.qualityMark === "number" ? task.qualityMark : null;
                  const disableQuickSave = draftQualityValue === "" || draftQualityValue === null || draftQualityValue === undefined || savingQualityMarkTaskId === task.id;

                  return (
                    <div key={task.id} className="py-4">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-center items-start gap-4">
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
                            <select value={normalizedStatus} onChange={(e) => updateTaskStatus(task.id, e.target.value)} className={`border p-2 rounded text-sm ${statusClass(task.status)}`}>
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

                      {normalizedStatus === "completed" && (
                        <div className="w-full mt-3 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-indigo-900">Quality of Work Shortcut</p>
                              <p className="text-xs text-indigo-700 mt-1">
                                Record the quality score here to update the Quality of Work evaluation without leaving the All Tasks view.
                              </p>
                              {savedQualityValue !== null && (
                                <p className="text-xs text-indigo-700 mt-1">Saved score: {savedQualityValue}/100</p>
                              )}
                              {savedQualityValue === null && (
                                <span className="inline-flex items-center text-xs text-white bg-indigo-500 px-2 py-0.5 rounded-full mt-2">Pending quality score</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={draftQualityValue === undefined || draftQualityValue === null ? "" : draftQualityValue}
                                onChange={(e) => setQualityMarksDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                                className="w-24 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                placeholder="0-100"
                              />
                              <button
                                onClick={() => saveQualityMark(task.id, draftQualityValue)}
                                disabled={disableQuickSave}
                                className={`px-4 py-2 text-sm font-semibold rounded-lg ${disableQuickSave ? "bg-gray-300 text-gray-600 cursor-not-allowed" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}
                              >
                                {savingQualityMarkTaskId === task.id ? "Saving..." : "Save score"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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