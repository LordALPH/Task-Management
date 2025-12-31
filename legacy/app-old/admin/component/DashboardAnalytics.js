"use client";
import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const canonicalStatus = (status = "") => {
  const normalized = status.toString().trim().toLowerCase();
  if (normalized.includes("complete")) return "completed";
  if (normalized.includes("delay")) return "delayed";
  return normalized;
};

const DashboardAnalytics = ({
  tasks = [],
  overallPieData = [],
  recentTasks = [],
  selectedUserId = "",
  selectedUserEmail = "",
  selectedUserName = "",
}) => {
  const [filter, setFilter] = useState("all");
  const trimmedSelectedEmail = (selectedUserEmail || "").trim();
  const normalizedSelectedEmail = trimmedSelectedEmail.toLowerCase();
  const normalizedSelectedName = (selectedUserName || "").toString().trim().toLowerCase();
  const normalizedSelectedId = selectedUserId ? selectedUserId.toString().trim() : "";

  const filteredTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    if (filter === "all") return tasks;

    const now = new Date();
    return tasks.filter((task) => {
      const rawDue = task.dueDate || task.endDate;
      if (!rawDue) return false;
      const due = rawDue?.seconds ? new Date(rawDue.seconds * 1000) : new Date(rawDue);
      if (Number.isNaN(due.getTime())) return false;

      if (filter === "7days") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return due >= sevenDaysAgo && due <= now;
      }

      if (filter === "month") {
        return due.getMonth() === now.getMonth() && due.getFullYear() === now.getFullYear();
      }

      return true;
    });
  }, [filter, tasks]);

  const completedTasks = useMemo(
    () => filteredTasks.filter((t) => canonicalStatus(t.status) === "completed"),
    [filteredTasks]
  );

  const delayedTasks = useMemo(
    () => filteredTasks.filter((t) => canonicalStatus(t.status) === "delayed"),
    [filteredTasks]
  );

  const inProcessTasks = useMemo(
    () =>
      filteredTasks.filter((t) => {
        const normalized = canonicalStatus(t.status);
        return normalized !== "completed" && normalized !== "delayed";
      }),
    [filteredTasks]
  );

  const totalTasks = filteredTasks.length;

  const activeEmployees = useMemo(() => {
    const assignees = filteredTasks.map((t) => t.assignedEmail || t.assignedTo || "Unknown");
    return new Set(assignees).size;
  }, [filteredTasks]);

  const chartData = useMemo(() => {
    const stats = {};

    filteredTasks.forEach((task) => {
      const status = canonicalStatus(task.status);
      const email = task.assignedEmail || task.assignedTo || "Unknown";

      if (!stats[email]) {
        stats[email] = {
          completed: 0,
          delayed: 0,
          inProcess: 0,
          dueDates: [],
          overdue: 0,
        };
      }

      if (status === "completed") stats[email].completed += 1;
      else if (status === "delayed") stats[email].delayed += 1;
      else stats[email].inProcess += 1;

      const dueDateSource = task.dueDate || task.endDate;
      if (dueDateSource) {
        const due = dueDateSource.seconds ? new Date(dueDateSource.seconds * 1000) : new Date(dueDateSource);
        if (!Number.isNaN(due.getTime())) {
          stats[email].dueDates.push(due);
          if (status === "delayed" && due < new Date()) {
            stats[email].overdue += 1;
          }
        }
      }
    });

    return Object.keys(stats).map((email) => {
      const data = stats[email];
      const total = data.completed + data.delayed + data.inProcess;
      const nextDue =
        data.dueDates.length > 0
          ? new Date(Math.min(...data.dueDates.map((d) => d.getTime()))).toLocaleDateString()
          : "N/A";

      return {
        name: email,
        Completed: data.completed,
        Delayed: data.delayed,
        InProcess: data.inProcess,
        Overdue: data.overdue,
        Total: total,
        NextDue: nextDue,
      };
    });
  }, [filteredTasks]);

  const detailUserEmail = trimmedSelectedEmail || (chartData.length === 1 ? chartData[0].name : "");
  const normalizedDetailUserEmail = detailUserEmail ? detailUserEmail.trim().toLowerCase() : "";

  const timelineData = useMemo(() => {
    if (!normalizedDetailUserEmail) return [];

    const map = {};
    const now = new Date();

    filteredTasks.forEach((task) => {
      const email = (task.assignedEmail || task.assignedTo || "Unknown").toString().trim().toLowerCase();
      if (email !== normalizedDetailUserEmail) return;

      let due = null;
      if (task.dueDate) {
        due = task.dueDate.seconds ? new Date(task.dueDate.seconds * 1000) : new Date(task.dueDate);
      } else if (task.endDate) {
        due = task.endDate.seconds ? new Date(task.endDate.seconds * 1000) : new Date(task.endDate);
      }

      if (!due || Number.isNaN(due.getTime())) return;
      const key = due.toLocaleDateString();
      if (!map[key]) map[key] = { date: key, Completed: 0, Delayed: 0, Overdue: 0 };

      const status = canonicalStatus(task.status);
      if (status === "completed") map[key].Completed += 1;
      if (status === "delayed") {
        map[key].Delayed += 1;
        if (due < now) map[key].Overdue += 1;
      }
    });

    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filteredTasks, normalizedDetailUserEmail]);

  const summaryCards = [
    { label: "🟢 Total Tasks", value: totalTasks, accent: "text-gray-800" },
    { label: "✅ Completed", value: completedTasks.length, accent: "text-green-600" },
    { label: "⏳ Delayed", value: delayedTasks.length, accent: "text-red-500" },
    { label: "🚧 In-process Task", value: inProcessTasks.length, accent: "text-amber-500" },
    { label: "👷 Employees Active", value: activeEmployees, accent: "text-blue-600" },
  ];

  const pieChartData = useMemo(() => {
    if (overallPieData && overallPieData.length > 0) {
      return overallPieData.filter((segment) => (segment?.value ?? 0) > 0);
    }

    const derived = [
      { name: "Completed", value: completedTasks.length },
      { name: "Delayed", value: delayedTasks.length },
      { name: "In Process", value: inProcessTasks.length },
    ];

    return derived.filter((segment) => segment.value > 0);
  }, [overallPieData, completedTasks.length, delayedTasks.length, inProcessTasks.length]);

  const pieColors = ["#22c55e", "#fbbf24", "#ef4444", "#6b7280"];

  const relatedTaskEntries = useMemo(() => {
    const source = (recentTasks && recentTasks.length > 0 ? recentTasks : tasks) || [];
    if (source.length === 0) return [];

    if (!normalizedSelectedEmail && !normalizedSelectedName && !normalizedSelectedId) {
      return source.slice(0, 6);
    }

    const filtered = source.filter((task) => {
      const taskEmail = (task.assignedEmail || task.assignedTo || "").toString().trim().toLowerCase();
      if (normalizedSelectedEmail && taskEmail === normalizedSelectedEmail) return true;

      const taskName = (task.assignedName || "").toString().trim().toLowerCase();
      if (normalizedSelectedName && taskName === normalizedSelectedName) return true;

      const taskId = task.assignedUserId || task.assignedUid || task.userId || task.uid;
      const normalizedTaskId = taskId ? taskId.toString().trim() : "";
      if (normalizedSelectedId && normalizedTaskId && normalizedTaskId === normalizedSelectedId) return true;

      return false;
    });

    const finalList = filtered.length > 0 ? filtered : source;
    return finalList.slice(0, 6);
  }, [recentTasks, tasks, normalizedSelectedEmail, normalizedSelectedName, normalizedSelectedId]);

  const formatTaskDate = (value) => {
    if (!value) return "-";
    const date = value.seconds ? new Date(value.seconds * 1000) : new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow w-full">
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {summaryCards.map((card) => (
            <div key={card.label} className="bg-gray-50 rounded-xl p-4 flex flex-col gap-1">
              <p className="text-sm text-gray-500">{card.label}</p>
              <h3 className={`text-2xl font-bold ${card.accent}`}>{card.value}</h3>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow w-full">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">📊 Performance Trends</h2>
            <p className="text-sm text-gray-500">Track completions and delays across the selected range.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600" htmlFor="dashboard-range-select">Range:</label>
            <select
              id="dashboard-range-select"
              className="border p-2 rounded text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All Time</option>
              <option value="7days">Last 7 Days</option>
              <option value="month">This Month</option>
            </select>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Completed" fill="#22c55e" />
                  <Bar dataKey="Delayed" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-96">
              {normalizedDetailUserEmail ? (
                timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Completed" stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="Delayed" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="Overdue" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <p className="font-medium">No dated tasks for {detailUserEmail || "this member"}</p>
                    <p className="text-sm">Tasks without a due/end date won't appear here.</p>
                  </div>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <p className="font-medium">Select a user to see detailed progress</p>
                  <p className="text-sm">Use the analytics filter above to focus on one member.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No tasks to display performance.</p>
        )}
      </div>

      <div className="bg-white p-6 rounded-2xl shadow w-full">
        <div className="grid lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-semibold mb-3">📈 Employee Progress</h3>
            <div className="space-y-4 max-h-[28rem] overflow-auto pr-1">
              {chartData.map((data) => {
                const completedCount = data.Completed || 0;
                const delayedCount = data.Delayed || 0;
                const inProcessCount = data.InProcess || 0;
                const total =
                  typeof data.Total === "number"
                    ? data.Total
                    : completedCount + delayedCount + inProcessCount;
                const percent = total ? Math.round((completedCount / total) * 100) : 0;
                const completedDueDates = filteredTasks
                  .filter(
                    (t) =>
                      canonicalStatus(t.status) === "completed" &&
                      (t.assignedEmail || t.assignedTo || "Unknown") === data.name &&
                      t.dueDate
                  )
                  .map((t) =>
                    t.dueDate?.seconds
                      ? new Date(t.dueDate.seconds * 1000).toLocaleDateString()
                      : new Date(t.dueDate).toLocaleDateString()
                  )
                  .slice(0, 3);

                return (
                  <div key={data.name} className="bg-gray-50 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{data.name}</p>
                        <p className="text-xs text-gray-500">Next due: {data.NextDue}</p>
                      </div>
                      <span className="text-sm font-semibold text-indigo-600">{percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: `${percent}%` }}></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 mt-3">
                      <p className="flex items-center justify-between">
                        <span>Total</span>
                        <span className="font-semibold text-gray-800">{total}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>Completed</span>
                        <span className="font-semibold text-gray-800">{completedCount}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>In Process</span>
                        <span className="font-semibold text-gray-800">{inProcessCount}</span>
                      </p>
                      <p className="flex items-center justify-between">
                        <span>Delayed</span>
                        <span className="font-semibold text-gray-800">{delayedCount}</span>
                      </p>
                    </div>
                    {completedDueDates.length > 0 && (
                      <p className="text-[11px] text-gray-500 mt-2">Recent completions: {completedDueDates.join(", ")}</p>
                    )}
                  </div>
                );
              })}
              {chartData.length === 0 && (
                <p className="text-sm text-gray-500">No employee progress data available for this selection.</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <div className="h-80">
              {pieChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      dataKey="value"
                      data={pieChartData}
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                      label={({ name, percent }) => `${name} (${Math.round(percent * 100)}%)`}
                    >
                      {pieChartData.map((entry, idx) => (
                        <Cell key={`status-slice-${entry.name}`} fill={pieColors[idx % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <p>No status distribution data available.</p>
                </div>
              )}
            </div>
            <div className="bg-gray-50 rounded-xl p-4 shadow-inner">
              <h4 className="text-sm font-semibold mb-3">Related Task</h4>
              <div className="space-y-2 max-h-48 overflow-auto">
                {relatedTaskEntries.length > 0 ? (
                  relatedTaskEntries.map((task) => (
                    <div key={task.id} className="p-2 border rounded text-sm bg-white">
                      <div className="font-medium text-gray-800 truncate">{task.title || "Untitled"}</div>
                      <div className="text-xs text-gray-500">
                        {(task.assignedName || task.assignedEmail || "Unassigned").toString()} • {formatTaskDate(task.endDate || task.dueDate)}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">No tasks available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;
