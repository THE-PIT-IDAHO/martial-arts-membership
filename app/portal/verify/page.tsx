"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// One-click sign-in page for admin-sent portal access links (7-day
// magic links) and self-service login links. The POST that
// consumes the token is fired ONLY on the user clicking Continue --
// NEVER auto-fired on mount -- because email-link scanners
// (Outlook Safe Links, Gmail preview, corporate antivirus) fetch
// the URL ahead of the human and, if they render JS, would burn
// through the single-use token and hand the recipient a
// "Link Expired" page ("deactive on arrival"). Same pattern Slack,
// Notion, Vercel etc. use for magic-link verification.
export default function PortalVerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleContinue() {
    if (!token) {
      setStatus("error");
      setErrorMsg("No token provided.");
      return;
    }
    setStatus("verifying");
    try {
      const res = await fetch("/api/portal/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus("success");
        if (!data.hasPassword) {
          setTimeout(() => router.replace("/portal/set-password"), 800);
        } else {
          // Redirect to bare portal root ("/"), not "/portal" --
          // middleware rewrites "/" on the bare gym subdomain to
          // the portal home, keeping the URL bar clean.
          setTimeout(() => router.replace("/"), 800);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorMsg(data.error || "Verification failed.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Unable to connect. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {(status === "idle" || status === "verifying") && (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Sign in to your portal</h1>
            <p className="text-gray-500 mt-2">
              Tap Continue to finish signing in. Your link stays active for 7 days.
            </p>
            <button
              type="button"
              onClick={handleContinue}
              disabled={status === "verifying" || !token}
              className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primaryDark active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "verifying" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing you in…
                </>
              ) : (
                "Continue"
              )}
            </button>
            {!token && (
              <p className="text-red-600 text-sm mt-3">
                This link is missing its access token. Ask your gym to resend it.
              </p>
            )}
          </>
        )}

        {status === "success" && (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">You&apos;re in!</h1>
            <p className="text-gray-500 mt-1">Redirecting to your portal...</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900">Link Expired</h1>
            <p className="text-gray-500 mt-2">{errorMsg}</p>
            <a
              href="/login"
              className="inline-block mt-6 bg-primary text-white px-6 py-3 rounded-xl font-semibold hover:bg-primaryDark active:scale-[0.98] transition-all"
            >
              Request New Link
            </a>
          </>
        )}
      </div>
    </div>
  );
}
