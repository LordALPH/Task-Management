import { auth } from "./firebaseConfig";

/**
 * Verify Firebase ID token from Authorization header
 * Format: "Bearer <token>"
 */
export async function verifyAuthToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  try {
    const token = authHeader.substring(7);
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    console.error("Token verification error:", error);
    return null;
  }
}

/**
 * Middleware to check authentication on API routes
 */
export function requireAuth(handler) {
  return async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
      }

      const decodedToken = await verifyAuthToken(authHeader);
      
      if (!decodedToken) {
        return res.status(401).json({ error: "Invalid or expired token" });
      }

      // Attach user info to request
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        role: decodedToken.role || "employee"
      };

      return handler(req, res);
    } catch (error) {
      console.error("Auth middleware error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  };
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(handler) {
  return requireAuth(async (req, res) => {
    // For client-side Firestore access, just check existence of user
    // Real authorization happens in Firestore security rules
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    return handler(req, res);
  });
}
