import { AppLayout } from "@/components/app-layout";

export default function CalendarPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-gray-600">
          Visual view of classes, events, tests, and important gym dates.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          We&apos;ll add a calendar component and connect it to classes and
          events.
        </div>
      </div>
    </AppLayout>
  );
}
