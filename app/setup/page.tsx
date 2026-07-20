"use client";

// /setup -- dedicated home for the setup checklist. The same card is
// no longer pinned to the dashboard; owners come here when they want
// to review or resume gym configuration. Because this page is the
// checklist's real home, we pass alwaysShow so it renders even when
// every task is done (so the owner can see the full completed list
// and un-skip anything if they change their mind).

import { AppLayout } from "@/components/app-layout";
import { SetupChecklist } from "@/components/setup-checklist";

export default function SetupPage() {
  return (
    <AppLayout>
      <div className="space-y-4 p-4 sm:p-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Setup</h1>
          <p className="text-sm text-gray-600">
            Work through these to get your gym running. Each row jumps to the page where you
            can add it, and ticks off automatically once the data exists.
          </p>
        </div>
        <SetupChecklist alwaysShow />
      </div>
    </AppLayout>
  );
}
