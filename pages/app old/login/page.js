"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/FirebaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const btnRef = useRef(null);

  // If already signed-in, redirect according to role
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          const role = data?.role ?? "employee";
          if (role === "admin") router.replace("/admin");
          else router.replace("/employee");
        } else {
          // No Firestore doc -> sign out and show error
          await signOut(auth);
        }
      } catch (err) {
        console.error("Auth state redirect error:", err);
      }
    });
    return () => unsub();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const em = (email || "").trim();
    const pw = (password || "").trim();

    if (!em || !pw) {
      setError("Please enter email and password.");
      return;
    }

    // ripple visual for button
    createRipple();

    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, em, pw);
      const uid = cred.user?.uid;
      if (!uid) throw new Error("No user id returned from Firebase.");

      const userRef = doc(db, "users", uid);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        // No role info -> sign out and show message
        await signOut(auth);
        throw new Error("No user data found. Contact admin.");
      }

      const data = snap.data();
      const role = (data?.role || "employee").toLowerCase();

      if (role === "admin") {
        router.replace("/admin");
      } else {
        router.replace("/employee");
      }
    } catch (err) {
      console.error("Login failed:", err);
      // Provide helpful message for common Firebase errors
      const msg =
        err?.code === "auth/wrong-password"
          ? "Wrong password."
          : err?.code === "auth/user-not-found"
          ? "No user found with this email."
          : err?.message || "Login failed.";
      setError(msg);
      setLoading(false);
    }
  }

  function createRipple(e) {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    const size = Math.max(rect.width, rect.height) * 1.2;
    ripple.style.width = ripple.style.height = size + "px";
    const clientX = e && e.clientX ? e.clientX : rect.left + rect.width / 2;
    const clientY = e && e.clientY ? e.clientY : rect.top + rect.height / 2;
    ripple.style.left = clientX - rect.left - size / 2 + "px";
    ripple.style.top = clientY - rect.top - size / 2 + "px";
    ripple.className = "ripple";
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-600 p-6">
      <div className="w-full max-w-md relative z-10">
        <div className="mb-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white/10 p-4 rounded-full shadow-sm">
              <svg
                width="56"
                height="56"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect width="48" height="48" rx="8" fill="white" fillOpacity="0.08" />
                <path
                  d="M14 12v24M34 12v24M14 24h20"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div className="text-center">
              <div className="text-white text-3xl font-extrabold tracking-wide">Haier</div>
              <div className="text-white/90 text-sm -mt-1">Task Management</div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white/6 rounded-2xl p-6 shadow-lg backdrop-blur-sm"
        >
          <h2 className="text-white text-xl font-semibold mb-4 text-center">Sign in</h2>

          <label className="block text-white/80 text-sm mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-4 px-4 py-3 rounded-lg bg-transparent border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label className="block text-white/80 text-sm mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full mb-4 px-4 py-3 rounded-lg bg-transparent border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-sky-400"
            placeholder="Your password"
            autoComplete="current-password"
            required
          />

          {error && <div className="text-red-400 text-sm mb-3">{error}</div>}

          <button
            ref={btnRef}
            type="submit"
            onMouseDown={(e) => createRipple(e)}
            disabled={loading}
            className="relative overflow-hidden w-full rounded-lg bg-sky-500 hover:bg-sky-600 text-white py-3 font-medium transition"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              "Sign in"
            )}
          </button>
        </form>
      </div>

      <style jsx>{`
        .ripple {
          position: absolute;
          border-radius: 50%;
          transform: scale(0);
          background: rgba(255, 255, 255, 0.35);
          animation: ripple 700ms linear;
          pointer-events: none;
        }
        @keyframes ripple {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}