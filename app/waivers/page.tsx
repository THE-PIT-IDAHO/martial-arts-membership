import { AppLayout } from "@/components/app-layout";

export default function WaiversPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Waivers</h1>
        <p className="text-sm text-gray-600">
          A central place to manage liability waivers and other signed
          documents for members.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          We can later add digital waiver templates, e-sign tracking, and a
          quick way to see who still needs to sign.
        </div>
      </div>
    </AppLayout>
  );
}
