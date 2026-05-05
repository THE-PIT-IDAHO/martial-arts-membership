"use client";

import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin-layout";

type Reply = { id: string; authorName: string; content: string; isStaff: boolean; createdAt: string };
type Ticket = { id: string; clientName: string; userName: string | null; subject: string; description: string; status: string; priority: string; replies: Reply[]; createdAt: string };

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<"all" | "OPEN" | "RESOLVED">("all");

  async function load() {
    try { const res = await fetch("/api/admin/support"); if (res.ok) { const d = await res.json(); setTickets(d.tickets || []); } } catch {} finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function sendReply(ticketId: string) {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, reply: replyText }) });
      setReplyText("");
      load();
    } catch {} finally { setSending(false); }
  }

  async function updateStatus(ticketId: string, status: string) {
    await fetch("/api/admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId, status }) });
    load();
  }

  const filtered = filter === "all" ? tickets : tickets.filter(t => t.status === filter);
  const statusColors: Record<string, string> = { OPEN: "bg-yellow-100 text-yellow-700", IN_PROGRESS: "bg-blue-100 text-blue-700", RESOLVED: "bg-green-100 text-green-700", CLOSED: "bg-gray-100 text-gray-500" };

  return (
    <AdminLayout>
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-bold">Support Tickets</h1>
          <p className="text-sm text-gray-500">View and respond to gym owner support requests</p>
        </div>

        <div className="flex gap-2">
          {(["all", "OPEN", "RESOLVED"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 text-xs font-semibold ${filter === f ? "bg-primary text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
              {f === "all" ? "All" : f === "OPEN" ? "Open" : "Resolved"} {f !== "all" && `(${tickets.filter(t => t.status === f).length})`}
            </button>
          ))}
        </div>

        {loading ? <p className="text-sm text-gray-500">Loading...</p> : filtered.length === 0 ? (
          <p className="text-sm text-gray-500">No support tickets{filter !== "all" ? ` with status "${filter}"` : ""}.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map(ticket => (
              <div key={ticket.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">{ticket.subject}</h3>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusColors[ticket.status] || statusColors.OPEN}`}>{ticket.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">{ticket.clientName} {ticket.userName && `\u2022 ${ticket.userName}`} &middot; {new Date(ticket.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ticket.replies.length > 0 && <span className="text-xs text-gray-400">{ticket.replies.length} replies</span>}
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedId === ticket.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {expandedId === ticket.id && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    <p className="text-sm text-gray-700 mb-3">{ticket.description}</p>

                    {ticket.replies.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {ticket.replies.map(r => (
                          <div key={r.id} className={`rounded-md p-2 text-xs ${r.isStaff ? "bg-primary/10 border border-primary/20" : "bg-gray-50 border border-gray-200"}`}>
                            <p className="font-semibold text-gray-700">{r.authorName} {r.isStaff && <span className="text-primary">(Staff)</span>}</p>
                            <p className="text-gray-600 mt-0.5">{r.content}</p>
                            <p className="text-gray-400 mt-0.5">{new Date(r.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 mb-2">
                      <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write a reply..." className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" onKeyDown={e => { if (e.key === "Enter") sendReply(ticket.id); }} />
                      <button onClick={() => sendReply(ticket.id)} disabled={sending || !replyText.trim()} className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50">Reply</button>
                    </div>
                    <div className="flex gap-2">
                      {ticket.status !== "RESOLVED" && <button onClick={() => updateStatus(ticket.id, "RESOLVED")} className="rounded-md border border-green-300 px-2 py-1 text-xs font-semibold text-green-700 hover:bg-green-50">Resolve</button>}
                      {ticket.status !== "OPEN" && <button onClick={() => updateStatus(ticket.id, "OPEN")} className="rounded-md border border-yellow-300 px-2 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-50">Reopen</button>}
                      {ticket.status !== "CLOSED" && <button onClick={() => updateStatus(ticket.id, "CLOSED")} className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50">Close</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
