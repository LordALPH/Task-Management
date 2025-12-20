import { usersService } from "../../../lib/firebaseService";
import { activityLogsService } from "../../../lib/firebaseService";

export default async function handler(req, res) {
  const { method } = req;
  const { userId } = req.query;

  if (!req.headers.authorization) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    switch (method) {
      case "GET":
        if (userId) {
          // Get single user
          const user = await usersService.getUserById(userId);
          if (!user) {
            return res.status(404).json({ error: "User not found" });
          }
          // Don't expose sensitive data
          delete user.password;
          return res.status(200).json(user);
        } else {
          // Get all users
          const users = await usersService.getAllUsers();
          // Remove sensitive data
          const safeUsers = users.map((user) => {
            delete user.password;
            return user;
          });
          return res.status(200).json(safeUsers);
        }

      case "POST":
        // Create new user
        const newUserId = await usersService.createUser(req.body);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "User Created",
          userId: newUserId,
          createdBy: req.body.createdBy,
          details: `User "${req.body.email}" created`,
        });

        return res.status(201).json({ id: newUserId, message: "User created" });

      case "PUT":
        // Update user
        if (!userId) {
          return res.status(400).json({ error: "User ID required" });
        }
        
        await usersService.updateUser(userId, req.body);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "User Updated",
          userId: userId,
          updatedBy: req.body.updatedBy,
          details: `User updated`,
        });

        return res
          .status(200)
          .json({ id: userId, message: "User updated" });

      case "DELETE":
        // Delete user
        if (!userId) {
          return res.status(400).json({ error: "User ID required" });
        }
        
        await usersService.deleteUser(userId);
        
        // Log activity
        await activityLogsService.logActivity({
          action: "User Deleted",
          userId: userId,
          deletedBy: req.body.deletedBy,
          details: `User deleted`,
        });

        return res
          .status(200)
          .json({ id: userId, message: "User deleted" });

      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error) {
    console.error("User API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}
