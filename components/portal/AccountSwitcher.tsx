"use client";

import { useEffect, useRef, useState } from "react";

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  relationship?: string | null;
};

type Self = { id: string; firstName: string; lastName: string; photoUrl?: string | null };

type FamilyResponse = {
  self: Self | null;
  children: Child[];
  sessionMemberId: string;
  viewingAsMemberId: string;
};

export default function AccountSwitcher() {
  const [data, setData] = useState<FamilyResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portal/family")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => { /* silent — not all members have a family endpoint */ });
  }, []);

  // Close on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!data || !data.self || data.children.length === 0) return null;

  async function switchTo(memberId: string) {
    if (switching) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/portal/switch-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      });
      if (res.ok) {
        // Reload so every page refetches under the new effective member.
        window.location.reload();
      } else {
        const d = await res.json().catch(() => null);
        alert(d?.error || "Failed to switch account");
        setSwitching(false);
      }
    } catch {
      alert("Connection error switching account");
      setSwitching(false);
    }
  }

  const isViewingAsSelf = data.viewingAsMemberId === data.sessionMemberId;
  const active = isViewingAsSelf
    ? data.self
    : (data.children.find((c) => c.id === data.viewingAsMemberId) || data.self);

  return (
    <div ref={ref} className="relative bg-white border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 text-left active:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <Avatar member={active!} />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-gray-900">
              {active!.firstName} {active!.lastName}
            </span>
            {!isViewingAsSelf && (
              <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">
                Viewing as
              </span>
            )}
          </div>
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 bg-white border-b border-gray-200 shadow-md">
          <Row
            member={data.self}
            highlighted={isViewingAsSelf}
            badge="Me"
            disabled={switching}
            onClick={() => switchTo(data.self!.id)}
          />
          {data.children.map((child) => (
            <Row
              key={child.id}
              member={child}
              highlighted={data.viewingAsMemberId === child.id}
              badge={child.relationship || "Child"}
              disabled={switching}
              onClick={() => switchTo(child.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  member,
  highlighted,
  badge,
  disabled,
  onClick,
}: {
  member: Child | Self;
  highlighted: boolean;
  badge: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center justify-between px-4 py-2.5 border-l-4 transition-colors active:bg-gray-100 ${
        highlighted ? "border-primary bg-primary/5" : "border-transparent hover:bg-gray-50"
      } disabled:opacity-50`}
    >
      <div className="flex items-center gap-2">
        <Avatar member={member} />
        <span className="text-sm font-medium text-gray-900">
          {member.firstName} {member.lastName}
        </span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
        {badge}
      </span>
    </button>
  );
}

function Avatar({ member }: { member: { firstName: string; lastName: string; photoUrl?: string | null } }) {
  if (member.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover border border-gray-200" />;
  }
  const initials = `${member.firstName[0] || ""}${member.lastName[0] || ""}`.toUpperCase();
  return (
    <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center">
      {initials}
    </div>
  );
}
