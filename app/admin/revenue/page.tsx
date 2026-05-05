"use client";

import { AdminLayout } from "@/components/admin-layout";

export default function RevenuePage() {
  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Revenue</h1>
          <p className="text-sm text-gray-500">Track monthly recurring revenue and payment history</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Coming Soon</h2>
          <p className="text-sm text-gray-500">Revenue tracking will be available once payment processing (Stripe) is integrated.</p>
          <div className="mt-6 grid grid-cols-3 gap-4 max-w-md mx-auto">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">MRR</p>
              <p className="text-lg font-bold text-gray-300">$0</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Active Subs</p>
              <p className="text-lg font-bold text-gray-300">0</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Churn</p>
              <p className="text-lg font-bold text-gray-300">0%</p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
