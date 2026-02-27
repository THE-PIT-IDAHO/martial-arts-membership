import { AppLayout } from "@/components/app-layout";

export default function ProgramsPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Programs / Styles</h1>
          <p className="text-sm text-gray-600">
            Each gym can define its own programs (Hawaiian Kempo, BJJ, Kids
            Classes, etc.) and connect them to memberships and classes.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          Program management UI coming soon.
        </div>
      </div>
    </AppLayout>
  );
}
