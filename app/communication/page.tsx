"use client";

import { AppLayout } from "@/components/app-layout";
import DojoBoardTab from "@/components/communication/DojoBoardTab";

export default function DojoBoardPage() {
  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dojo Board</h1>
        </div>
        <DojoBoardTab />
      </div>
    </AppLayout>
  );
}
