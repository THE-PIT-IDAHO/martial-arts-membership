import { AppLayout } from "@/components/app-layout";

export default function TasksPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <p className="text-sm text-gray-600">
          Use this section to keep track of follow-ups, phone calls, billing
          issues, and admin work.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Task list and reminder system will be added here.
        </div>
      </div>
    </AppLayout>
  );
}
