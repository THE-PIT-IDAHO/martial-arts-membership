"use client";

import { AdminLayout } from "@/components/admin-layout";

export default function EmailCampaignsPage() {
  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Email Campaigns</h1>
          <p className="text-sm text-gray-500">Send marketing emails to leads and gym owners</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 mb-2">Coming Soon</h2>
          <p className="text-sm text-gray-500">Create and send targeted email campaigns to leads who haven&apos;t signed up, or nurture existing gym owners with tips and feature announcements.</p>
        </div>
      </div>
    </AdminLayout>
  );
}
