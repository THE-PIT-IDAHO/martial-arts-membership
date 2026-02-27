"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginMode, setLoginMode] = useState<"magic" | "password">("magic");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [devLoginUrl, setDevLoginUrl] = useState("");

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.devLoginUrl) {
          setDevLoginUrl(data.devLoginUrl);
        }
        setSent(true);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } catch {
      setError("Unable to connect. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/portal/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await res.json();

      if (res.ok && data.session) {
        router.push("/portal");
      } else if (data.error) {
        setError(data.error);
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Unable to connect. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Dojo Storm" className="w-16 h-16 mx-auto mb-4 rounded-2xl object-contain" />
          <div className="brand-dynamic-dark leading-none">
            <h1 className="text-2xl font-black tracking-wider uppercase">
              Dojo <span className="italic">Storm</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] font-semibold mt-0.5">Software</p>
          </div>
          <p className="text-gray-500 mt-1">Member Portal</p>
        </div>

        {sent ? (
          /* Magic link sent state */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-500 text-sm mb-4">
              We sent a sign-in link to <strong className="text-gray-700">{email}</strong>
            </p>
            <p className="text-gray-400 text-xs">The link expires in 15 minutes.</p>
            {devLoginUrl && (
              <a
                href={devLoginUrl}
                className="inline-block mt-4 bg-primary text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-primaryDark active:scale-[0.98] transition-all"
              >
                Dev: Sign In Now
              </a>
            )}
            <button
              onClick={() => { setSent(false); setEmail(""); setDevLoginUrl(""); }}
              className="mt-4 block mx-auto text-primary text-sm font-medium hover:underline"
            >
              Use a different email
            </button>
          </div>
        ) : loginMode === "magic" ? (
          /* Magic link form */
          <form onSubmit={handleMagicLink} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
            />

            {error && (
              <p className="text-red-600 text-sm mt-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full mt-4 bg-primary text-white py-3 rounded-xl font-semibold text-base hover:bg-primaryDark active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending..." : "Send Sign-In Link"}
            </button>

            <p className="text-gray-400 text-xs text-center mt-4">
              We&apos;ll email you a magic link to sign in — no password needed.
            </p>

            <button
              type="button"
              onClick={() => { setError(""); setLoginMode("password"); }}
              className="w-full mt-3 text-primary text-sm font-medium hover:underline"
            >
              Sign in with password instead
            </button>
          </form>
        ) : (
          /* Password login form */
          <form onSubmit={handlePasswordLogin} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <label htmlFor="email-pw" className="block text-sm font-medium text-gray-700 mb-2">
              Email address
            </label>
            <input
              id="email-pw"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
              autoComplete="email"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
            />

            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mt-3 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-colors"
            />

            {error && (
              <p className="text-red-600 text-sm mt-2">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full mt-4 bg-primary text-white py-3 rounded-xl font-semibold text-base hover:bg-primaryDark active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>

            <p className="text-gray-400 text-xs text-center mt-4">
              Forgot your password? Ask your instructor to send you a reset link.
            </p>

            <button
              type="button"
              onClick={() => { setError(""); setLoginMode("magic"); }}
              className="w-full mt-3 text-primary text-sm font-medium hover:underline"
            >
              Sign in with magic link instead
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
