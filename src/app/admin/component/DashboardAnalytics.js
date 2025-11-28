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
} from "recharts";

const DashboardAnalytics = ({ tasks }) => {
  const [filter, setFilter] = useState("all");

  // 🔹 Filter tasks by date range
  const filteredTasks = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    if (filter === "all") return tasks;

    const now = new Date();
    return tasks.filter((task) => {
      const due =
        task.dueDate?.seconds
          ? new Date(task.dueDate.seconds * 1000)
          : new Date(task.dueDate);

      if (filter === "7days") {
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(now.getDate() - 7);
        return due >= sevenDaysAgo && due <= now;
      }

      if (filter === "month") {
        return (
          due.getMonth() === now.getMonth() &&
          due.getFullYear() === now.getFullYear()
        );
      }

      return true;
    });
  }, [filter, tasks]);

  // 🔹 KPIs
  const totalTasks = filteredTasks.length;
  const completedTasks = filteredTasks.filter((t) => t.status === "completed").length;
  const pendingTasks = filteredTasks.filter((t) => t.status !== "completed").length;
  const activeEmployees = [...new Set(filteredTasks.map((t) => t.assignedEmail))].length;

  // 🔹 Chart Data with Due Dates
  const taskStats = {};
  filteredTasks.forEach((task) => {
    const email = task.assignedEmail || "Unknown";
    const due =
      task.dueDate?.seconds
        ? new Date(task.dueDate.seconds * 1000)
        : new Date(task.dueDate);

    if (!taskStats[email]) {
      taskStats[email] = {
        completed: 0,
        pending: 0,
        dueDates: [],
        overdue: 0,
      };
    }

    if (task.status === "completed") taskStats[email].completed++;
    else taskStats[email].pending++;

    // Track due dates
    taskStats[email].dueDates.push(due);

    // Track overdue count
    if (due < new Date() && task.status !== "completed") {
      taskStats[email].overdue++;
    }
  });

  const chartData = Object.keys(taskStats).map((email) => {
    const data = taskStats[email];
    const nextDue =
      data.dueDates.length > 0
        ? new Date(
            Math.min(...data.dueDates.map((d) => d.getTime()))
          ).toLocaleDateString()
        : "N/A";

    return {
      name: email,
      Completed: data.completed,
      Pending: data.pending,
      Overdue: data.overdue,
      NextDue: nextDue,
    };
  });

  // Build per-user timeline data when a single user is selected
  const selectedUserEmail = chartData.length === 1 ? chartData[0].name : null;

  const timelineData = useMemo(() => {
    if (!selectedUserEmail) return [];
    // group by due date (use dueDate or endDate)
    const map = {};
    filteredTasks.forEach((task) => {
      const email = task.assignedEmail || "Unknown";
      if (email !== selectedUserEmail) return;
      let due = null;
      if (task.dueDate) {
        due = task.dueDate.seconds ? new Date(task.dueDate.seconds * 1000) : new Date(task.dueDate);
      } else if (task.endDate) {
        due = task.endDate.toDate ? task.endDate.toDate() : new Date(task.endDate);
      }
      if (!due) return;
      const key = due.toLocaleDateString();
      if (!map[key]) map[key] = { date: key, Completed: 0, Pending: 0, Overdue: 0 };
      const now = new Date();
      if (task.status === "completed") map[key].Completed++;
      else map[key].Pending++;
      if (due < now && task.status !== "completed") map[key].Overdue++;
    });

    // convert to sorted array
    return Object.values(map).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [filteredTasks, selectedUserEmail]);

  return (
    <div className="mt-8">
      {/* 🔹 KPI Summary */}
      <div className="grid md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl shadow text-center">
          <p className="text-sm text-gray-500">🟢 Total Tasks</p>
          <h3 className="text-2xl font-bold text-gray-800">{totalTasks}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow text-center">
          <p className="text-sm text-gray-500">✅ Completed</p>
          <h3 className="text-2xl font-bold text-green-600">{completedTasks}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow text-center">
          <p className="text-sm text-gray-500">🟡 Pending</p>
          <h3 className="text-2xl font-bold text-yellow-600">{pendingTasks}</h3>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow text-center">
          <p className="text-sm text-gray-500">👷 Employees Active</p>
          <h3 className="text-2xl font-bold text-blue-600">{activeEmployees}</h3>
        </div>
      </div>

      {/* 🔹 Filter Selector */}
      <div className="flex justify-end mb-6">
        <select
          className="border p-2 rounded text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Time</option>
          <option value="7days">Last 7 Days</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* 🔹 Charts */}
      <div className="bg-white p-6 rounded-2xl shadow-md">
        <h2 className="text-xl font-semibold mb-4">
          📊 Employee Performance Overview
        </h2>

        {chartData.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-8">
            {/* Bar Chart */}
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Completed" fill="#22c55e" />
                  <Bar dataKey="Pending" fill="#eab308" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Progress Graph for selected user (replaces previous pie chart). */}
            <div className="h-80">
              {selectedUserEmail ? (
                timelineData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={timelineData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="Completed" stroke="#22c55e" strokeWidth={2} />
                      <Line type="monotone" dataKey="Pending" stroke="#eab308" strokeWidth={2} />
                      <Line type="monotone" dataKey="Overdue" stroke="#ef4444" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <p className="font-medium">No dated tasks for {selectedUserEmail}</p>
                    <p className="text-sm">Tasks without a due/end date won't appear here.</p>
                  </div>
                )
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-500">
                  <p className="font-medium">Select a user to see detailed progress</p>
                  <p className="text-sm">Use the 'User' selector above to focus on one member.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No tasks to display performance.</p>
        )}

        {/* 🔹 Progress Bars with Completed Task Due Dates */}
        <div className="mt-10">
          <h3 className="text-lg font-semibold mb-3">📈 Employee Progress</h3>
          <div className="space-y-4">
            {chartData.map((data) => {
              const total = data.Completed + data.Pending;
              const percent = total ? Math.round((data.Completed / total) * 100) : 0;

              // 🆕 Get completed tasks' due dates for this employee
              const completedDueDates = filteredTasks
                .filter(
                  (t) =>
                    t.assignedEmail === data.name &&
                    t.status === "completed" &&
                    t.dueDate
                )
                .map((t) =>
                  t.dueDate?.seconds
                    ? new Date(t.dueDate.seconds * 1000)
                    : new Date(t.dueDate)
                )
                .sort((a, b) => a - b)
                .map((d) => d.toLocaleDateString());

              return (
                <div key={data.name} className="pb-3 border-b border-gray-100">
                  <p className="text-sm mb-1 text-gray-700 flex justify-between">
                    <span>{data.name}</span>
                    <span className="text-xs text-gray-500">
                      🗓 Next Due: {data.NextDue}
                    </span>
                  </p>

                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="bg-green-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${percent}%` }}
                    ></div>
                  </div>

                  <p className="text-xs text-gray-500 mt-1">
                    ✅ {data.Completed}/{total} completed ({percent}%) — ⚠️{" "}
                    {data.Overdue} overdue
                  </p>

                  {/* 🆕 Show completed task due dates */}
                  {completedDueDates.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      📅 Completed task due dates:{" "}
                      {completedDueDates.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAnalytics;
