"use client";

import { useState, useEffect } from "react";
import { AppLayout } from "@/components/app-layout";
import EmailTemplatesTab from "@/components/communication/EmailTemplatesTab";

type Tab = "compose" | "templates";
type Member = {
  id: string; firstName: string; lastName: string; email: string | null; status: string;
  stylesNotes?: string | null;
  memberships?: Array<{ membershipPlan: { id: string; name: string }; status: string }>;
};
type Style = { id: string; name: string; ranks: { id: string; name: string; order: number }[] };
type MembershipPlan = { id: string; name: string };

export default function CommunicationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("compose");

  // Compose state
  const [members, setMembers] = useState<Member[]>([]);
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [recipientMode, setRecipientMode] = useState<"all" | "style" | "status" | "membership" | "specific">("all");
  const [membershipPlans, setMembershipPlans] = useState<MembershipPlan[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [selectedRankIds, setSelectedRankIds] = useState<Set<string>>(new Set());
  const [selectedPlanIds, setSelectedPlanIds] = useState<Set<string>>(new Set());
  const [selectedRankId, setSelectedRankId] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/members").then(r => r.ok ? r.json() : { members: [] }),
      fetch("/api/styles").then(r => r.ok ? r.json() : { styles: [] }),
      fetch("/api/membership-plans").then(r => r.ok ? r.json() : { plans: [] }),
    ]).then(([mData, sData, pData]) => {
      setMembers(mData.members || []);
      setStyles(sData.styles || []);
      setMembershipPlans((pData.plans || pData.membershipPlans || []).map((p: MembershipPlan) => ({ id: p.id, name: p.name })));
    }).finally(() => setLoading(false));
  }, []);

  // Helper: parse member styles from stylesNotes JSON
  function getMemberStyles(m: Member): Array<{ name: string; rank?: string; active?: boolean }> {
    if (!m.stylesNotes) return [];
    try { return JSON.parse(m.stylesNotes); } catch { return []; }
  }

  // Get recipients based on mode
  function getRecipients(): Member[] {
    switch (recipientMode) {
      case "all":
        return members.filter(m => m.email && m.status === "ACTIVE");
      case "style": {
        if (!selectedStyleId) return [];
        const style = styles.find(s => s.id === selectedStyleId);
        if (!style) return [];
        // Build rank name set if any ranks selected
        const rankNames = new Set<string>();
        if (selectedRankIds.size > 0) {
          for (const rank of style.ranks) {
            if (selectedRankIds.has(rank.id)) rankNames.add(rank.name.toLowerCase());
          }
        }
        return members.filter(m => {
          if (!m.email) return false;
          const ms = getMemberStyles(m);
          return ms.some(s => {
            if (s.name?.toLowerCase() !== style.name.toLowerCase()) return false;
            if (s.active === false) return false;
            // If ranks are selected, filter by rank too
            if (rankNames.size > 0) return s.rank ? rankNames.has(s.rank.toLowerCase()) : false;
            return true;
          });
        });
      }
      case "membership": {
        if (selectedPlanIds.size === 0) return [];
        return members.filter(m => {
          if (!m.email) return false;
          return m.memberships?.some(ms => selectedPlanIds.has(ms.membershipPlan.id) && ms.status === "ACTIVE");
        });
      }
      case "status":
        return members.filter(m => m.email && selectedStatuses.has(m.status));
      case "specific":
        return members.filter(m => selectedMemberIds.has(m.id));
      default:
        return [];
    }
  }

  async function handleSend() {
    const recipients = getRecipients();
    if (recipients.length === 0) { alert("No recipients selected"); return; }
    if (!subject.trim()) { alert("Subject is required"); return; }
    if (!message.trim()) { alert("Message is required"); return; }
    if (!confirm(`Send email to ${recipients.length} member${recipients.length !== 1 ? "s" : ""}?`)) return;

    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/notifications/send-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberIds: recipients.map(m => m.id),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSendResult(`Email sent to ${data.sent} member${data.sent !== 1 ? "s" : ""}.`);
        setSubject("");
        setMessage("");
      } else {
        setSendResult("Failed to send email.");
      }
    } catch {
      setSendResult("Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  const recipients = getRecipients();
  const filteredMembers = memberSearch.trim()
    ? members.filter(m => `${m.firstName} ${m.lastName}`.toLowerCase().includes(memberSearch.toLowerCase()))
    : members;

  return (
    <AppLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Communications</h1>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab("compose")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "compose" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Compose Email
          </button>
          <button
            onClick={() => setActiveTab("templates")}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "templates" ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
            }`}
          >
            Email Templates
          </button>
        </div>

        {activeTab === "templates" && <EmailTemplatesTab />}

        {activeTab === "compose" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Compose Form */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Email subject..."
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Message</label>
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={e => setMessage((e.target as HTMLDivElement).innerHTML)}
                    className="w-full min-h-[200px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary whitespace-pre-wrap"
                    data-placeholder="Write your message..."
                    style={{ minHeight: "200px" }}
                  />
                  <div className="flex items-center gap-1 mt-1">
                    <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("bold"); }} className="rounded px-2 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100">B</button>
                    <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("italic"); }} className="rounded px-2 py-1 text-xs italic text-gray-700 hover:bg-gray-100">I</button>
                    <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand("underline"); }} className="rounded px-2 py-1 text-xs underline text-gray-700 hover:bg-gray-100">U</button>
                  </div>
                </div>

                {sendResult && (
                  <div className={`rounded-md px-3 py-2 text-xs ${sendResult.includes("Failed") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {sendResult}
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-gray-500">
                    {recipients.length} recipient{recipients.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={handleSend}
                    disabled={sending || !subject.trim() || !message.trim() || recipients.length === 0}
                    className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send Email"}
                  </button>
                </div>
              </div>
            </div>

            {/* Recipients Panel */}
            <div className="space-y-3">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Recipients</h3>

                {loading ? (
                  <p className="text-xs text-gray-400">Loading...</p>
                ) : (
                  <div className="space-y-2">
                    {[
                      { value: "all", label: "All Active Members" },
                      { value: "style", label: "By Style & Rank" },
                      { value: "membership", label: "By Membership" },
                      { value: "status", label: "By Status" },
                      { value: "specific", label: "Specific Members" },
                    ].map(opt => (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${
                          recipientMode === opt.value ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="recipientMode"
                          checked={recipientMode === opt.value}
                          onChange={() => setRecipientMode(opt.value as typeof recipientMode)}
                          className="accent-primary"
                        />
                        {opt.label}
                      </label>
                    ))}

                    {/* Style & Rank Selection */}
                    {recipientMode === "style" && (
                      <div className="mt-2 space-y-2 pl-2">
                        {/* Style radio buttons */}
                        <p className="text-[10px] font-semibold uppercase text-gray-500">Style</p>
                        {styles.map(style => (
                          <label key={style.id} className={`flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded ${selectedStyleId === style.id ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                            <input
                              type="radio"
                              name="styleFilter"
                              checked={selectedStyleId === style.id}
                              onChange={() => { setSelectedStyleId(style.id); setSelectedRankIds(new Set()); }}
                              className="accent-primary"
                            />
                            {style.name}
                          </label>
                        ))}

                        {/* Rank checkboxes for selected style */}
                        {selectedStyleId && (() => {
                          const style = styles.find(s => s.id === selectedStyleId);
                          if (!style || style.ranks.length === 0) return null;
                          return (
                            <div className="mt-2">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold uppercase text-gray-500">Ranks</p>
                                <span className="text-[10px] text-gray-400">{selectedRankIds.size === 0 ? "All ranks" : `${selectedRankIds.size} selected`}</span>
                              </div>
                              <div className="space-y-1 mt-1 max-h-48 overflow-y-auto">
                                {style.ranks.map(rank => (
                                  <label key={rank.id} className={`flex items-center gap-2 text-xs cursor-pointer p-1 rounded ${selectedRankIds.has(rank.id) ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                                    <input
                                      type="checkbox"
                                      checked={selectedRankIds.has(rank.id)}
                                      onChange={() => setSelectedRankIds(prev => {
                                        const next = new Set(prev);
                                        if (next.has(rank.id)) next.delete(rank.id); else next.add(rank.id);
                                        return next;
                                      })}
                                      className="accent-primary"
                                    />
                                    {rank.name}
                                  </label>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Membership Plan Selection */}
                    {recipientMode === "membership" && (
                      <div className="mt-2 space-y-1 pl-2">
                        {membershipPlans.map(plan => (
                          <label key={plan.id} className={`flex items-center gap-2 text-xs cursor-pointer p-1.5 rounded ${selectedPlanIds.has(plan.id) ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                            <input
                              type="checkbox"
                              checked={selectedPlanIds.has(plan.id)}
                              onChange={() => setSelectedPlanIds(prev => {
                                const next = new Set(prev);
                                if (next.has(plan.id)) next.delete(plan.id); else next.add(plan.id);
                                return next;
                              })}
                              className="accent-primary"
                            />
                            {plan.name}
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Status Selection */}
                    {recipientMode === "status" && (
                      <div className="mt-2 space-y-1 pl-2">
                        {["ACTIVE", "INACTIVE", "PROSPECT", "PARENT", "COACH"].map(status => (
                          <label key={status} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedStatuses.has(status)}
                              onChange={() => setSelectedStatuses(prev => {
                                const next = new Set(prev);
                                if (next.has(status)) next.delete(status); else next.add(status);
                                return next;
                              })}
                              className="accent-primary"
                            />
                            {status}
                            <span className="text-gray-400">({members.filter(m => m.status === status && m.email).length})</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* Specific Members */}
                    {recipientMode === "specific" && (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={memberSearch}
                          onChange={e => setMemberSearch(e.target.value)}
                          placeholder="Search members..."
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-200 rounded-md p-1">
                          {filteredMembers.map(m => (
                            <label key={m.id} className={`flex items-center gap-2 p-1.5 rounded text-xs cursor-pointer ${selectedMemberIds.has(m.id) ? "bg-primary/10" : "hover:bg-gray-50"}`}>
                              <input
                                type="checkbox"
                                checked={selectedMemberIds.has(m.id)}
                                onChange={() => setSelectedMemberIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                                  return next;
                                })}
                                className="accent-primary"
                              />
                              {m.firstName} {m.lastName}
                              {!m.email && <span className="text-red-400 ml-1">(no email)</span>}
                            </label>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400">{selectedMemberIds.size} selected</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
