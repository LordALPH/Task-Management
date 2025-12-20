import { auth } from "./firebaseConfig";
import { usersService } from "./firebaseService";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";

// Auth Helper Functions
export const authHelper = {
  // Sign up new user
  signup: async (email, password, userData) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Update profile
      await updateProfile(user, {
        displayName: userData.name,
      });

      // Store user data in Firestore with correct UID
      const { doc, setDoc } = await import("firebase/firestore");
      const { db } = await import("./firebaseConfig");
      
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        uid: user.uid,
        email: user.email,
        displayName: userData.name,
        role: userData.role || "employee",
        department: userData.department || "",
        phone: userData.phone || "",
        profilePicture: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return {
        uid: user.uid,
        email: user.email,
        displayName: userData.name,
        role: userData.role || "employee"
      };
    } catch (error) {
      console.error("Signup error:", error);
      throw error;
    }
  },

  // Sign in existing user
  signin: async (email, password) => {
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const authUser = userCredential.user;

      // Get user data from Firestore using UID
      try {
        const userData = await usersService.getUserById(authUser.uid);
        return {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName || userData?.displayName,
          role: userData?.role || "employee",
          ...userData
        };
      } catch (error) {
        console.warn("User data not found in Firestore, returning basic info");
        return {
          uid: authUser.uid,
          email: authUser.email,
          displayName: authUser.displayName,
          role: "employee"
        };
      }
    } catch (error) {
      console.error("Signin error:", error);
      throw error;
    }
  },

  // Sign out
  signout: async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Signout error:", error);
      throw error;
    }
  },

  // Get current user
  getCurrentUser: () => {
    return new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
        unsubscribe();
        if (authUser) {
          try {
            const userData = await usersService.getUserById(authUser.uid);
            resolve({
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName || userData?.displayName,
              role: userData?.role || "employee",
              ...userData
            });
          } catch (error) {
            console.warn("User data not found, using basic auth info");
            // Return minimal user data if fetch fails (user might not be in DB yet)
            resolve({
              uid: authUser.uid,
              email: authUser.email,
              displayName: authUser.displayName,
              role: "employee"
            });
          }
        } else {
          resolve(null);
        }
      }, reject);
    });
  },

  // Update user profile
  updateUserProfile: async (userId, updates) => {
    try {
      // Update Firebase Auth profile
      const user = auth.currentUser;
      if (user) {
        await updateProfile(user, {
          displayName: updates.name || user.displayName,
        });
      }

      // Update Firestore user document
      await usersService.updateUser(userId, updates);
      return true;
    } catch (error) {
      console.error("Update profile error:", error);
      throw error;
    }
  },

  // Check if user is admin
  isAdmin: async (userId) => {
    try {
      const user = await usersService.getUserById(userId);
      return user && user.role === "admin";
    } catch (error) {
      console.error("Error checking admin status:", error);
      return false;
    }
  },
};
