"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../lib/FirebaseClient"; // ensure you export db from FirebaseClient

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("employee"); // default role
  const [error, setError] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    try {
      // 1️⃣ Create a user in Firebase Authentication
      const userCred = await createUserWithEmailAndPassword(auth, email, password);

      // 2️⃣ Save user details in Firestore
      await setDoc(doc(db, "users", userCred.user.uid), {
        email,
        role,
        createdAt: new Date(),
      });

      // 3️⃣ Redirect based on role
      if (role === "admin") router.push("/admin");
      else router.push("/employee");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSignup}
        className="bg-white p-6 rounded-lg shadow-md w-80"
      >
        <h2 className="text-xl font-semibold mb-4 text-center">Sign Up</h2>

        <input
          type="email"
          placeholder="Email"
          className="border p-2 w-full mb-2 rounded"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          className="border p-2 w-full mb-2 rounded"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {/* Role Selection */}
        <select
          className="border p-2 w-full mb-2 rounded"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="employee">Employee</option>
          <option value="admin">Admin</option>
        </select>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <button
          type="submit"
          className="bg-green-600 text-white w-full py-2 rounded hover:bg-green-700"
        >
          Sign Up
        </button>
      </form>
    </div>
  );
}
