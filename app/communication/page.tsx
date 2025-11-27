import { AppLayout } from "@/components/app-layout";

export default function CommunicationPage() {
  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Communication</h1>
        <p className="text-sm text-gray-600">
          This will be your hub for messages to members: email/text templates,
          announcements, and follow-up automation.
        </p>
        <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-500">
          We&apos;ll later decide what channels you want (email, SMS, in-app
          notifications) and hook this to your member database.
        </div>
      </div>
    </AppLayout>
  );
}
