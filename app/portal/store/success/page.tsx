"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function StoreSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Clear the cart regardless
    localStorage.removeItem("portal-store-cart");
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="px-4 pt-6 pb-4 max-w-lg mx-auto text-center">
        <p className="text-gray-500 mb-4">No order found.</p>
        <Link
          href="/portal/store"
          className="text-primary font-medium"
        >
          Back to Store
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 pt-12 pb-4 max-w-lg mx-auto text-center">
      {/* Green checkmark */}
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Order Confirmed!</h1>
      <p className="text-gray-500 mb-8">
        Your payment was successful. Your items will be ready for pickup.
      </p>

      <div className="space-y-3">
        <Link
          href="/portal/store"
          className="block w-full bg-primary text-white py-3 rounded-2xl font-semibold active:scale-[0.98] transition-all"
        >
          Continue Shopping
        </Link>
        <Link
          href="/portal"
          className="block w-full bg-white text-gray-700 border border-gray-200 py-3 rounded-2xl font-semibold active:scale-[0.98] transition-all"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
