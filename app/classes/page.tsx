import { AppLayout } from "@/components/app-layout";

export default function ClassesPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Classes & Schedule</h1>
        <p className="text-sm text-gray-600">
          Here you&apos;ll manage weekly class schedules, special events, and
          connect classes to attendance tracking.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Class schedule builder and calendar integration will go here.
        </div>
      </div>
    </AppLayout>
  );
}
