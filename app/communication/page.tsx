"use client";

import { useState } from "react";
import { AppLayout } from "@/components/app-layout";
import DojoBoardTab from "@/components/communication/DojoBoardTab";
import EmailTemplatesTab from "@/components/communication/EmailTemplatesTab";

type Tab = "board" | "templates";

export default function CommunicationPage() {
  const [activeTab, setActiveTab] = useState<Tab>("board");

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Communication</h1>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("board")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "board"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Dojo Board
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "templates"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Email Templates
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "board" && <DojoBoardTab />}
        {activeTab === "templates" && <EmailTemplatesTab />}
      </div>
    </AppLayout>
  );
}
