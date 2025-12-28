import { useState } from "react";
import { useRouter } from "next/router";
import { authHelper } from "../lib/authHelper";

export default function FirebaseLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSignup, setIsSignup] = useState(false);
  const [signupData, setSignupData] = useState({
    name: "",
    department: "",
    phone: "",
  });

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { authUser, userData } = await authHelper.signin(email, password);

      if (authUser) {
        // Store user info in localStorage for client-side access
        localStorage.setItem(
          "currentUser",
          JSON.stringify({ authUser, userData })
        );

        // Redirect based on role
        if (userData?.role === "admin") {
          router.push("/admin");
        } else {
          router.push("/employee");
        }
      }
    } catch (err) {
      console.error("Login error:", err);
      setError(
        err.message.includes("user-not-found")
          ? "User not found. Please sign up first."
          : err.message.includes("wrong-password")
          ? "Incorrect password"
          : err.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!email || !password || !signupData.name) {
      setError("Email, password, and name are required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const user = await authHelper.signup(email, password, {
        name: signupData.name,
        department: signupData.department,
        phone: signupData.phone,
        role: "employee",
      });

      if (user) {
        alert("Signup successful! Please log in.");
        setIsSignup(false);
        setEmail("");
        setPassword("");
        setSignupData({ name: "", department: "", phone: "" });
      }
    } catch (err) {
      console.error("Signup error:", err);
      setError(
        err.message.includes("email-already-in-use")
          ? "Email already registered"
          : err.message || "Signup failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Task Management
        </h1>
        <p className="text-center text-gray-600 mb-8">
          {isSignup ? "Create a new account" : "Sign in to your account"}
        </p>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={isSignup ? handleSignup : handleLogin}>
          {isSignup && (
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={signupData.name}
                onChange={(e) =>
                  setSignupData({ ...signupData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                placeholder="John Doe"
                required={isSignup}
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
              required
            />
          </div>

          {isSignup && (
            <>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Department (Optional)
                </label>
                <input
                  type="text"
                  value={signupData.department}
                  onChange={(e) =>
                    setSignupData({
                      ...signupData,
                      department: e.target.value,
                    })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="e.g., Sales, Engineering"
                />
              </div>

              <div className="mb-6">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  Phone (Optional)
                </label>
                <input
                  type="tel"
                  value={signupData.phone}
                  onChange={(e) =>
                    setSignupData({ ...signupData, phone: e.target.value })
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
          >
            {loading
              ? "Please wait..."
              : isSignup
              ? "Create Account"
              : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            {isSignup ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
              className="text-blue-500 hover:text-blue-700 font-semibold"
            >
              {isSignup ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </div>

        {/* Demo Credentials Info */}
        {!isSignup && (
          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-gray-600 mb-2">
              <strong>Demo Credentials:</strong>
            </p>
            <p className="text-xs text-gray-600">
              Email: admin@task-management.com
              <br />
              Password: Admin@123
            </p>
            <p className="text-xs text-gray-500 mt-2">
              (Create your own account or use test credentials)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
