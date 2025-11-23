import { AppLayout } from "@/components/app-layout";

export default function ReportsPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-sm text-gray-600">
          Attendance, membership trends, revenue summaries, and more will be
          available here.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Reporting widgets and export options coming soon.
        </div>
      </div>
    </AppLayout>
  );
}
