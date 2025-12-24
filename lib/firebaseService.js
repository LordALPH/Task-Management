import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  setDoc
} from "firebase/firestore";
import { db } from "./firebaseConfig";

// Tasks Collection Functions
export const tasksService = {
  // Create a new task
  createTask: async (taskData) => {
    try {
      const docRef = await addDoc(collection(db, "tasks"), {
        ...taskData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        status: taskData.status || "pending",
      });
      return docRef.id;
    } catch (error) {
      console.error("Error creating task:", error);
      throw error;
    }
  },

  // Get all tasks
  getAllTasks: async () => {
    try {
      const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const tasks = [];
      querySnapshot.forEach((doc) => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return tasks;
    } catch (error) {
      console.error("Error getting tasks:", error);
      throw error;
    }
  },

  // Get tasks by employee
  getTasksByEmployee: async (employeeId) => {
    try {
      const q = query(
        collection(db, "tasks"),
        where("assignedTo", "==", employeeId),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const tasks = [];
      querySnapshot.forEach((doc) => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return tasks;
    } catch (error) {
      console.error("Error getting tasks for employee:", error);
      throw error;
    }
  },

  // Get task by ID
  getTaskById: async (taskId) => {
    try {
      const docRef = doc(db, "tasks", taskId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error getting task:", error);
      throw error;
    }
  },

  // Update task
  updateTask: async (taskId, updateData) => {
    try {
      const docRef = doc(db, "tasks", taskId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: Timestamp.now(),
      });
      return taskId;
    } catch (error) {
      console.error("Error updating task:", error);
      throw error;
    }
  },

  // Delete task
  deleteTask: async (taskId) => {
    try {
      await deleteDoc(doc(db, "tasks", taskId));
      return taskId;
    } catch (error) {
      console.error("Error deleting task:", error);
      throw error;
    }
  },

  // Get tasks by status
  getTasksByStatus: async (status) => {
    try {
      const q = query(
        collection(db, "tasks"),
        where("status", "==", status),
        orderBy("createdAt", "desc")
      );
      const querySnapshot = await getDocs(q);
      const tasks = [];
      querySnapshot.forEach((doc) => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return tasks;
    } catch (error) {
      console.error("Error getting tasks by status:", error);
      throw error;
    }
  },

  // Bulk create tasks
  bulkCreateTasks: async (tasksArray) => {
    try {
      const batch = writeBatch(db);
      const taskIds = [];
      
      tasksArray.forEach((task) => {
        const docRef = doc(collection(db, "tasks"));
        batch.set(docRef, {
          ...task,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          status: task.status || "pending",
        });
        taskIds.push(docRef.id);
      });
      
      await batch.commit();
      return taskIds;
    } catch (error) {
      console.error("Error bulk creating tasks:", error);
      throw error;
    }
  },
};

// Users Collection Functions
export const usersService = {
  // Create a new user
  createUser: async (userData) => {
    try {
      const docRef = await addDoc(collection(db, "users"), {
        ...userData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        role: userData.role || "employee",
      });
      return docRef.id;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  },

  // Get all users
  getAllUsers: async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "users"));
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error("Error getting users:", error);
      throw error;
    }
  },

  // Get users by role
  getUsersByRole: async (role) => {
    try {
      const q = query(collection(db, "users"), where("role", "==", role));
      const querySnapshot = await getDocs(q);
      const users = [];
      querySnapshot.forEach((doc) => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return users;
    } catch (error) {
      console.error("Error getting users by role:", error);
      throw error;
    }
  },

  // Get user by ID
  getUserById: async (userId) => {
    try {
      const docRef = doc(db, "users", userId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      } else {
        return null;
      }
    } catch (error) {
      console.error("Error getting user:", error);
      throw error;
    }
  },

  // Get user by email
  getUserByEmail: async (email) => {
    try {
      const q = query(collection(db, "users"), where("email", "==", email));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...doc.data() };
      }
      return null;
    } catch (error) {
      console.error("Error getting user by email:", error);
      throw error;
    }
  },

  // Update user
  updateUser: async (userId, updateData) => {
    try {
      const docRef = doc(db, "users", userId);
      await updateDoc(docRef, {
        ...updateData,
        updatedAt: Timestamp.now(),
      });
      return userId;
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  },

  // Delete user
  deleteUser: async (userId) => {
    try {
      await deleteDoc(doc(db, "users", userId));
      return userId;
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
    }
  },

  // Bulk create users
  bulkCreateUsers: async (usersArray) => {
    try {
      const batch = writeBatch(db);
      const userIds = [];
      
      usersArray.forEach((user) => {
        const docRef = doc(collection(db, "users"));
        batch.set(docRef, {
          ...user,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          role: user.role || "employee",
        });
        userIds.push(docRef.id);
      });
      
      await batch.commit();
      return userIds;
    } catch (error) {
      console.error("Error bulk creating users:", error);
      throw error;
    }
  },
};

// Analytics/Assignments Collection Functions
export const assignmentsService = {
  // Create assignment
  createAssignment: async (assignmentData) => {
    try {
      const docRef = await addDoc(collection(db, "assignments"), {
        ...assignmentData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return docRef.id;
    } catch (error) {
      console.error("Error creating assignment:", error);
      throw error;
    }
  },

  // Get assignments for employee
  getAssignmentsForEmployee: async (employeeId) => {
    try {
      const q = query(
        collection(db, "assignments"),
        where("employeeId", "==", employeeId)
      );
      const querySnapshot = await getDocs(q);
      const assignments = [];
      querySnapshot.forEach((doc) => {
        assignments.push({ id: doc.id, ...doc.data() });
      });
      return assignments;
    } catch (error) {
      console.error("Error getting assignments:", error);
      throw error;
    }
  },

  // Update assignment progress
  updateAssignmentProgress: async (assignmentId, progressData) => {
    try {
      const docRef = doc(db, "assignments", assignmentId);
      await updateDoc(docRef, {
        ...progressData,
        updatedAt: Timestamp.now(),
      });
      return assignmentId;
    } catch (error) {
      console.error("Error updating assignment:", error);
      throw error;
    }
  },
};

// Activity Logs
export const activityLogsService = {
  // Log activity
  logActivity: async (activityData) => {
    try {
      await addDoc(collection(db, "activityLogs"), {
        ...activityData,
        timestamp: Timestamp.now(),
      });
    } catch (error) {
      console.error("Error logging activity:", error);
      throw error;
    }
  },

  // Get activity logs
  getActivityLogs: async (limit = 100) => {
    try {
      const q = query(
        collection(db, "activityLogs"),
        orderBy("timestamp", "desc")
      );
      const querySnapshot = await getDocs(q);
      const logs = [];
      querySnapshot.forEach((doc) => {
        logs.push({ id: doc.id, ...doc.data() });
      });
      return logs.slice(0, limit);
    } catch (error) {
      console.error("Error getting activity logs:", error);
      throw error;
    }
  },
};

// KPI Scores
export const kpiService = {
  // Fetch all KPI scores keyed by document id
  getAllScores: async () => {
    try {
      const snapshot = await getDocs(collection(db, "kpi"));
      const scores = {};
      snapshot.forEach((docSnap) => {
        scores[docSnap.id] = { id: docSnap.id, ...docSnap.data() };
      });
      return scores;
    } catch (error) {
      console.error("Error getting KPI scores:", error);
      throw error;
    }
  },

  // Fetch all KPI scores for a user ordered by recency
  getScoresForUser: async (userId) => {
    try {
      const q = query(
        collection(db, "kpi"),
        where("userId", "==", userId),
        orderBy("year", "desc"),
        orderBy("month", "desc")
      );
      const snapshot = await getDocs(q);
      const scores = [];
      snapshot.forEach((docSnap) => {
        scores.push({ id: docSnap.id, ...docSnap.data() });
      });
      return scores;
    } catch (error) {
      console.error("Error getting KPI scores for user:", error);
      throw error;
    }
  },

  // Create a monthly KPI score (one per user/month)
  createMonthlyScore: async ({ userId, userName, month, year, score, addedBy }) => {
    const docId = `${userId}_${year}_${month}`;
    const kpiDocRef = doc(db, "kpi", docId);

    try {
      const existing = await getDoc(kpiDocRef);
      if (existing.exists()) {
        throw new Error(`Score already exists for ${userName} in ${month} ${year}`);
      }

      await setDoc(kpiDocRef, {
        userId,
        userName,
        month,
        year,
        score,
        addedBy,
        addedAt: Timestamp.now(),
      });

      return docId;
    } catch (error) {
      console.error("Error saving KPI score:", error);
      throw error;
    }
  },
};
