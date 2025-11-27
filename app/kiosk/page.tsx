import { AppLayout } from "@/components/app-layout";

export default function KioskPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Kiosk Mode</h1>
        <p className="text-sm text-gray-600">
          This will be the check-in screen for members to log attendance at the
          front desk or on a tablet.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          We&apos;ll build a full-screen kiosk layout with big buttons and
          simple flows.
        </div>
      </div>
    </AppLayout>
  );
}
