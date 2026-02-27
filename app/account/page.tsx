"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";
import { useTheme } from "@/components/theme-provider";
import { getTodayString } from "@/lib/dates";

type GymSettings = {
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
  website: string;
  logo?: string;
  timezone: string;
  currency: string;
  taxRate: number;
};

type BillingInfo = {
  planName: string;
  planPrice: number;
  billingCycle: string;
  nextBillingDate: string;
  paymentMethod: string;
  cardLast4: string;
};

type OwnerInfo = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
};

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "members", label: "Members" },
  { key: "memberships", label: "Memberships" },
  { key: "styles", label: "Styles" },
  { key: "classes", label: "Classes & Appointments" },
  { key: "calendar", label: "Calendar" },
  { key: "testing", label: "Testing" },
  { key: "curriculum", label: "Curriculum" },
  { key: "promotions", label: "Promotions" },
  { key: "pos", label: "POS (Point of Sale)" },
  { key: "waivers", label: "Waivers" },
  { key: "reports", label: "Reports" },
  { key: "tasks", label: "Tasks" },
  { key: "communication", label: "Communication" },
  { key: "kiosk", label: "Kiosk Mode" },
  { key: "account", label: "Account Settings" },
] as const;

const ALL_PERMISSION_KEYS = ALL_PERMISSIONS.map((p) => p.key);

const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: ALL_PERMISSION_KEYS.filter((k) => k !== "account"),
  COACH: ["dashboard", "members", "classes", "calendar", "testing", "curriculum", "promotions", "tasks", "communication", "kiosk"],
  FRONT_DESK: ["dashboard", "members", "memberships", "classes", "calendar", "pos", "waivers", "tasks", "kiosk"],
};

const ROLES = [
  { key: "OWNER", label: "Owner", description: "Full access to all features and settings" },
  { key: "ADMIN", label: "Admin", description: "Can manage members, classes, and reports" },
  { key: "COACH", label: "Coach", description: "Can check in members and view schedules" },
  { key: "FRONT_DESK", label: "Front Desk", description: "Can check in members and process sales" },
];

