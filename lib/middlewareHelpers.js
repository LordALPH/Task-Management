import { authHelper } from "../lib/authHelper";

// Middleware to protect API routes
export async function requireAuth(req, res) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  // In production, verify the Firebase token
  // For now, we'll just check if the header exists
  return true;
}

// Middleware to verify admin access
export async function requireAdmin(userId) {
  try {
    const isAdmin = await authHelper.isAdmin(userId);
    return isAdmin;
  } catch (error) {
    console.error("Admin check error:", error);
    return false;
  }
}

// Middleware to verify user ownership
export function verifyOwnership(resourceUserId, currentUserId) {
  return resourceUserId === currentUserId;
}

// Error handler for API routes
export function handleError(error, res) {
  console.error("Error:", error);

  if (error.code === "permission-denied") {
    return res.status(403).json({ 
      error: "Permission denied - Insufficient access" 
    });
  }

  if (error.message.includes("not found")) {
    return res.status(404).json({ 
      error: "Resource not found" 
    });
  }

  return res.status(500).json({ 
    error: error.message || "Internal server error" 
  });
}

// Rate limiting helper (simple implementation)
const requestCounts = new Map();

export function checkRateLimit(identifier, limit = 100, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;

  if (!requestCounts.has(identifier)) {
    requestCounts.set(identifier, []);
  }

  const requests = requestCounts.get(identifier);
  
  // Remove old requests outside the window
  const recentRequests = requests.filter(time => time > windowStart);
  
  if (recentRequests.length >= limit) {
    return false; // Rate limit exceeded
  }

  recentRequests.push(now);
  requestCounts.set(identifier, recentRequests);
  
  return true; // Within rate limit
}

// Validation helpers
export const validators = {
  email: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  password: (password) => {
    return password && password.length >= 6;
  },

  taskTitle: (title) => {
    return title && title.trim().length > 0 && title.length <= 200;
  },

  userName: (name) => {
    return name && name.trim().length > 0 && name.length <= 100;
  },

  userId: (id) => {
    return id && typeof id === "string" && id.length > 0;
  },
};

// Sanitization helper
export function sanitizeInput(input) {
  if (typeof input === "string") {
    return input
      .trim()
      .replace(/[<>]/g, "") // Remove potential HTML tags
      .substring(0, 1000); // Limit length
  }
  return input;
}

// Data formatting helpers
export const formatters = {
  task: (task) => ({
    ...task,
    dueDateFormatted: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : null,
    createdAtFormatted: new Date(task.createdAt).toLocaleDateString(),
  }),

  user: (user) => {
    const { password, ...safeUser } = user;
    return safeUser;
  },

  timestamp: (timestamp) => {
    return timestamp?.toDate?.() || new Date(timestamp);
  },
};
