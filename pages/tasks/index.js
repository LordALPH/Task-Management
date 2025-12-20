import { useState, useEffect } from "react";
import { tasksService, usersService } from "../../lib/firebaseService";
import { authHelper } from "../../lib/authHelper";

export default function TasksPage() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "pending",
  });

  // Initialize and fetch data
  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoading(true);

        // Get current user
        const user = await authHelper.getCurrentUser();
        setCurrentUser(user);

        // Fetch tasks and users
        const [tasksData, usersData] = await Promise.all([
          tasksService.getAllTasks(),
          usersService.getAllUsers(),
        ]);

        setTasks(tasksData);
        setUsers(usersData);
        setError(null);
      } catch (err) {
        console.error("Error initializing app:", err);
        setError(err.message || "Failed to load data");
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Create new task
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      setError("Task title is required");
      return;
    }

    try {
      const taskId = await tasksService.createTask({
        ...newTask,
        createdBy: currentUser?.userData?.id,
        assignedTo: currentUser?.userData?.id,
      });

      // Refresh tasks
      const updatedTasks = await tasksService.getAllTasks();
      setTasks(updatedTasks);

      // Reset form
      setNewTask({
        title: "",
        description: "",
        priority: "medium",
        status: "pending",
      });
      setError(null);
      alert("Task created successfully!");
    } catch (err) {
      setError("Failed to create task: " + err.message);
    }
  };

  // Update task status
  const handleUpdateTaskStatus = async (taskId, newStatus) => {
    try {
      await tasksService.updateTask(taskId, {
        status: newStatus,
        updatedBy: currentUser?.userData?.id,
      });

      // Refresh tasks
      const updatedTasks = await tasksService.getAllTasks();
      setTasks(updatedTasks);
      setError(null);
    } catch (err) {
      setError("Failed to update task: " + err.message);
    }
  };

  // Delete task
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    try {
      await tasksService.deleteTask(taskId);

      // Refresh tasks
      const updatedTasks = await tasksService.getAllTasks();
      setTasks(updatedTasks);
      setError(null);
    } catch (err) {
      setError("Failed to delete task: " + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Task Management</h1>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {currentUser && (
          <div className="bg-white rounded-lg shadow p-4 mb-8">
            <p className="text-gray-700">
              Logged in as: <strong>{currentUser.userData?.name}</strong> (
              {currentUser.userData?.role})
            </p>
          </div>
        )}

        {/* Create Task Form */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6">Create New Task</h2>
          <form onSubmit={handleCreateTask}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                placeholder="Task Title"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask({ ...newTask, title: e.target.value })
                }
                className="border rounded px-3 py-2"
                required
              />
              <select
                value={newTask.priority}
                onChange={(e) =>
                  setNewTask({ ...newTask, priority: e.target.value })
                }
                className="border rounded px-3 py-2"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            <textarea
              placeholder="Task Description"
              value={newTask.description}
              onChange={(e) =>
                setNewTask({ ...newTask, description: e.target.value })
              }
              className="w-full border rounded px-3 py-2 mb-4"
              rows="4"
            />
            <button
              type="submit"
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
            >
              Create Task
            </button>
          </form>
        </div>

        {/* Tasks List */}
        <div className="bg-white rounded-lg shadow p-8 mb-8">
          <h2 className="text-2xl font-bold mb-6">
            Tasks ({tasks.length})
          </h2>
          {tasks.length === 0 ? (
            <p className="text-gray-500">No tasks yet. Create one to get started!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="border rounded-lg p-4 hover:shadow-lg transition"
                >
                  <h3 className="font-bold text-lg mb-2">{task.title}</h3>
                  <p className="text-gray-600 mb-3 text-sm">
                    {task.description}
                  </p>
                  <div className="flex justify-between items-center mb-3 text-sm">
                    <span
                      className={`px-2 py-1 rounded ${
                        task.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : task.priority === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {task.priority}
                    </span>
                    <span
                      className={`px-2 py-1 rounded ${
                        task.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : task.status === "in-progress"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <select
                      value={task.status}
                      onChange={(e) =>
                        handleUpdateTaskStatus(task.id, e.target.value)
                      }
                      className="flex-1 border rounded px-2 py-1 text-sm"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="w-full bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Users List */}
        <div className="bg-white rounded-lg shadow p-8">
          <h2 className="text-2xl font-bold mb-6">Team Members ({users.length})</h2>
          {users.length === 0 ? (
            <p className="text-gray-500">No team members yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{user.name}</td>
                      <td className="px-4 py-2">{user.email}</td>
                      <td className="px-4 py-2">
                        <span className="px-2 py-1 rounded bg-blue-100 text-blue-700">
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-2">{user.department || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