export default function AccountPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"business" | "users" | "settings" | "payments">("business");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(DEFAULT_ROLE_PERMISSIONS);
  const [savingPermissions, setSavingPermissions] = useState(false);

  // Notification settings
  const [notifySettings, setNotifySettings] = useState<Record<string, boolean>>({
    notify_email_enabled: true,
    notify_welcome_email: true,
    notify_invoice_created: true,
    notify_payment_received: true,
    notify_past_due: true,
    notify_promotion: true,
    notify_class_reminder: true,
    notify_membership_expiry: true,
    notify_promotion_eligible: false,
    notify_birthday: true,
    notify_inactive_reengagement: true,
    notify_renewal_reminder: true,
    notify_trial_expiring: true,
  });
  const [resendApiKey, setResendApiKey] = useState("");
  const [savingNotifications, setSavingNotifications] = useState(false);

  // Display settings
  const [dateFormat, setDateFormat] = useState("MM/DD/YYYY");
  const [timeFormat, setTimeFormat] = useState("12-hour (AM/PM)");
  const [weekStartsOn, setWeekStartsOn] = useState("Sunday");
  const [savingDisplay, setSavingDisplay] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Billing & Dunning settings
  const [dunningEnabled, setDunningEnabled] = useState(true);
  const [dunningMaxRetries, setDunningMaxRetries] = useState(4);
  const [billingGracePeriod, setBillingGracePeriod] = useState(7);
  const [billingAutoGenerate, setBillingAutoGenerate] = useState(false);
  const [savingDunning, setSavingDunning] = useState(false);
  const [runningBilling, setRunningBilling] = useState(false);
  const [billingRunResult, setBillingRunResult] = useState<string | null>(null);

  // Payment processor settings
  const [paymentSettings, setPaymentSettings] = useState<Record<string, string>>({});
  const [savingPayments, setSavingPayments] = useState(false);
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Role Assignments
  const [allMembers, setAllMembers] = useState<{ id: string; firstName: string; lastName: string; status: string; accessRole: string | null }[]>([]);
  const [assignMemberId, setAssignMemberId] = useState("");
  const [assignRole, setAssignRole] = useState("COACH");

  // Locations
  const [locations, setLocations] = useState<{ id: string; name: string; address: string | null; city: string | null; state: string | null; zipCode: string | null; phone: string | null; isActive: boolean }[]>([]);
  const [showLocModal, setShowLocModal] = useState(false);
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [locForm, setLocForm] = useState({ name: "", address: "", city: "", state: "", zipCode: "", phone: "" });
  const [savingLoc, setSavingLoc] = useState(false);

  // Spaces
  const [spacesArr, setSpacesArr] = useState<{ id: string; name: string; locationId: string | null; isActive: boolean }[]>([]);
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [spaceForm, setSpaceForm] = useState({ name: "", locationId: "" });
  const [savingSpace, setSavingSpace] = useState(false);

  // Account credentials
  const [credForm, setCredForm] = useState({ name: "", email: "", newPassword: "", confirmPassword: "", currentPassword: "" });
  const [savingCred, setSavingCred] = useState(false);
  const [credError, setCredError] = useState("");
  const [credSuccess, setCredSuccess] = useState("");

  // Business Details
  const [gymSettings, setGymSettings] = useState<GymSettings>({
    name: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    email: "",
    website: "",
    timezone: "America/Los_Angeles",
    currency: "USD",
    taxRate: 0,
  });

  // Load settings on mount
  useEffect(() => {
    async function loadSettings() {
      setLoading(true);
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.settings && Array.isArray(data.settings)) {
            const map: Record<string, string> = {};
            for (const s of data.settings) map[s.key] = s.value;
            setGymSettings({
              name: map.gymName || "",
              address: map.gymAddress || "",
              city: map.gymCity || "",
              state: map.gymState || "",
              zipCode: map.gymZipCode || "",
              phone: map.gymPhone || "",
              email: map.gymEmail || "",
              website: map.gymWebsite || "",
              logo: map.gymLogo || "",
              timezone: map.timezone || "America/Los_Angeles",
              currency: map.currency || "USD",
              taxRate: Number(map.taxRate) || 0,
            });
            if (map.role_permissions) {
              try {
                const parsed = JSON.parse(map.role_permissions);
                setRolePermissions({ ...DEFAULT_ROLE_PERMISSIONS, ...parsed });
              } catch {
                // use defaults
              }
            }
            // Load notification settings
            setResendApiKey(map.resend_api_key || "");
            setNotifySettings({
              notify_email_enabled: map.notify_email_enabled !== "false",
              notify_welcome_email: map.notify_welcome_email !== "false",
              notify_invoice_created: map.notify_invoice_created !== "false",
              notify_payment_received: map.notify_payment_received !== "false",
              notify_past_due: map.notify_past_due !== "false",
              notify_promotion: map.notify_promotion !== "false",
              notify_class_reminder: map.notify_class_reminder !== "false",
              notify_membership_expiry: map.notify_membership_expiry !== "false",
              notify_promotion_eligible: map.notify_promotion_eligible === "true",
              notify_birthday: map.notify_birthday !== "false",
              notify_inactive_reengagement: map.notify_inactive_reengagement !== "false",
              notify_renewal_reminder: map.notify_renewal_reminder !== "false",
              notify_trial_expiring: map.notify_trial_expiring !== "false",
            });
            // Load display settings
            setDateFormat(map.display_date_format || "MM/DD/YYYY");
            setTimeFormat(map.display_time_format || "12-hour (AM/PM)");
            setWeekStartsOn(map.display_week_starts_on || "Sunday");
            // Load billing & dunning settings
            setDunningEnabled(map.dunning_enabled !== "false");
            setDunningMaxRetries(parseInt(map.dunning_max_retries) || 4);
            setBillingGracePeriod(parseInt(map.billing_grace_period_days) || 7);
            setBillingAutoGenerate(map.billing_auto_generate === "true");
            // Load payment processor settings
            const pmKeys = Object.keys(map).filter((k) => k.startsWith("payment_"));
            if (pmKeys.length > 0) {
              const pm: Record<string, string> = {};
              for (const k of pmKeys) pm[k] = map[k];
              setPaymentSettings(pm);
            }
          }
        }
      } catch (err) {
        console.error("Error loading settings:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
    loadMembers();
    loadLocations();
    loadSpaces();
    // Load current user info for credentials form
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user) {
          setCredForm((f) => ({ ...f, name: data.user.name || "", email: data.user.email || "" }));
        }
      })
      .catch(() => {});
  }, []);

  async function handleSaveNotifications() {
    setSavingNotifications(true);
    try {
      const payload: Record<string, string> = {
        resend_api_key: resendApiKey,
      };
      for (const [key, val] of Object.entries(notifySettings)) {
        payload[key] = val ? "true" : "false";
      }
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSuccessMessage("Notification settings saved!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSavingNotifications(false);
    }
  }

  async function handleChangeCredentials() {
    setCredError("");
    setCredSuccess("");
    if (!credForm.currentPassword) return;
    if (credForm.newPassword && credForm.newPassword !== credForm.confirmPassword) {
      setCredError("New passwords do not match.");
      return;
    }
    setSavingCred(true);
    try {
      const res = await fetch("/api/auth/change-credentials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: credForm.currentPassword,
          newEmail: credForm.email || undefined,
          newName: credForm.name || undefined,
          newPassword: credForm.newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCredError(data.error || "Failed to update");
      } else {
        setCredSuccess("Account updated successfully! If you changed your email or password, use the new credentials next time you log in.");
        setCredForm((f) => ({ ...f, newPassword: "", confirmPassword: "", currentPassword: "" }));
        setTimeout(() => setCredSuccess(""), 5000);
      }
    } catch {
      setCredError("Failed to save changes");
    } finally {
      setSavingCred(false);
    }
  }

  async function handleSaveDisplay() {
    setSavingDisplay(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_date_format: dateFormat,
          display_time_format: timeFormat,
          display_week_starts_on: weekStartsOn,
        }),
      });
      if (res.ok) {
        setSuccessMessage("Display settings saved!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSavingDisplay(false);
    }
  }

  async function handleSaveDunning() {
    setSavingDunning(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dunning_enabled: dunningEnabled ? "true" : "false",
          dunning_max_retries: String(dunningMaxRetries),
          billing_grace_period_days: String(billingGracePeriod),
          billing_auto_generate: billingAutoGenerate ? "true" : "false",
        }),
      });
      if (res.ok) {
        setSuccessMessage("Billing settings saved!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSavingDunning(false);
    }
  }

  async function runBillingNow() {
    setRunningBilling(true);
    setBillingRunResult(null);
    try {
      const [runRes, pdRes] = await Promise.all([
        fetch("/api/billing/run", { method: "POST" }),
        fetch("/api/billing/past-due", { method: "POST" }),
      ]);
      const runData = await runRes.json();
      const pdData = await pdRes.json();
      const parts: string[] = [];
      if (runData.created > 0) parts.push(`${runData.created} invoice(s) created`);
      if (runData.skipped > 0) parts.push(`${runData.skipped} skipped`);
      if (pdData.updated > 0) parts.push(`${pdData.updated} marked past due`);
      setBillingRunResult(parts.length > 0 ? parts.join(", ") : "No invoices to generate.");
    } catch {
      setBillingRunResult("Billing run failed.");
    } finally {
      setRunningBilling(false);
    }
  }

  async function handleSavePayments() {
    setSavingPayments(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentSettings),
      });
      if (res.ok) {
        setSuccessMessage("Payment settings saved!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setSavingPayments(false);
    }
  }

  async function handleTestConnection(processor: string) {
    setTestingConnection(processor);
    setConnectionStatus((prev) => ({ ...prev, [processor]: undefined as unknown as { ok: boolean; msg: string } }));
    try {
      // Save current settings first so the test endpoint can read them
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentSettings),
      });
      const res = await fetch("/api/settings/test-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processor }),
      });
      const data = await res.json();
      setConnectionStatus((prev) => ({ ...prev, [processor]: { ok: data.ok, msg: data.message } }));
    } catch {
      setConnectionStatus((prev) => ({ ...prev, [processor]: { ok: false, msg: "Failed to test connection" } }));
    } finally {
      setTestingConnection(null);
    }
  }

  function updatePayment(key: string, value: string) {
    setPaymentSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleExportData() {
    setExporting(true);
    try {
      const [membersRes, settingsRes, attendanceRes, tasksRes] = await Promise.all([
        fetch("/api/members"),
        fetch("/api/settings"),
        fetch("/api/attendance"),
        fetch("/api/tasks"),
      ]);

      const members = membersRes.ok ? await membersRes.json() : {};
      const settings = settingsRes.ok ? await settingsRes.json() : {};
      const attendance = attendanceRes.ok ? await attendanceRes.json() : {};
      const tasks = tasksRes.ok ? await tasksRes.json() : {};

      const exportData = {
        exportedAt: new Date().toISOString(),
        members: members.members || [],
        settings: settings.settings || [],
        attendance: attendance.attendances || attendance.records || [],
        tasks: tasks.tasks || [],
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gym-export-${getTodayString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently fail
    } finally {
      setExporting(false);
    }
  }

  async function loadMembers() {
    try {
      const res = await fetch("/api/members");
      if (res.ok) {
        const data = await res.json();
        setAllMembers(
          (data.members || []).map((m: { id: string; firstName: string; lastName: string; status?: string; accessRole?: string | null }) => ({
            id: m.id,
            firstName: m.firstName,
            lastName: m.lastName,
            status: m.status || "PROSPECT",
            accessRole: m.accessRole || null,
          }))
        );
      }
    } catch {
      // ignore
    }
  }

  // Map access roles to the status tag they add
  const ROLE_STATUS_MAP: Record<string, string> = {
    OWNER: "OWNER",
    ADMIN: "ADMIN",
    COACH: "COACH",
    FRONT_DESK: "FRONT DESK",
  };

  function addStatusTag(currentStatus: string, tag: string): string {
    const parts = currentStatus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const tagUpper = tag.toUpperCase();
    if (!parts.includes(tagUpper)) {
      parts.push(tagUpper);
    }
    return parts.join(", ");
  }

  function removeStatusTag(currentStatus: string, tag: string): string {
    const parts = currentStatus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    const tagUpper = tag.toUpperCase();
    const filtered = parts.filter((p) => p !== tagUpper);
    return filtered.length > 0 ? filtered.join(", ") : "ACTIVE";
  }

  async function assignRoleToMember() {
    if (!assignMemberId) return;
    const member = allMembers.find((m) => m.id === assignMemberId);
    if (!member) return;
    const roleTag = ROLE_STATUS_MAP[assignRole] || assignRole;
    const updatedStatus = addStatusTag(member.status, roleTag);
    try {
      const res = await fetch(`/api/members/${assignMemberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessRole: assignRole, status: updatedStatus }),
      });
      if (res.ok) {
        setAllMembers((prev) =>
          prev.map((m) => (m.id === assignMemberId ? { ...m, accessRole: assignRole, status: updatedStatus } : m))
        );
        setAssignMemberId("");
        setSuccessMessage("Role assigned and status updated!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      alert("Failed to assign role");
    }
  }

  async function removeRoleFromMember(memberId: string) {
    const member = allMembers.find((m) => m.id === memberId);
    if (!member) return;
    const roleTag = member.accessRole ? (ROLE_STATUS_MAP[member.accessRole] || member.accessRole) : "";
    const updatedStatus = roleTag ? removeStatusTag(member.status, roleTag) : member.status;
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessRole: null, status: updatedStatus }),
      });
      if (res.ok) {
        setAllMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, accessRole: null, status: updatedStatus } : m))
        );
        setSuccessMessage("Role removed.");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      alert("Failed to remove role");
    }
  }

  const handleSaveBusinessDetails = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gymName: gymSettings.name,
          gymAddress: gymSettings.address,
          gymCity: gymSettings.city,
          gymState: gymSettings.state,
          gymZipCode: gymSettings.zipCode,
          gymPhone: gymSettings.phone,
          gymEmail: gymSettings.email,
          gymWebsite: gymSettings.website,
          gymLogo: gymSettings.logo || "",
          timezone: gymSettings.timezone,
          currency: gymSettings.currency,
          taxRate: gymSettings.taxRate,
        }),
      });

      if (res.ok) {
        setSuccessMessage("Business details saved successfully!");
        setTimeout(() => setSuccessMessage(""), 3000);
      } else {
        alert("Failed to save settings");
      }
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  function togglePermission(role: string, permKey: string) {
    setRolePermissions((prev) => {
      const current = prev[role] || [];
      const updated = current.includes(permKey)
        ? current.filter((k) => k !== permKey)
        : [...current, permKey];
      return { ...prev, [role]: updated };
    });
  }

  const handleSavePermissions = async () => {
    setSavingPermissions(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "role_permissions",
          value: JSON.stringify(rolePermissions),
        }),
      });
      if (res.ok) {
        setSuccessMessage("Role permissions saved successfully!");
        setTimeout(() => setSuccessMessage(""), 3000);
      }
    } catch {
      alert("Failed to save permissions");
    } finally {
      setSavingPermissions(false);
    }
  };

  async function loadLocations() {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      setLocations(data.locations || []);
    } catch {}
  }

  async function handleSaveLoc() {
    if (!locForm.name.trim()) return;
    setSavingLoc(true);
    try {
      if (editingLocId) {
        await fetch(`/api/locations/${editingLocId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locForm),
        });
      } else {
        await fetch("/api/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locForm),
        });
      }
      setShowLocModal(false);
      await loadLocations();
    } catch {} finally {
      setSavingLoc(false);
    }
  }

  async function toggleLocActive(loc: typeof locations[0]) {
    await fetch(`/api/locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !loc.isActive }),
    });
    await loadLocations();
  }

  async function deleteLoc(loc: typeof locations[0]) {
    if (!confirm(`Delete location "${loc.name}"?`)) return;
    await fetch(`/api/locations/${loc.id}`, { method: "DELETE" });
    await loadLocations();
  }

  // Spaces CRUD
  async function loadSpaces() {
    try {
      const res = await fetch("/api/spaces");
      const data = await res.json();
      setSpacesArr(data.spaces || []);
    } catch {}
  }

  async function handleSaveSpace() {
    if (!spaceForm.name.trim()) return;
    setSavingSpace(true);
    try {
      const payload = { name: spaceForm.name.trim(), locationId: spaceForm.locationId || null };
      if (editingSpaceId) {
        await fetch(`/api/spaces/${editingSpaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/spaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowSpaceModal(false);
      await loadSpaces();
    } catch {} finally {
      setSavingSpace(false);
    }
  }

  async function toggleSpaceActive(space: typeof spacesArr[0]) {
    await fetch(`/api/spaces/${space.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !space.isActive }),
    });
    await loadSpaces();
  }

  async function deleteSpace(space: typeof spacesArr[0]) {
    if (!confirm(`Delete space "${space.name}"?`)) return;
    await fetch(`/api/spaces/${space.id}`, { method: "DELETE" });
    await loadSpaces();
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">Account</h1>
          <div className="text-sm text-gray-600">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Account</h1>
          <p className="text-sm text-gray-600">
            Manage your business details, billing, and account settings
          </p>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            {successMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-4">
            <button
              onClick={() => setActiveTab("business")}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "business"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Business Details
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "users"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Users & Access
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "settings"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Preferences
            </button>
            <button
              onClick={() => setActiveTab("payments")}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "payments"
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Payments
            </button>
          </nav>
        </div>

        {/* Business Details Tab */}
        {activeTab === "business" && (
          <div className="space-y-6">
            {/* Business Information */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Business Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={gymSettings.name}
                    onChange={(e) => setGymSettings({ ...gymSettings, name: e.target.value })}
                    placeholder="Your Martial Arts Academy"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={gymSettings.address}
                    onChange={(e) => setGymSettings({ ...gymSettings, address: e.target.value })}
                    placeholder="123 Main Street"
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={gymSettings.city}
                    onChange={(e) => setGymSettings({ ...gymSettings, city: e.target.value })}
                    placeholder="City"
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={gymSettings.state}
                      onChange={(e) => setGymSettings({ ...gymSettings, state: e.target.value })}
                      placeholder="CA"
                      autoComplete="off"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={gymSettings.zipCode}
                      onChange={(e) => setGymSettings({ ...gymSettings, zipCode: e.target.value })}
                      placeholder="12345"
                      autoComplete="off"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Business Logo */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Business Logo</h3>
              <p className="text-sm text-gray-500 mb-4">
                Upload your logo to display on curriculum PDFs and throughout the software.
              </p>
              <div className="flex items-start gap-6">
                {gymSettings.logo && (
                  <div className="shrink-0">
                    <img
                      src={gymSettings.logo}
                      alt="Business logo"
                      className="h-24 w-24 object-contain rounded-md border border-gray-200 bg-gray-50 p-1"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark w-fit">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    {gymSettings.logo ? "Change Logo" : "Upload Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 500 * 1024) {
                          alert("Logo must be under 500KB. Please use a smaller image.");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => {
                          setGymSettings({ ...gymSettings, logo: reader.result as string });
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {gymSettings.logo && (
                    <button
                      onClick={() => setGymSettings({ ...gymSettings, logo: "" })}
                      className="text-xs rounded-md border border-gray-300 bg-white px-3 py-1 font-semibold text-gray-700 hover:bg-gray-100 w-fit"
                    >
                      Remove Logo
                    </button>
                  )}
                  <p className="text-xs text-gray-400">PNG, JPG, GIF, or SVG. Max 500KB.</p>
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={gymSettings.phone}
                    onChange={(e) => setGymSettings({ ...gymSettings, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={gymSettings.email}
                    onChange={(e) => setGymSettings({ ...gymSettings, email: e.target.value })}
                    placeholder="info@yourgym.com"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={gymSettings.website}
                    onChange={(e) => setGymSettings({ ...gymSettings, website: e.target.value })}
                    placeholder="https://www.yourgym.com"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Regional Settings */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Regional Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timezone
                  </label>
                  <select
                    value={gymSettings.timezone}
                    onChange={(e) => setGymSettings({ ...gymSettings, timezone: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Anchorage">Alaska Time (AKT)</option>
                    <option value="Pacific/Honolulu">Hawaii Time (HT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Currency
                  </label>
                  <select
                    value={gymSettings.currency}
                    onChange={(e) => setGymSettings({ ...gymSettings, currency: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="AUD">AUD - Australian Dollar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tax Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={gymSettings.taxRate}
                    onChange={(e) => setGymSettings({ ...gymSettings, taxRate: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveBusinessDetails}
                disabled={saving}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {/* Locations */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Locations</h3>
                  <p className="text-sm text-gray-500">Manage your training locations</p>
                </div>
                <button
                  onClick={() => {
                    setEditingLocId(null);
                    setLocForm({ name: "", address: "", city: "", state: "", zipCode: "", phone: "" });
                    setShowLocModal(true);
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Add Location
                </button>
              </div>

              {locations.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  No locations added yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {locations.map((loc) => (
                    <div key={loc.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {[loc.address, loc.city, loc.state, loc.zipCode].filter(Boolean).join(", ") || "No address"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleLocActive(loc)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            loc.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {loc.isActive ? "Active" : "Inactive"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingLocId(loc.id);
                            setLocForm({
                              name: loc.name,
                              address: loc.address || "",
                              city: loc.city || "",
                              state: loc.state || "",
                              zipCode: loc.zipCode || "",
                              phone: loc.phone || "",
                            });
                            setShowLocModal(true);
                          }}
                          className="text-xs font-medium text-primary hover:text-primaryDark"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteLoc(loc)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Spaces */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Spaces</h3>
                  <p className="text-sm text-gray-500">Define rooms, mats, or areas for classes and appointments</p>
                </div>
                <button
                  onClick={() => {
                    setEditingSpaceId(null);
                    setSpaceForm({ name: "", locationId: "" });
                    setShowSpaceModal(true);
                  }}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Add Space
                </button>
              </div>

              {spacesArr.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">
                  No spaces added yet. Add spaces like &quot;Mat 1&quot;, &quot;Mat 2&quot;, or &quot;Ring&quot;.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {spacesArr.map((space) => (
                    <div key={space.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900">{space.name}</p>
                        <p className="text-xs text-gray-500">
                          {space.locationId
                            ? locations.find((l) => l.id === space.locationId)?.name || "Unknown location"
                            : "No location"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleSpaceActive(space)}
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            space.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {space.isActive ? "Active" : "Inactive"}
                        </button>
                        <button
                          onClick={() => {
                            setEditingSpaceId(space.id);
                            setSpaceForm({
                              name: space.name,
                              locationId: space.locationId || "",
                            });
                            setShowSpaceModal(true);
                          }}
                          className="text-xs font-medium text-primary hover:text-primaryDark"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteSpace(space)}
                          className="text-xs font-medium text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users & Access Tab */}
        {activeTab === "users" && (
          <div className="space-y-6">
            {/* Your Account - Change Email/Password */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">Your Account</h3>
              <p className="text-sm text-gray-500 mb-4">
                Change your login email, display name, or password.
              </p>
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={credForm.name}
                    onChange={(e) => setCredForm({ ...credForm, name: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Login Email</label>
                  <input
                    type="email"
                    value={credForm.email}
                    onChange={(e) => setCredForm({ ...credForm, email: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="admin@gym.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={credForm.newPassword}
                    onChange={(e) => setCredForm({ ...credForm, newPassword: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Leave blank to keep current password"
                  />
                </div>
                {credForm.newPassword && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={credForm.confirmPassword}
                      onChange={(e) => setCredForm({ ...credForm, confirmPassword: e.target.value })}
                      className={`w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary ${
                        credForm.confirmPassword && credForm.confirmPassword !== credForm.newPassword
                          ? "border-red-300"
                          : "border-gray-300"
                      }`}
                      placeholder="Re-enter new password"
                    />
                    {credForm.confirmPassword && credForm.confirmPassword !== credForm.newPassword && (
                      <p className="text-xs text-red-600 mt-0.5">Passwords do not match.</p>
                    )}
                  </div>
                )}
                <hr className="border-gray-200" />
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Current Password *</label>
                  <input
                    type="password"
                    value={credForm.currentPassword}
                    onChange={(e) => setCredForm({ ...credForm, currentPassword: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                    placeholder="Required to save changes"
                  />
                  <p className="text-xs text-gray-400 mt-1">Enter your current password to confirm changes.</p>
                </div>
                {credError && <p className="text-xs text-red-600">{credError}</p>}
                {credSuccess && <p className="text-xs text-green-600">{credSuccess}</p>}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    onClick={handleChangeCredentials}
                    disabled={savingCred || !credForm.currentPassword}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {savingCred ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>

            {/* Role Permissions */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Role Permissions</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure which sections each role can access. Owner always has full access.
              </p>
              <div className="space-y-4">
                {ROLES.map((role) => {
                  const isOwner = role.key === "OWNER";
                  const perms = isOwner ? ALL_PERMISSION_KEYS : (rolePermissions[role.key] || []);
                  return (
                    <div key={role.key} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-3">
                        <p className="font-medium text-gray-900">{role.label}</p>
                        <p className="text-xs text-gray-500">{role.description}</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {ALL_PERMISSIONS.map((perm) => (
                          <label
                            key={perm.key}
                            className={`flex items-center gap-2 ${isOwner ? "opacity-60" : "cursor-pointer"}`}
                          >
                            <input
                              type="checkbox"
                              checked={isOwner ? true : perms.includes(perm.key)}
                              disabled={isOwner}
                              onChange={() => !isOwner && togglePermission(role.key, perm.key)}
                              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-gray-700">{perm.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={handleSavePermissions}
                  disabled={savingPermissions}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingPermissions ? "Saving..." : "Save Permissions"}
                </button>
              </div>
            </div>

            {/* Role Assignments */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">Role Assignments</h3>
              <p className="text-sm text-gray-500 mb-4">
                Assign access roles to members. Members with a role will have access based on the permissions above.
              </p>

              {/* Assign form */}
              <div className="flex flex-wrap items-end gap-2 mb-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Member</label>
                  <select
                    value={assignMemberId}
                    onChange={(e) => setAssignMemberId(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select a member...</option>
                    {allMembers
                      .filter((m) => !m.accessRole)
                      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.lastName}, {m.firstName}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role</label>
                  <select
                    value={assignRole}
                    onChange={(e) => setAssignRole(e.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {ROLES.map((r) => (
                      <option key={r.key} value={r.key}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={assignRoleToMember}
                  disabled={!assignMemberId}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  Assign
                </button>
              </div>

              {/* Current assignments */}
              {allMembers.filter((m) => m.accessRole).length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No members have been assigned a role yet.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                  {allMembers
                    .filter((m) => m.accessRole)
                    .sort((a, b) => {
                      const roleOrder: Record<string, number> = { OWNER: 0, ADMIN: 1, COACH: 2, FRONT_DESK: 3 };
                      return (roleOrder[a.accessRole!] ?? 99) - (roleOrder[b.accessRole!] ?? 99);
                    })
                    .map((m) => {
                      const roleDef = ROLES.find((r) => r.key === m.accessRole);
                      return (
                        <div key={m.id} className="flex items-center justify-between px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">
                              {m.firstName} {m.lastName}
                            </span>
                            <span className="inline-block rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[10px] font-semibold">
                              {roleDef?.label || m.accessRole}
                            </span>
                          </div>
                          <button
                            onClick={() => removeRoleFromMember(m.id)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            {/* Email Notification Settings */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">Email Notifications</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure email notifications sent to members via Resend.
              </p>

              {/* Resend API Key */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Resend API Key</label>
                <input
                  type="password"
                  value={resendApiKey}
                  onChange={(e) => setResendApiKey(e.target.value)}
                  placeholder="re_xxxxxxxxxxxx"
                  className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Get your API key from resend.com. Required for email notifications.
                </p>
              </div>

              {/* Master toggle */}
              <div className="space-y-4">
                <label className="flex items-center justify-between pb-4 border-b border-gray-200">
                  <div>
                    <p className="font-medium text-gray-900">Enable email notifications</p>
                    <p className="text-sm text-gray-500">Master switch for all member email notifications</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifySettings.notify_email_enabled}
                    onChange={(e) => setNotifySettings(s => ({ ...s, notify_email_enabled: e.target.checked }))}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>

                {/* Per-event toggles */}
                {[
                  { key: "notify_welcome_email", label: "Welcome email", desc: "Sent when a new member is created" },
                  { key: "notify_invoice_created", label: "Invoice created", desc: "Sent when a billing invoice is generated" },
                  { key: "notify_payment_received", label: "Payment received", desc: "Sent when a payment is recorded" },
                  { key: "notify_past_due", label: "Past due alert", desc: "Sent when an invoice becomes past due" },
                  { key: "notify_promotion", label: "Promotion congratulations", desc: "Sent when a member is promoted" },
                  { key: "notify_class_reminder", label: "Class reminders", desc: "Sent before upcoming classes" },
                  { key: "notify_membership_expiry", label: "Membership expiry warning", desc: "Sent before a membership expires" },
                  { key: "notify_promotion_eligible", label: "Promotion eligibility alert", desc: "Admin email when members meet all promotion requirements" },
                  { key: "notify_birthday", label: "Birthday greetings", desc: "Sent to members on their birthday" },
                  { key: "notify_inactive_reengagement", label: "Inactive re-engagement", desc: "Sent to members who haven't attended in 30+ days" },
                  { key: "notify_renewal_reminder", label: "Renewal reminders", desc: "Sent before non-recurring memberships expire" },
                  { key: "notify_trial_expiring", label: "Trial expiring", desc: "Sent when trial passes are about to expire" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notifySettings[item.key]}
                      disabled={!notifySettings.notify_email_enabled}
                      onChange={(e) => setNotifySettings(s => ({ ...s, [item.key]: e.target.checked }))}
                      className="rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-40"
                    />
                  </label>
                ))}
              </div>

              <div className="flex justify-end mt-6">
                <button
                  onClick={handleSaveNotifications}
                  disabled={savingNotifications}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingNotifications ? "Saving..." : "Save Notification Settings"}
                </button>
              </div>
            </div>

            {/* Billing & Dunning Settings */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-2">Billing & Payment Retry</h3>
              <p className="text-sm text-gray-500 mb-4">
                Configure automatic payment retry behavior for failed charges.
              </p>
              <div className="space-y-4">
                <label className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Enable automatic payment retry</p>
                    <p className="text-sm text-gray-500">Automatically retry failed charges on a schedule</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={dunningEnabled}
                    onChange={(e) => setDunningEnabled(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Maximum retry attempts
                  </label>
                  <select
                    value={dunningMaxRetries}
                    onChange={(e) => setDunningMaxRetries(Number(e.target.value))}
                    disabled={!dunningEnabled}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>{n} {n === 1 ? "attempt" : "attempts"}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    After this many failed charges, the membership will be paused and the unpaid amount added as a negative balance.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Grace period (days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={billingGracePeriod}
                    onChange={(e) => setBillingGracePeriod(Number(e.target.value) || 0)}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Days after due date before marking an invoice as past due.
                  </p>
                </div>
                <label className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Auto-generate invoices</p>
                    <p className="text-sm text-gray-500">Automatically create invoices when membership payments are due</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={billingAutoGenerate}
                    onChange={(e) => setBillingAutoGenerate(e.target.checked)}
                    className="rounded border-gray-300 text-primary focus:ring-primary"
                  />
                </label>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={handleSaveDunning}
                  disabled={savingDunning}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingDunning ? "Saving..." : "Save Billing Settings"}
                </button>
                <button
                  onClick={runBillingNow}
                  disabled={runningBilling}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                >
                  {runningBilling ? "Running..." : "Run Billing Now"}
                </button>
                {billingRunResult && (
                  <span className="text-xs text-green-600 font-medium">{billingRunResult}</span>
                )}
              </div>
            </div>

            {/* Display Settings */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Display Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Dark Mode</p>
                    <p className="text-sm text-gray-500">Switch between light and dark themes</p>
                  </div>
                  <button
                    onClick={toggleTheme}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      theme === "dark" ? "bg-primary" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        theme === "dark" ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date Format
                  </label>
                  <select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value)}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option>MM/DD/YYYY</option>
                    <option>DD/MM/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Time Format
                  </label>
                  <select
                    value={timeFormat}
                    onChange={(e) => setTimeFormat(e.target.value)}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option>12-hour (AM/PM)</option>
                    <option>24-hour</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Week starts on
                  </label>
                  <select
                    value={weekStartsOn}
                    onChange={(e) => setWeekStartsOn(e.target.value)}
                    className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option>Sunday</option>
                    <option>Monday</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <button
                  onClick={handleSaveDisplay}
                  disabled={savingDisplay}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingDisplay ? "Saving..." : "Save Display Settings"}
                </button>
              </div>
            </div>

            {/* Data & Privacy */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-4">Data & Privacy</h3>
              <div className="space-y-4">
                <div>
                  <button
                    onClick={handleExportData}
                    disabled={exporting}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {exporting ? "Exporting..." : "Quick Export (Members + Attendance + Settings)"}
                  </button>
                  <p className="text-sm text-gray-500 mt-1">
                    Lightweight export of core data.
                  </p>
                </div>
                <div>
                  <button
                    onClick={async () => {
                      try {
                        const countsRes = await fetch("/api/export/counts");
                        const { counts, total } = await countsRes.json();
                        const summary = Object.entries(counts as Record<string, number>)
                          .filter(([, v]) => v > 0)
                          .map(([k, v]) => `  ${k}: ${v}`)
                          .join("\n");
                        if (!confirm(`Full Database Backup\n\nTotal records: ${total}\n${summary}\n\nDownload full backup?`)) return;
                        window.location.href = "/api/export/full-backup";
                      } catch {
                        alert("Failed to prepare backup");
                      }
                    }}
                    className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
                  >
                    Full Database Backup
                  </button>
                  <p className="text-sm text-gray-500 mt-1">
                    Download every table (members, memberships, invoices, classes, attendance, waivers, and more) as JSON.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payments Tab */}
        {activeTab === "payments" && (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">
              Configure payment processors for accepting credit card payments. Each processor requires API credentials from their respective dashboards.
            </p>

            {/* Active Processor Selector */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-lg font-semibold mb-1">Active Payment Processor</h3>
              <p className="text-xs text-gray-500 mb-4">
                Choose which processor handles all card payments (POS, portal, auto-billing). Only one can be active at a time.
              </p>
              <div className="flex flex-wrap gap-3">
                {([
                  { value: "stripe", label: "Stripe", color: "indigo" },
                  { value: "paypal", label: "PayPal", color: "blue" },
                  { value: "square", label: "Square", color: "green" },
                  { value: "none", label: "None (disabled)", color: "gray" },
                ] as const).map((opt) => {
                  const isActive = (paymentSettings.payment_active_processor || "none") === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => updatePayment("payment_active_processor", opt.value)}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 transition-colors ${
                        isActive
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {paymentSettings.payment_active_processor && paymentSettings.payment_active_processor !== "none" && (
                <p className="text-xs text-green-600 mt-2 font-medium">
                  All payments will be processed through {paymentSettings.payment_active_processor.charAt(0).toUpperCase() + paymentSettings.payment_active_processor.slice(1)}.
                </p>
              )}
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSavePayments}
                  disabled={savingPayments}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingPayments ? "Saving..." : "Save"}
                </button>
              </div>
            </div>

            {/* Stripe */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Stripe</h3>
                    <p className="text-xs text-gray-500">Accept credit cards, debit cards, and digital wallets</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePayment("payment_stripe_enabled", paymentSettings.payment_stripe_enabled === "true" ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    paymentSettings.payment_stripe_enabled === "true" ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      paymentSettings.payment_stripe_enabled === "true" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Publishable Key</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["stripe_pk"] ? "text" : "password"}
                      value={paymentSettings.payment_stripe_publishable_key || ""}
                      onChange={(e) => updatePayment("payment_stripe_publishable_key", e.target.value)}
                      placeholder="pk_live_..."
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, stripe_pk: !p.stripe_pk }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                      title={showSecrets["stripe_pk"] ? "Hide" : "Show"}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["stripe_pk"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Secret Key</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["stripe_sk"] ? "text" : "password"}
                      value={paymentSettings.payment_stripe_secret_key || ""}
                      onChange={(e) => updatePayment("payment_stripe_secret_key", e.target.value)}
                      placeholder="sk_live_..."
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, stripe_sk: !p.stripe_sk }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                      title={showSecrets["stripe_sk"] ? "Hide" : "Show"}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["stripe_sk"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Webhook Secret</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["stripe_wh"] ? "text" : "password"}
                      value={paymentSettings.payment_stripe_webhook_secret || ""}
                      onChange={(e) => updatePayment("payment_stripe_webhook_secret", e.target.value)}
                      placeholder="whsec_..."
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, stripe_wh: !p.stripe_wh }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                      title={showSecrets["stripe_wh"] ? "Hide" : "Show"}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["stripe_wh"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {connectionStatus.stripe ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${connectionStatus.stripe.ok ? "text-green-600" : "text-red-600"}`}>
                      <span className={`w-2 h-2 rounded-full ${connectionStatus.stripe.ok ? "bg-green-500" : "bg-red-500"}`} />
                      {connectionStatus.stripe.msg}
                    </span>
                  ) : (paymentSettings.payment_stripe_secret_key) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not tested
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not configured
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestConnection("stripe")}
                    disabled={testingConnection === "stripe" || !paymentSettings.payment_stripe_secret_key}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingConnection === "stripe" ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    onClick={handleSavePayments}
                    disabled={savingPayments}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {savingPayments ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Get your API keys from dashboard.stripe.com/apikeys
              </p>
              <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-1">Webhook URL (configure in Stripe Dashboard &rarr; Webhooks)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200 flex-1 overflow-x-auto">{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/stripe</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/stripe`); setSuccessMessage("Copied!"); setTimeout(() => setSuccessMessage(""), 2000); }}
                    className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* PayPal */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 00-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 00-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 00.554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 01.923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">PayPal</h3>
                    <p className="text-xs text-gray-500">Accept PayPal payments and credit cards via PayPal</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePayment("payment_paypal_enabled", paymentSettings.payment_paypal_enabled === "true" ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    paymentSettings.payment_paypal_enabled === "true" ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      paymentSettings.payment_paypal_enabled === "true" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Client ID</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["paypal_id"] ? "text" : "password"}
                      value={paymentSettings.payment_paypal_client_id || ""}
                      onChange={(e) => updatePayment("payment_paypal_client_id", e.target.value)}
                      placeholder="Client ID from PayPal Developer"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, paypal_id: !p.paypal_id }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["paypal_id"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Client Secret</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["paypal_secret"] ? "text" : "password"}
                      value={paymentSettings.payment_paypal_client_secret || ""}
                      onChange={(e) => updatePayment("payment_paypal_client_secret", e.target.value)}
                      placeholder="Client Secret from PayPal Developer"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, paypal_secret: !p.paypal_secret }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["paypal_secret"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mode</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paypal_mode"
                        checked={paymentSettings.payment_paypal_sandbox !== "true"}
                        onChange={() => updatePayment("payment_paypal_sandbox", "false")}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Live</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="paypal_mode"
                        checked={paymentSettings.payment_paypal_sandbox === "true"}
                        onChange={() => updatePayment("payment_paypal_sandbox", "true")}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Sandbox</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Webhook ID <span className="text-gray-400">(optional, for webhook verification)</span></label>
                  <input
                    type={showSecrets["paypal_wh"] ? "text" : "password"}
                    value={paymentSettings.payment_paypal_webhook_id || ""}
                    onChange={(e) => updatePayment("payment_paypal_webhook_id", e.target.value)}
                    placeholder="Webhook ID from PayPal Developer"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {connectionStatus.paypal ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${connectionStatus.paypal.ok ? "text-green-600" : "text-red-600"}`}>
                      <span className={`w-2 h-2 rounded-full ${connectionStatus.paypal.ok ? "bg-green-500" : "bg-red-500"}`} />
                      {connectionStatus.paypal.msg}
                    </span>
                  ) : (paymentSettings.payment_paypal_client_id) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not tested
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not configured
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestConnection("paypal")}
                    disabled={testingConnection === "paypal" || !paymentSettings.payment_paypal_client_id || !paymentSettings.payment_paypal_client_secret}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingConnection === "paypal" ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    onClick={handleSavePayments}
                    disabled={savingPayments}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {savingPayments ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Get your API keys from developer.paypal.com
              </p>
              <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-1">Webhook URL (configure in PayPal Developer Dashboard &rarr; Webhooks)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200 flex-1 overflow-x-auto">{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/paypal</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/paypal`); setSuccessMessage("Copied!"); setTimeout(() => setSuccessMessage(""), 2000); }}
                    className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* Square */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M4.01 0A4.005 4.005 0 000 4.01v15.98C0 22.2 1.8 24 4.01 24h15.98C22.2 24 24 22.2 24 19.99V4.01C24 1.8 22.2 0 19.99 0H4.01zm3.124 5.333h9.732a1.8 1.8 0 011.8 1.8v9.734a1.8 1.8 0 01-1.8 1.8H7.134a1.8 1.8 0 01-1.8-1.8V7.133a1.8 1.8 0 011.8-1.8zm1.267 2.8a.467.467 0 00-.467.467v6.8c0 .258.209.467.467.467h6.8a.467.467 0 00.466-.467V8.6a.467.467 0 00-.467-.467H8.4z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Square</h3>
                    <p className="text-xs text-gray-500">Accept payments via Square terminals and online</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updatePayment("payment_square_enabled", paymentSettings.payment_square_enabled === "true" ? "false" : "true")}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    paymentSettings.payment_square_enabled === "true" ? "bg-primary" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      paymentSettings.payment_square_enabled === "true" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Application ID</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["square_app"] ? "text" : "password"}
                      value={paymentSettings.payment_square_application_id || ""}
                      onChange={(e) => updatePayment("payment_square_application_id", e.target.value)}
                      placeholder="Application ID from Square Developer"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, square_app: !p.square_app }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["square_app"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Access Token</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["square_token"] ? "text" : "password"}
                      value={paymentSettings.payment_square_access_token || ""}
                      onChange={(e) => updatePayment("payment_square_access_token", e.target.value)}
                      placeholder="Access Token from Square Developer"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, square_token: !p.square_token }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["square_token"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Location ID</label>
                  <div className="flex gap-2">
                    <input
                      type={showSecrets["square_loc"] ? "text" : "password"}
                      value={paymentSettings.payment_square_location_id || ""}
                      onChange={(e) => updatePayment("payment_square_location_id", e.target.value)}
                      placeholder="Location ID from Square Dashboard"
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecrets((p) => ({ ...p, square_loc: !p.square_loc }))}
                      className="px-2 text-gray-400 hover:text-gray-600"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showSecrets["square_loc"] ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mode</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="square_mode"
                        checked={paymentSettings.payment_square_sandbox !== "true"}
                        onChange={() => updatePayment("payment_square_sandbox", "false")}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Live</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="square_mode"
                        checked={paymentSettings.payment_square_sandbox === "true"}
                        onChange={() => updatePayment("payment_square_sandbox", "true")}
                        className="text-primary focus:ring-primary"
                      />
                      <span className="text-sm">Sandbox</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Webhook Signature Key <span className="text-gray-400">(optional, for webhook verification)</span></label>
                  <input
                    type={showSecrets["square_wh"] ? "text" : "password"}
                    value={paymentSettings.payment_square_webhook_signature_key || ""}
                    onChange={(e) => updatePayment("payment_square_webhook_signature_key", e.target.value)}
                    placeholder="Signature Key from Square Developer"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  {connectionStatus.square ? (
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${connectionStatus.square.ok ? "text-green-600" : "text-red-600"}`}>
                      <span className={`w-2 h-2 rounded-full ${connectionStatus.square.ok ? "bg-green-500" : "bg-red-500"}`} />
                      {connectionStatus.square.msg}
                    </span>
                  ) : (paymentSettings.payment_square_access_token) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not tested
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                      <span className="w-2 h-2 rounded-full bg-gray-300" />
                      Not configured
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestConnection("square")}
                    disabled={testingConnection === "square" || !paymentSettings.payment_square_access_token}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testingConnection === "square" ? "Testing..." : "Test Connection"}
                  </button>
                  <button
                    onClick={handleSavePayments}
                    disabled={savingPayments}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {savingPayments ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Get your API keys from developer.squareup.com
              </p>
              <div className="mt-3 p-3 bg-gray-50 rounded-md border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-1">Webhook URL (configure in Square Developer Dashboard &rarr; Webhooks)</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white px-2 py-1 rounded border border-gray-200 flex-1 overflow-x-auto">{typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/square</code>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/square`); setSuccessMessage("Copied!"); setTimeout(() => setSuccessMessage(""), 2000); }}
                    className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 whitespace-nowrap"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Location Create/Edit Modal */}
      {showLocModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingLocId ? "Edit Location" : "Add Location"}</h3>
              <button onClick={() => setShowLocModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  value={locForm.name}
                  onChange={(e) => setLocForm({ ...locForm, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="Main Dojo"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                <input
                  value={locForm.address}
                  onChange={(e) => setLocForm({ ...locForm, address: e.target.value })}
                  autoComplete="off"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="123 Main St"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                  <input
                    value={locForm.city}
                    onChange={(e) => setLocForm({ ...locForm, city: e.target.value })}
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                  <input
                    value={locForm.state}
                    onChange={(e) => setLocForm({ ...locForm, state: e.target.value })}
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Zip</label>
                  <input
                    value={locForm.zipCode}
                    onChange={(e) => setLocForm({ ...locForm, zipCode: e.target.value })}
                    autoComplete="off"
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                <input
                  value={locForm.phone}
                  onChange={(e) => setLocForm({ ...locForm, phone: e.target.value })}
                  autoComplete="off"
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowLocModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLoc}
                  disabled={savingLoc || !locForm.name.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingLoc ? "Saving..." : editingLocId ? "Save Changes" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Space Create/Edit Modal */}
      {showSpaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{editingSpaceId ? "Edit Space" : "Add Space"}</h3>
              <button onClick={() => setShowSpaceModal(false)} className="text-gray-400 hover:text-gray-600 text-lg">&times;</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  value={spaceForm.name}
                  onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  placeholder="e.g., Mat 1, Ring, Cage"
                />
              </div>
              {locations.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Location</label>
                  <select
                    value={spaceForm.locationId}
                    onChange={(e) => setSpaceForm({ ...spaceForm, locationId: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="">No specific location</option>
                    {locations.filter((l) => l.isActive).map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowSpaceModal(false)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSpace}
                  disabled={savingSpace || !spaceForm.name.trim()}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                >
                  {savingSpace ? "Saving..." : editingSpaceId ? "Save Changes" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
