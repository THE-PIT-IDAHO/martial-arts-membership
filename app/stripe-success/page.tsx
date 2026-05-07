"use client";

import { useEffect } from "react";

export default function StripeSuccessPage() {
  useEffect(() => {
    // If opened in a popup, close it after a brief delay
    if (window.opener) {
      window.close();
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white">
      <div className="text-center p-8">
        <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <h1 className="text-lg font-bold text-gray-900">Card Added Successfully</h1>
        <p className="text-sm text-gray-500 mt-1">You can close this window.</p>
      </div>
    </div>
  );
}
