// ...existing code...
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../lib/FirebaseClient";
import { doc, getDoc } from "firebase/firestore";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      const user = userCred.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const role = userData.role;

        if (role === "admin") {
          router.push("/admin");
        } else {
          router.push("/employee");
        }
      } else {
        setError("No user data found in Firestore.");
      }
    } catch (err) {
      setError(err?.message || "Login failed.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* Logo + Brand */}
          <div className="inline-flex items-center gap-3">
            <div className="bg-white/10 p-3 rounded-md shadow-lg backdrop-blur-sm">
              {/* simple Haier-style H icon (SVG) */}
              <svg
                width="44"
                height="44"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect width="48" height="48" rx="10" fill="white" fillOpacity="0.06" />
                <path
                  d="M14 12v24M34 12v24M14 24h20"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              <div className="text-white text-2xl font-extrabold tracking-wider drop-shadow">
                Haier
              </div>
              <div className="text-white/80 text-sm -mt-1">Task Management</div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          aria-label="Login form"
          className="bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-2xl"
        >
          <h2 className="text-2xl font-semibold mb-4 text-center text-slate-700">
            Welcome back
          </h2>

          <input
            type="email"
            placeholder="Email"
            className="border p-3 w-full mb-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
          />
          <input
            type="password"
            placeholder="Password"
            className="border p-3 w-full mb-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            type="submit"
            className="bg-blue-600 text-white w-full py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
// ...existing code...