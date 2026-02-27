"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

interface Submission {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth?: string;
  planName?: string;
  selectedPlanId?: string;
  waiverSigned: boolean;
  status: string;
  notes?: string;
  memberId?: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
};

export default function EnrollmentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");
  const [processingId, setProcessingId] = useState<string | null>(null);

  function loadSubmissions() {
    fetch("/api/enrollment-submissions")
      .then((r) => r.json())
      .then((data) => {
        setSubmissions(data);
        setLoading(false);
      });
  }

  useEffect(() => { loadSubmissions(); }, []);

  async function handleAction(id: string, action: "approve" | "reject") {
    if (action === "reject" && !confirm("Reject this enrollment?")) return;

    setProcessingId(id);
    try {
      const res = await fetch(`/api/enrollment-submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        loadSubmissions();
      }
    } catch {
      // ignore
    } finally {
      setProcessingId(null);
    }
  }

  const filtered = filter === "ALL"
    ? submissions
    : submissions.filter((s) => s.status === filter);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Online Enrollments</h1>
          <div className="flex gap-1">
            {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-full ${
                  filter === f ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-gray-500">Loading...</p>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            No {filter.toLowerCase()} enrollments.
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">
                        {s.firstName} {s.lastName}
                      </p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[s.status] || "bg-gray-100"}`}>
                        {s.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{s.email}</p>
                    {s.phone && <p className="text-sm text-gray-500">{s.phone}</p>}
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-400">
                      {s.planName && <span>Plan: {s.planName}</span>}
                      <span>Waiver: {s.waiverSigned ? "Signed" : "Not signed"}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {s.status === "PENDING" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(s.id, "approve")}
                        disabled={processingId === s.id}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {processingId === s.id ? "..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleAction(s.id, "reject")}
                        disabled={processingId === s.id}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {s.status === "APPROVED" && s.memberId && (
                    <a href={`/members/${s.memberId}`} className="text-xs text-blue-600 hover:underline">
                      View Member
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
