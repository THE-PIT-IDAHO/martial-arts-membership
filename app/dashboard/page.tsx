// app/dashboard/page.tsx
import { AppLayout } from "@/components/app-layout";

export default function DashboardPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-600">
          Overview of your gym activity. As we build this out, you&apos;ll see
          summaries for members, attendance, tasks, and more.
        </p>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Members
            </p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-gray-500 mt-1">
              Total active members (data coming soon)
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Classes Today
            </p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-gray-500 mt-1">
              We&apos;ll connect this to your schedule.
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Open Tasks
            </p>
            <p className="mt-2 text-2xl font-bold">0</p>
            <p className="text-xs text-gray-500 mt-1">
              Tasks and reminders will show up here.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
