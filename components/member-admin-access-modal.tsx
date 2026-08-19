"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Modal for the "Admin" button on a member's profile: grant, edit, or
 * revoke this member's admin login access. Owns its own data fetch off
 * /api/members/[id]/admin-access, so the profile page just renders it
 * conditionally without threading role/permissions state through.
 *
 * Roles + permission catalog come back from the API so any per-tenant
 * customization of role_permissions in Account -> Users & Access is
 * reflected here in real time.
 */
type Props = {
  memberId: string;
  memberName: string;
  onClose: () => void;
};

type LoadedState = {
  member: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    status: string | null;
  };
  adminAccess: null | {
    userId: string;
    email: string;
    name: string | null;
    role: string;
    classScope: string;
    mustChangePassword: boolean;
    totpEnabled: boolean;
  };
  rolePermissions: Record<string, string[]>;
  defaultRoleTemplate: Record<string, string[]>;
};

const ROLES: Array<{ key: "OWNER" | "ADMIN" | "COACH" | "FRONT_DESK"; label: string; blurb: string }> = [
  { key: "OWNER", label: "Owner", blurb: "Full access, including Users & Access and gym management." },
  { key: "ADMIN", label: "Admin", blurb: "Full app access minus Account settings + gym management." },
  { key: "COACH", label: "Coach", blurb: "Teaches classes. Defaults to seeing only their own classes / appts." },
  { key: "FRONT_DESK", label: "Front Desk", blurb: "POS, members, waivers, kiosk. No curriculum / testing." },
];

const PERMISSION_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  members: "Members",
  memberships: "Memberships",
  styles: "Styles",
  classes: "Classes",
  calendar: "Calendar",
  testing: "Testing",
  curriculum: "Curriculum",
  promotions: "Promotions",
  pos: "POS",
  billing: "Billing / Invoices",
  contracts: "Contracts",
  waivers: "Waivers",
  reports: "Reports",
  tasks: "Tasks",
  communication: "Communication",
  kiosk: "Kiosk",
  account: "Account (Users & Access)",
  "audit-log": "Audit Log",
  "manage-gyms": "Manage Gyms",
  setup: "Setup",
};

