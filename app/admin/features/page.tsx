"use client";

import { AdminLayout } from "@/components/admin-layout";

export default function FeatureFlagsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Feature Flags</h1>
          <p className="text-sm text-gray-500">Toggle features on or off per gym or per pricing tier</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Coming Soon</h2>
          <p className="text-sm text-gray-500">Control which features are available per gym or pricing tier. For example, only Pro gyms get analytics charts or POS.</p>
        </div>
      </div>
    </AdminLayout>
  );
}
