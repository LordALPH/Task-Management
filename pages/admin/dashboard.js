import { useState, useEffect, useRef } from "react";
import { tasksService, usersService, activityLogsService, kpiService } from "../../lib/firebaseService";
import { useAuthContext } from "../../context/AuthContext";

export default function AdminDashboard() {
  const { user, isAdmin } = useAuthContext();
  
  const [stats, setStats] = useState({
    totalTasks: 0,
    totalUsers: 0,
    completedTasks: 0,
    pendingTasks: 0,
  });
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  // Task closing feature state
  const [showTaskClosing, setShowTaskClosing] = useState(false);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [savingMarkTaskId, setSavingMarkTaskId] = useState("");
  const [marksDraft, setMarksDraft] = useState({});
  
  // KPI feature state
  const [showKPI, setShowKPI] = useState(false);
  const [kpiData, setKpiData] = useState({});
  const [selectedKPIMonth, setSelectedKPIMonth] = useState("");
  const [selectedKPIYear, setSelectedKPIYear] = useState("2024");
  const [kpiScores, setKpiScores] = useState({});
  const [savingKPI, setSavingKPI] = useState(false);
  const kpiSectionRef = useRef(null);
  
  // Task form state
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "pending",
    assignedTo: "",
  });
  
  // User form state
  const [showAddUser, setShowAddUser] = useState(false);
  const [userForm, setUserForm] = useState({
    email: "",
    displayName: "",
    role: "employee",
    department: "",
    phone: "",
  });

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (showKPI) {
      loadKPIData();
      setTimeout(() => {
        if (kpiSectionRef.current) {
          kpiSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 150);
    }
  }, [showKPI]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [tasksData, usersData, logsData] = await Promise.all([
        tasksService.getAllTasks(),
        usersService.getAllUsers(),
        activityLogsService.getActivityLogs(50),
      ]);

      setTasks(tasksData);
      setUsers(usersData);
      setLogs(logsData);

      const completed = tasksData.filter((t) => t.status === "completed").length;
      const pending = tasksData.filter((t) => t.status === "pending").length;

      setStats({
        totalTasks: tasksData.length,
        totalUsers: usersData.length,
        completedTasks: completed,
        pendingTasks: pending,
      });
      // Keep completed tasks list in sync if feature is open
      if (showTaskClosing) {
        setCompletedTasks(tasksData.filter((t) => t.status === "completed"));
      }
    } catch (err) {
      console.error("Dashboard error:", err);
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  const openTaskClosingView = async () => {
    setShowTaskClosing(true);
    setShowKPI(false);
    setActiveTab("overview"); // keep existing tabs untouched
    try {
      const completed = await tasksService.getTasksByStatus("completed");
      setCompletedTasks(completed);
    } catch (err) {
      setError(err.message || "Failed to load completed tasks");
    }
  };

  const closeTaskClosingView = () => {
    setShowTaskClosing(false);
    setSelectedMemberId("");
    setMarksDraft({});
  };

  // KPI Functions
  const openKPIView = () => {
    setShowTaskClosing(false);
    setShowKPI(true);
    setActiveTab("overview");
  };

  const closeKPIView = () => {
    setShowKPI(false);
    setSelectedKPIMonth("");
    setKpiScores({});
  };

  const loadKPIData = async () => {
    try {
      setError(null);
      const data = await kpiService.getAllScores();
      setKpiData(data);
    } catch (err) {
      console.error("Error loading KPI data:", err);
      setError(err.message || "Failed to load KPI data");
    }
  };

  const saveKPIScores = async () => {
    if (!selectedKPIMonth || !selectedKPIYear) {
      alert("Please select month and year");
      return;
    }

    setSavingKPI(true);
    try {
      const results = {
        saved: [],
        skipped: [],
      };

      for (const [userId, score] of Object.entries(kpiScores)) {
        if (score === undefined || score === null || score === "") continue;

        const scoreNum = Number(score);
        const memberName = memberNameById(userId);

        if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
          results.skipped.push(`${memberName}: invalid score`);
          continue;
        }

        try {
          await kpiService.createMonthlyScore({
            userId,
            userName: memberName,
            month: selectedKPIMonth,
            year: selectedKPIYear,
            score: scoreNum,
            addedBy: user?.uid || "admin",
          });
          results.saved.push(memberName);
        } catch (innerErr) {
          results.skipped.push(innerErr.message || `${memberName}: already recorded`);
        }
      }

      if (results.saved.length) {
        alert(`Saved KPI score(s) for: ${results.saved.join(", ")}`);
      }

      if (results.skipped.length) {
        alert(`Skipped entries: ${results.skipped.join(" | ")}`);
      }

      await loadKPIData();
      setKpiScores({});
    } catch (err) {
      console.error("Error saving KPI:", err);
      alert("Failed to save KPI scores: " + err.message);
    } finally {
      setSavingKPI(false);
    }
  };

  const getUserKPITotal = (userId) => {
    let total = 0;
    let count = 0;
    
    Object.entries(kpiData).forEach(([key, data]) => {
      if (data.userId === userId) {
        total += data.score || 0;
        count += 1;
      }
    });
    
    if (count === 0) return 0;
    return Math.round((total / count));
  };

  const getMonthsList = () => {
    return [
      "November", "December", "January", "February", "March", 
      "April", "May", "June", "July", "August", "September", "October"
    ];
  };

  const employeeMembers = users.filter((member) => (
    (member.role || "employee").toLowerCase() === "employee"
  ));

  const saveTaskMark = async (taskId, markValue) => {
    const mark = Number(markValue);
    if (Number.isNaN(mark) || mark < 0 || mark > 100) {
      alert("Please enter a valid mark between 0 and 100");
      return;
    }
    try {
      setSavingMarkTaskId(taskId);
      await tasksService.updateTask(taskId, {
        closingMark: mark,
        closingMarkedBy: user?.uid || "admin",
      });
      setCompletedTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, closingMark: mark } : t)));
      setMarksDraft((prev) => ({ ...prev, [taskId]: mark }));
    } catch (err) {
      setError(err.message || "Failed to save mark");
    } finally {
      setSavingMarkTaskId("");
    }
  };

  const memberNameById = (uid) => {
    const u = users.find((x) => (x.uid || x.id) === uid);
    return u ? (u.displayName || u.name || u.email) : "Unknown";
  };

  const memberSummaries = () => {
    const grouped = {};
    completedTasks.forEach((t) => {
      const uid = t.assignedTo || "unassigned";
      if (!grouped[uid]) grouped[uid] = { uid, count: 0, marks: [] };
      grouped[uid].count += 1;
      if (typeof t.closingMark === "number") grouped[uid].marks.push(t.closingMark);
    });
    return Object.values(grouped).map((g) => {
      const sum = g.marks.reduce((a, b) => a + b, 0);
      const denom = g.marks.length * 100;
      const totalScaled = denom > 0 ? Math.round((sum / denom) * 100) : 0; // out of 100
      return { uid: g.uid, totalOutOf100: totalScaled, tasksCompleted: g.count };
    });
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) {
      alert("Please enter a task title");
      return;
    }

    try {
      setError(null);
      const newTask = {
        ...taskForm,
        createdBy: user?.uid,
        createdByName: user?.displayName || user?.email,
      };
      
      const taskId = await tasksService.createTask(newTask);
      setTasks([{ id: taskId, ...newTask }, ...tasks]);
      
      await activityLogsService.logActivity({
        action: "Task Created",
        taskId: taskId,
        userId: user?.uid,
        details: `Task "${taskForm.title}" created`,
      });
      
      setTaskForm({
        title: "",
        description: "",
        priority: "medium",
        status: "pending",
        assignedTo: "",
      });
      setShowAddTask(false);
      fetchDashboardData();
    } catch (err) {
      console.error("Error adding task:", err);
      setError("Failed to add task: " + err.message);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!userForm.email.trim() || !userForm.displayName.trim()) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      setError(null);
      const newUser = {
        ...userForm,
        uid: `user_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      
      await usersService.createUser(newUser);
      setUsers([newUser, ...users]);
      
      await activityLogsService.logActivity({
        action: "User Created",
        userId: user?.uid,
        details: `User "${userForm.displayName}" created`,
      });
      
      setUserForm({
        email: "",
        displayName: "",
        role: "employee",
        department: "",
        phone: "",
      });
      setShowAddUser(false);
      fetchDashboardData();
    } catch (err) {
      console.error("Error adding user:", err);
      setError("Failed to add user: " + err.message);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await tasksService.deleteTask(taskId);
      setTasks(tasks.filter((t) => t.id !== taskId));
      fetchDashboardData();
    } catch (err) {
      setError("Failed to delete task: " + err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Delete this user?")) return;
    try {
      await usersService.deleteUser(userId);
      setUsers(users.filter((u) => (u.uid || u.id) !== userId));
      fetchDashboardData();
    } catch (err) {
      setError("Failed to delete user: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl font-semibold">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto flex gap-6">
        {/* Left Panel */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-lg shadow p-4 sticky top-8">
            {/* Member Section */}
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3 text-gray-800">Member</h3>
              <div className="text-sm text-gray-600">
                {user?.displayName || user?.email}
              </div>
            </div>

            {/* Feature Buttons Section */}
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3 text-gray-800">Features</h3>
              <div className="space-y-2">
                <button
                  onClick={openTaskClosingView}
                  className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition border border-indigo-200"
                >
                  📋 Task closing
                </button>
                <button className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition border border-indigo-200">
                  📅 Attendence
                </button>
                <button className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition border border-indigo-200">
                  ⭐ Quality of work
                </button>
                <button className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition border border-indigo-200">
                  👔 Manager
                </button>
                <button 
                  onClick={openKPIView}
                  className="w-full text-left px-4 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition border border-indigo-200"
                >
                  📊 KPI
                </button>
              </div>
            </div>

            {/* Quick Actions Section */}
            <div>
              <h3 className="text-lg font-bold mb-3 text-gray-800">Quick Actions</h3>
              <div className="space-y-2">
                <button 
                  onClick={() => setActiveTab("tasks")}
                  className="w-full text-left px-4 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition text-sm"
                >
                  + Add Task
                </button>
                <button 
                  onClick={() => setActiveTab("users")}
                  className="w-full text-left px-4 py-2 rounded-lg bg-green-50 hover:bg-green-100 text-green-700 font-medium transition text-sm"
                >
                  + Add Employee
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1">
        <h1 className="text-4xl font-bold mb-8">Admin Dashboard</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            {error}
            <button onClick={() => setError(null)} className="ml-2 font-bold">✕</button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Total Tasks</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">{stats.totalTasks}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Total Users</p>
            <p className="text-4xl font-bold text-green-600 mt-2">{stats.totalUsers}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Completed</p>
            <p className="text-4xl font-bold text-green-600 mt-2">{stats.completedTasks}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600 text-sm font-semibold">Pending</p>
            <p className="text-4xl font-bold text-yellow-600 mt-2">{stats.pendingTasks}</p>
          </div>
        </div>

        {showTaskClosing && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Task Closing</h2>
              <button onClick={closeTaskClosingView} className="text-sm text-gray-600 hover:text-gray-900">Close ✕</button>
            </div>
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-semibold mb-1">Filter by member</label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">All members</option>
                  {users.map((u) => (
                    <option key={u.uid || u.id} value={u.uid || u.id}>
                      {u.displayName || u.name || u.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-sm text-indigo-700">Each task is marked out of 100. Member total is the sum of their task marks, normalized back to 100.</p>
              </div>
            </div>

            {!selectedMemberId && (
              <div className="mb-6">
                <h3 className="text-lg font-bold mb-2">Members — Total (out of 100)</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {memberSummaries().map((m) => (
                    <div key={m.uid} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">{memberNameById(m.uid)}</p>
                          <p className="text-xs text-gray-500">Completed: {m.tasksCompleted}</p>
                        </div>
                        <div className="text-2xl font-bold text-indigo-600">{m.totalOutOf100}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left font-semibold">Title</th>
                    <th className="px-6 py-3 text-left font-semibold">Assigned</th>
                    <th className="px-6 py-3 text-left font-semibold">Status</th>
                    <th className="px-6 py-3 text-left font-semibold">Mark (0-100)</th>
                    <th className="px-6 py-3 text-left font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {completedTasks
                    .filter((t) => !selectedMemberId || (t.assignedTo === selectedMemberId))
                    .map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-3">{task.title}</td>
                        <td className="px-6 py-3 text-sm">{task.assignedToName || memberNameById(task.assignedTo)}</td>
                        <td className="px-6 py-3">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">completed</span>
                        </td>
                        <td className="px-6 py-3">
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
                        <td className="px-6 py-3">
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
              {completedTasks.filter((t) => !selectedMemberId || (t.assignedTo === selectedMemberId)).length === 0 && (
                <p className="p-6 text-center text-gray-500">No completed tasks for this selection</p>
              )}
            </div>
          </div>
        )}

        {showKPI && (
          <div ref={kpiSectionRef} className="bg-white rounded-lg shadow p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">📊 KPI Management</h2>
              <button onClick={closeKPIView} className="text-sm text-gray-600 hover:text-gray-900">Close ✕</button>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-700">
                <strong>Note:</strong> Add KPI scores for each employee on a monthly basis. Each score is out of 100. 
                If an employee has multiple months of scores, the average will be displayed (normalized to 100).
                Scores can only be added once per month per employee.
              </p>
            </div>

            {/* Member List with Total KPI Scores */}
            <div className="mb-6">
              <h3 className="text-lg font-bold mb-3">Employee KPI Scores (Average out of 100)</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {employeeMembers.length === 0 ? (
                  <div className="col-span-full text-sm text-gray-500">
                    No employees found yet. Add team members to start tracking KPI scores.
                  </div>
                ) : (
                  employeeMembers.map((member) => {
                    const total = getUserKPITotal(member.uid || member.id);
                    const monthsCount = Object.values(kpiData).filter((d) => d.userId === (member.uid || member.id)).length;
                    return (
                      <div key={member.uid || member.id} className="border rounded-lg p-4 bg-gray-50">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-semibold text-gray-800">{member.displayName || member.name || member.email}</p>
                            <p className="text-xs text-gray-500">Months Recorded: {monthsCount}</p>
                          </div>
                          <div className="text-2xl font-bold text-blue-600">{total}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Add Monthly Scores */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-bold mb-4">Add Monthly KPI Scores</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-semibold mb-2">Select Month</label>
                  <select
                    value={selectedKPIMonth}
                    onChange={(e) => setSelectedKPIMonth(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="">-- Select Month --</option>
                    {getMonthsList().map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2">Select Year</label>
                  <select
                    value={selectedKPIYear}
                    onChange={(e) => setSelectedKPIYear(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="2024">2024</option>
                    <option value="2025">2025</option>
                    <option value="2026">2026</option>
                  </select>
                </div>
              </div>

              {selectedKPIMonth && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-6 py-3 text-left font-semibold">Employee Name</th>
                        <th className="px-6 py-3 text-left font-semibold">Department</th>
                        <th className="px-6 py-3 text-left font-semibold">Score (0-100)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employeeMembers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">
                            No employees available. Add employees first to record KPI scores.
                          </td>
                        </tr>
                      ) : (
                        employeeMembers.map((member) => {
                          const userId = member.uid || member.id;
                          const existingScoreKey = `${userId}_${selectedKPIYear}_${selectedKPIMonth}`;
                          const hasExistingScore = kpiData[existingScoreKey];
                          
                          return (
                            <tr key={userId} className="border-b hover:bg-gray-50">
                              <td className="px-6 py-3 font-semibold">{member.displayName || member.name || member.email}</td>
                              <td className="px-6 py-3 text-gray-600">{member.department || "-"}</td>
                              <td className="px-6 py-3">
                                {hasExistingScore ? (
                                  <span className="text-green-600 font-semibold">
                                    Already added: {hasExistingScore.score}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={kpiScores[userId] || ""}
                                    onChange={(e) => setKpiScores((prev) => ({ ...prev, [userId]: e.target.value }))}
                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                                    placeholder="0-100"
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                  
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={saveKPIScores}
                      disabled={savingKPI || Object.keys(kpiScores).length === 0}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {savingKPI ? "Saving..." : "Save KPI Scores"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="border-b border-gray-300 mb-6 flex space-x-1">
          {["overview", "tasks", "users", "activity"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-semibold border-b-2 transition capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Recent Tasks</h2>
              {tasks.length === 0 ? (
                <p className="text-gray-500">No tasks yet</p>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="border-b pb-3 mb-3">
                    <p className="font-semibold">{task.title}</p>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {task.status}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Team Members</h2>
              {users.length === 0 ? (
                <p className="text-gray-500">No users yet</p>
              ) : (
                users.slice(0, 5).map((user) => (
                  <div key={user.uid || user.id} className="border-b pb-3 mb-3">
                    <p className="font-semibold">{user.displayName || user.name}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "tasks" && (
          <div>
            <button
              onClick={() => setShowAddTask(!showAddTask)}
              className="mb-6 bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700"
            >
              {showAddTask ? "Cancel" : "+ Add Task"}
            </button>

            {showAddTask && (
              <form onSubmit={handleAddTask} className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-bold mb-4">Create New Task</h3>
                <div className="space-y-4">
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Task Title *"
                    required
                  />
                  <textarea
                    value={taskForm.description}
                    onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Description"
                    rows="3"
                  />
                  <div className="grid grid-cols-3 gap-4">
                    <select
                      value={taskForm.priority}
                      onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="low">Low Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="high">High Priority</option>
                    </select>
                    <select
                      value={taskForm.status}
                      onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <select
                      value={taskForm.assignedTo}
                      onChange={(e) => setTaskForm({ ...taskForm, assignedTo: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Assign To</option>
                      {users.filter((u) => u.role === "employee").map((u) => (
                        <option key={u.uid || u.id} value={u.uid || u.id}>
                          {u.displayName || u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700"
                  >
                    Create Task
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-lg shadow overflow-x-auto">
              {tasks.length === 0 ? (
                <p className="p-6 text-center text-gray-500">No tasks</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold">Title</th>
                      <th className="px-6 py-3 text-left font-semibold">Status</th>
                      <th className="px-6 py-3 text-left font-semibold">Priority</th>
                      <th className="px-6 py-3 text-left font-semibold">Assigned</th>
                      <th className="px-6 py-3 text-left font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((task) => (
                      <tr key={task.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-3">{task.title}</td>
                        <td className="px-6 py-3">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {task.status}
                          </span>
                        </td>
                        <td className="px-6 py-3">{task.priority}</td>
                        <td className="px-6 py-3 text-sm">{task.assignedToName || "-"}</td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="text-red-600 hover:text-red-800 font-semibold text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "users" && (
          <div>
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="mb-6 bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700"
            >
              {showAddUser ? "Cancel" : "+ Add Employee"}
            </button>

            {showAddUser && (
              <form onSubmit={handleAddUser} className="bg-white rounded-lg shadow p-6 mb-6">
                <h3 className="text-lg font-bold mb-4">Add New Employee</h3>
                <div className="space-y-4">
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Email *"
                    required
                  />
                  <input
                    type="text"
                    value={userForm.displayName}
                    onChange={(e) => setUserForm({ ...userForm, displayName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Full Name *"
                    required
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="employee">Employee</option>
                      <option value="admin">Admin</option>
                    </select>
                    <input
                      type="text"
                      value={userForm.department}
                      onChange={(e) => setUserForm({ ...userForm, department: e.target.value })}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Department"
                    />
                  </div>
                  <input
                    type="tel"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    placeholder="Phone"
                  />
                  <button
                    type="submit"
                    className="w-full bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700"
                  >
                    Add Employee
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-lg shadow overflow-x-auto">
              {users.length === 0 ? (
                <p className="p-6 text-center text-gray-500">No users</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left font-semibold">Name</th>
                      <th className="px-6 py-3 text-left font-semibold">Email</th>
                      <th className="px-6 py-3 text-left font-semibold">Role</th>
                      <th className="px-6 py-3 text-left font-semibold">Department</th>
                      <th className="px-6 py-3 text-left font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.uid || user.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-3">{user.displayName || user.name}</td>
                        <td className="px-6 py-3">{user.email}</td>
                        <td className="px-6 py-3">{user.role}</td>
                        <td className="px-6 py-3">{user.department || "-"}</td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => handleDeleteUser(user.uid || user.id)}
                            className="text-red-600 hover:text-red-800 font-semibold text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === "activity" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Activity Logs</h2>
            {logs.length === 0 ? (
              <p className="text-gray-500">No activity</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="border-l-4 border-blue-500 pl-4 py-2">
                    <p className="font-semibold text-sm">{log.action}</p>
                    <p className="text-xs text-gray-600">{log.details}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