export function MemberAdminAccessModal({ memberId, memberName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LoadedState | null>(null);

  // Draft edit state -- always mirrors either an existing linkedUser
  // (edit path) or a fresh grant (create path).
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "ADMIN" | "COACH" | "FRONT_DESK">("COACH");
  const [classScope, setClassScope] = useState<"all" | "own">("own");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/members/${memberId}/admin-access`);
      if (!res.ok) throw new Error((await res.text()) || "Failed to load");
      const data = (await res.json()) as LoadedState;
      setState(data);
      if (data.adminAccess) {
        setEmail(data.adminAccess.email);
        setRole(data.adminAccess.role as typeof role);
        setClassScope((data.adminAccess.classScope as "all" | "own") || "all");
      } else {
        setEmail(data.member.email || "");
        setRole("COACH");
        setClassScope("own");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load admin access");
    } finally {
      setLoading(false);
    }
  }, [memberId]);
  useEffect(() => { load(); }, [load]);

  // When the admin flips role, snap classScope to the sensible
  // default (COACH -> own, everyone else -> all). The admin can then
  // override before saving.
  useEffect(() => {
    if (state?.adminAccess) return; // don't stomp existing values on edit
    setClassScope(role === "COACH" ? "own" : "all");
  }, [role, state?.adminAccess]);

  async function grant() {
    setBusy(true);
    setFlash(null);
    setTempPassword(null);
    try {
      const res = await fetch(`/api/members/${memberId}/admin-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role, classScope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to grant access");
      setTempPassword(data.tempPassword || null);
      setFlash("Admin access granted. Give this member the temporary password below — they'll be prompted to set a new one on first sign-in.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to grant access");
    } finally {
      setBusy(false);
    }
  }
  async function saveEdits(resetPassword: boolean) {
    setBusy(true);
    setFlash(null);
    setTempPassword(null);
    try {
      const body: Record<string, unknown> = {};
      if (state?.adminAccess) {
        if (email && email !== state.adminAccess.email) body.email = email.trim();
        if (role !== state.adminAccess.role) body.role = role;
        if (classScope !== state.adminAccess.classScope) body.classScope = classScope;
      }
      if (resetPassword) body.resetPassword = true;
      const res = await fetch(`/api/members/${memberId}/admin-access`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update access");
      setTempPassword(data.tempPassword || null);
      setFlash(resetPassword ? "Password reset. Hand the new temp password to the user." : "Saved.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update access");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!confirm(`Revoke admin access for ${memberName}? They won't be able to sign in anymore.`)) return;
    setBusy(true);
    setFlash(null);
    setTempPassword(null);
    try {
      const res = await fetch(`/api/members/${memberId}/admin-access`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke access");
      setFlash("Admin access revoked.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke access");
    } finally {
      setBusy(false);
    }
  }

  const permsForRole = state?.rolePermissions[role] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-bold text-gray-900">Admin Access — {memberName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" title="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-gray-500">Loading…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">Error: {error}</div>
        ) : state ? (
          <div className="p-5 space-y-4">
            {flash && (
              <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">{flash}</div>
            )}
            {tempPassword && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <div className="font-semibold mb-1">Temporary password (shown once)</div>
                <code className="block font-mono text-sm select-all">{tempPassword}</code>
                <div className="mt-1 text-[11px] text-amber-800">User will be prompted to set a new password on first sign-in.</div>
              </div>
            )}

            {/* Login email */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Login email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={state.member.email || "user@example.com"}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Defaults to the member&apos;s profile email. Editable so a coach can log in with a work address.
              </p>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <label
                    key={r.key}
                    className={`flex flex-col rounded-md border px-3 py-2 cursor-pointer ${role === r.key ? "border-primary bg-primary/5" : "border-gray-200 hover:bg-gray-50"}`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="admin-role"
                        checked={role === r.key}
                        onChange={() => setRole(r.key)}
                        className="accent-primary"
                      />
                      <span className="text-sm font-semibold text-gray-800">{r.label}</span>
                    </span>
                    <span className="mt-1 text-[11px] text-gray-500">{r.blurb}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Class scope */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Class + appointment scope</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="admin-scope"
                    checked={classScope === "all"}
                    onChange={() => setClassScope("all")}
                    className="accent-primary"
                  />
                  <span className="text-sm text-gray-700">All classes / appts</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="admin-scope"
                    checked={classScope === "own"}
                    onChange={() => setClassScope("own")}
                    className="accent-primary"
                  />
                  <span className="text-sm text-gray-700">Only ones they teach</span>
                </label>
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                &quot;Only ones they teach&quot; scopes their calendar / class list / appt list to entries where their Member is the assigned coach.
              </p>
            </div>

            {/* Permission list preview for the selected role */}
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] font-semibold uppercase text-gray-500 mb-1">
                What this role can access
              </div>
              {permsForRole.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No permissions configured for this role.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {permsForRole.map((p) => (
                    <span key={p} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[11px] text-gray-700">
                      {PERMISSION_LABELS[p] || p}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-gray-500">
                Edit the full permission matrix in <span className="font-medium">Account → Users &amp; Access</span>.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 justify-end border-t border-gray-100 pt-3">
              {state.adminAccess ? (
                <>
                  <button
                    type="button"
                    onClick={revoke}
                    disabled={busy}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Revoke Access
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdits(true)}
                    disabled={busy}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => saveEdits(false)}
                    disabled={busy}
                    className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save Changes"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={grant}
                  disabled={busy || !email.trim()}
                  className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {busy ? "Granting…" : "Grant Admin Access"}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
