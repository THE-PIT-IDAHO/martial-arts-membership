"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";

type Contract = {
  id: string;
  planName: string;
  fileName: string | null;
  signedAt: string;
  member: { id: string; firstName: string; lastName: string };
};

export default function ContractsPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingPdf, setViewingPdf] = useState<{ url: string; title: string } | null>(null);
  const [loadingPdf, setLoadingPdf] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    loadContracts();
  }, []);

  async function loadContracts() {
    try {
      const res = await fetch("/api/contracts");
      if (res.ok) {
        const data = await res.json();
        setContracts(data.contracts || []);
      }
    } catch (err) {
      console.error("Error loading contracts:", err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = searchQuery.trim()
    ? contracts.filter(c => {
        const name = `${c.member.firstName} ${c.member.lastName}`.toLowerCase();
        const q = searchQuery.toLowerCase();
        return name.includes(q) || c.planName.toLowerCase().includes(q);
      })
    : contracts;

  async function viewPdf(contract: Contract) {
    setLoadingPdf(contract.id);
    try {
      const res = await fetch(`/api/contracts/${contract.id}`);
      if (!res.ok) { alert("Failed to load contract"); return; }
      const data = await res.json();
      if (!data.contract?.pdfData) { alert("No PDF stored for this contract"); return; }
      const pdfUrl = `data:application/pdf;base64,${data.contract.pdfData}`;
      const memberName = `${contract.member.firstName} ${contract.member.lastName}`;
      setViewingPdf({ url: pdfUrl, title: contract.fileName || `${memberName} - ${contract.planName}.pdf` });
    } catch {
      alert("Failed to load contract PDF");
    } finally {
      setLoadingPdf(null);
    }
  }

  async function resendEmail(contract: Contract) {
    setResending(contract.id);
    try {
      const res = await fetch(`/api/contracts/${contract.id}`, { method: "POST" });
      if (res.ok) {
        alert("Contract emailed successfully");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to send email");
      }
    } catch {
      alert("Failed to send email");
    } finally {
      setResending(null);
    }
  }

  async function downloadPdf(contract: Contract) {
    try {
      const res = await fetch(`/api/contracts/${contract.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.contract?.pdfData) { alert("No PDF stored"); return; }
      const memberName = `${contract.member.firstName} ${contract.member.lastName}`;
      const fileName = contract.fileName || `${memberName} - ${contract.planName}.pdf`;
      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${data.contract.pdfData}`;
      link.download = fileName;
      link.click();
    } catch {
      alert("Failed to download");
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Contracts</h1>
            <p className="text-sm text-gray-600">All signed membership and service contracts.</p>
          </div>
          <span className="text-xs text-gray-400">{contracts.length} total</span>
        </div>

        {/* Search */}
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by member name or plan..."
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Table */}
        {loading ? (
          <p className="text-sm text-gray-500">Loading contracts...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">No contracts found.</p>
            <p className="text-xs text-gray-400 mt-1">Contracts are created when members sign membership or service agreements during checkout.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Member</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Plan / Service</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Date Signed</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link href={`/members/${c.member.id}`} className="text-primary hover:underline text-xs font-medium">
                        {c.member.firstName} {c.member.lastName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{c.planName}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{new Date(c.signedAt).toLocaleDateString()}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => viewPdf(c)}
                          disabled={loadingPdf === c.id}
                          className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                        >
                          {loadingPdf === c.id ? "..." : "View"}
                        </button>
                        <button
                          onClick={() => downloadPdf(c)}
                          className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => resendEmail(c)}
                          disabled={resending === c.id}
                          className="rounded-md border border-gray-300 px-2 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                          {resending === c.id ? "Sending..." : "Email"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      {viewingPdf && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-3 border-b bg-gray-50 rounded-t-lg">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{viewingPdf.title}</h3>
              <div className="flex items-center gap-2">
                <a
                  href={viewingPdf.url}
                  download={viewingPdf.title}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Download
                </a>
                <button
                  onClick={() => setViewingPdf(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe src={viewingPdf.url} className="w-full h-full border-0" />
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
