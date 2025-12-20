import { tasksService } from "../../../lib/firebaseService";
import { activityLogsService } from "../../../lib/firebaseService";

export default async function handler(req, res) {
  const { method } = req;
  const { taskId } = req.query;

  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    switch (method) {
      case "GET":
        if (taskId) {
          // Get single task
          const task = await tasksService.getTaskById(taskId);
          return res.status(200).json(task);
        } else {
          // Get all tasks
          const tasks = await tasksService.getAllTasks();
          return res.status(200).json(tasks);
        }

      case "POST":
        // Create new task
        const newTaskId = await tasksService.createTask(req.body);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "Task Created",
          taskId: newTaskId,
          userId: req.body.createdBy,
          details: `Task "${req.body.title}" created`,
        });

        return res.status(201).json({ id: newTaskId, message: "Task created" });

      case "PUT":
        // Update task
        if (!taskId) {
          return res.status(400).json({ error: "Task ID required" });
        }
        
        await tasksService.updateTask(taskId, req.body);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "Task Updated",
          taskId: taskId,
          userId: req.body.updatedBy,
          details: `Task updated`,
        });

        return res
          .status(200)
          .json({ id: taskId, message: "Task updated" });

      case "DELETE":
        // Delete task
        if (!taskId) {
          return res.status(400).json({ error: "Task ID required" });
        }
        
        await tasksService.deleteTask(taskId);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "Task Deleted",
          taskId: taskId,
          userId: req.body.deletedBy,
          details: `Task deleted`,
        });

        return res
          .status(200)
          .json({ id: taskId, message: "Task deleted" });

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("Task API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
