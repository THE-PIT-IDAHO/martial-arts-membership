"use client";

import { useEffect, useState, useRef } from "react";
import { AppLayout } from "@/components/app-layout";
import Link from "next/link";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  parentGuardianName?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  waiverSigned: boolean;
  waiverSignedAt?: string | null;
};

type WaiverSection = {
  id: string;
  title: string;
  content: string;
};

type GymSettings = {
  name: string;
  address: string;
  phone: string;
  email: string;
};

// Available placeholders for templates
const PLACEHOLDERS = [
  { key: "{{MEMBER_NAME}}", label: "Member Name", description: "Full name of the member" },
  { key: "{{MEMBER_FIRST_NAME}}", label: "Member First Name", description: "First name only" },
  { key: "{{MEMBER_LAST_NAME}}", label: "Member Last Name", description: "Last name only" },
  { key: "{{PARENT_GUARDIAN}}", label: "Parent/Guardian", description: "Parent or guardian name" },
  { key: "{{GYM_NAME}}", label: "Gym Name", description: "Name of your gym/dojo" },
  { key: "{{GYM_ADDRESS}}", label: "Gym Address", description: "Gym street address" },
  { key: "{{GYM_PHONE}}", label: "Gym Phone", description: "Gym phone number" },
  { key: "{{GYM_EMAIL}}", label: "Gym Email", description: "Gym email address" },
  { key: "{{DATE}}", label: "Current Date", description: "Today's date" },
];

const DEFAULT_GYM_SETTINGS: GymSettings = {
  name: "Our Martial Arts School",
  address: "",
  phone: "",
  email: "",
};

type WaiverOptions = {
  includeMinorSignature: boolean; // Show signature field for 14-17 year olds
  includeMinorEmail: boolean; // Show email field for 14-17 year olds
};

const DEFAULT_WAIVER_OPTIONS: WaiverOptions = {
  includeMinorSignature: true,
  includeMinorEmail: true,
};

// Function to replace placeholders with actual values
function replacePlaceholders(
  text: string,
  member: Member | null,
  gym: GymSettings
): string {
  if (!text) return text;

  let result = text;

  // Member placeholders
  if (member) {
    result = result.replace(/\{\{MEMBER_NAME\}\}/g, `${member.firstName} ${member.lastName}`.trim());
    result = result.replace(/\{\{MEMBER_FIRST_NAME\}\}/g, member.firstName || "");
    result = result.replace(/\{\{MEMBER_LAST_NAME\}\}/g, member.lastName || "");
    result = result.replace(/\{\{PARENT_GUARDIAN\}\}/g, member.parentGuardianName || "[Parent/Guardian]");
  }

  // Gym placeholders
  result = result.replace(/\{\{GYM_NAME\}\}/g, gym.name || "[Gym Name]");
  result = result.replace(/\{\{GYM_ADDRESS\}\}/g, gym.address || "[Gym Address]");
  result = result.replace(/\{\{GYM_PHONE\}\}/g, gym.phone || "[Gym Phone]");
  result = result.replace(/\{\{GYM_EMAIL\}\}/g, gym.email || "[Gym Email]");

  // Date placeholder
  result = result.replace(/\{\{DATE\}\}/g, new Date().toLocaleDateString());

  return result;
}

// Function to highlight placeholders in text for display
function highlightPlaceholders(text: string): React.ReactNode {
  if (!text) return text;

  const parts = text.split(/(\{\{[A-Z_]+\}\})/g);

  return parts.map((part, idx) => {
    if (part.match(/^\{\{[A-Z_]+\}\}$/)) {
      return (
        <span key={idx} className="bg-yellow-200 text-yellow-800 px-1 rounded font-mono text-xs">
          {part}
        </span>
      );
    }
    return part;
  });
}

const DEFAULT_WAIVER_SECTIONS: WaiverSection[] = [
  {
    id: "assumption_of_risk",
    title: "ASSUMPTION OF RISK",
    content: "I, {{MEMBER_NAME}}, understand that martial arts training at {{GYM_NAME}} involves physical contact and strenuous physical activity. I acknowledge that there are inherent risks associated with martial arts training including, but not limited to, bruises, sprains, strains, fractures, and other injuries that may occur during training, sparring, or practice."
  },
  {
    id: "waiver_release",
    title: "WAIVER AND RELEASE",
    content: "In consideration of being permitted to participate in martial arts classes, training, and related activities at {{GYM_NAME}}, I hereby waive, release, and discharge {{GYM_NAME}}, its owners, instructors, employees, and agents from any and all liability, claims, demands, and causes of action arising out of or related to any loss, damage, or injury that may be sustained by me or my minor child while participating in such activities."
  },
  {
    id: "medical_authorization",
    title: "MEDICAL AUTHORIZATION",
    content: "I authorize the staff of {{GYM_NAME}} to obtain emergency medical treatment for myself or my minor child if necessary. I understand that I am responsible for any medical expenses incurred."
  },
  {
    id: "photo_video_release",
    title: "PHOTO/VIDEO RELEASE",
    content: "I grant {{GYM_NAME}} permission for photographs and/or videos taken during classes or events to be used for promotional purposes, including but not limited to websites, social media, and marketing materials."
  },
  {
    id: "rules_regulations",
    title: "RULES AND REGULATIONS",
    content: "I agree to abide by all rules and regulations of {{GYM_NAME}}. I understand that failure to follow instructions or rules may result in dismissal from the program without refund."
  },
  {
    id: "health_declaration",
    title: "HEALTH DECLARATION",
    content: "I, {{MEMBER_NAME}}, certify that I (or my minor child) am in good physical condition and have no medical conditions that would prevent safe participation in martial arts training. I agree to notify the instructors of any changes in health status."
  },
  {
    id: "closing_statement",
    title: "",
    content: "I, {{MEMBER_NAME}}, HAVE READ THIS WAIVER AND RELEASE, FULLY UNDERSTAND ITS TERMS, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT."
  }
];

export default function WaiversPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "signed" | "unsigned">("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modalMember, setModalMember] = useState<Member | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [waiverSections, setWaiverSections] = useState<WaiverSection[]>(DEFAULT_WAIVER_SECTIONS);
  const [editingSections, setEditingSections] = useState<WaiverSection[]>([]);
  const [gymSettings, setGymSettings] = useState<GymSettings>(DEFAULT_GYM_SETTINGS);
  const [editingGymSettings, setEditingGymSettings] = useState<GymSettings>(DEFAULT_GYM_SETTINGS);
  const [waiverOptions, setWaiverOptions] = useState<WaiverOptions>(DEFAULT_WAIVER_OPTIONS);
  const [editingWaiverOptions, setEditingWaiverOptions] = useState<WaiverOptions>(DEFAULT_WAIVER_OPTIONS);
  const [savingWaiver, setSavingWaiver] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadData() {
      try {
        // Load members
        const membersRes = await fetch("/api/members");
        if (membersRes.ok) {
          const data = await membersRes.json();
          setMembers(data.members || []);
        }

        // Load waiver content
        const settingsRes = await fetch("/api/settings?key=waiver_content");
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.setting?.value) {
            try {
              const parsed = JSON.parse(data.setting.value);
              setWaiverSections(parsed);
            } catch {
              // Use defaults if parsing fails
            }
          }
        }

        // Load gym settings
        const gymRes = await fetch("/api/settings?key=gym_settings");
        if (gymRes.ok) {
          const data = await gymRes.json();
          if (data.setting?.value) {
            try {
              const parsed = JSON.parse(data.setting.value);
              setGymSettings(parsed);
            } catch {
              // Use defaults if parsing fails
            }
          }
        }

        // Load waiver options
        const optionsRes = await fetch("/api/settings?key=waiver_options");
        if (optionsRes.ok) {
          const data = await optionsRes.json();
          if (data.setting?.value) {
            try {
              const parsed = JSON.parse(data.setting.value);
              setWaiverOptions({ ...DEFAULT_WAIVER_OPTIONS, ...parsed });
            } catch {
              // Use defaults if parsing fails
            }
          }
        }
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Filter and search members
  const filteredMembers = members.filter((m) => {
    // Filter by waiver status
    if (filter === "signed" && !m.waiverSigned) return false;
    if (filter === "unsigned" && m.waiverSigned) return false;

    // Search by name
    if (search) {
      const searchLower = search.toLowerCase();
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      if (!fullName.includes(searchLower)) return false;
    }

    return true;
  });

  // Stats
  const totalMembers = members.length;
  const signedCount = members.filter((m) => m.waiverSigned).length;
  const unsignedCount = totalMembers - signedCount;

  function copyWaiverLink(memberId: string) {
    const url = `${window.location.origin}/waiver/sign/${memberId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(memberId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function resetWaiver(memberId: string) {
    if (!window.confirm("Are you sure you want to reset this waiver? The member will need to sign again.")) {
      return;
    }

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waiverSigned: false,
          waiverSignedAt: null,
        }),
      });

      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId ? { ...m, waiverSigned: false, waiverSignedAt: null } : m
          )
        );
      }
    } catch (err) {
      console.error("Failed to reset waiver:", err);
    }
  }

  async function openWaiverModal(memberId: string) {
    try {
      const res = await fetch(`/api/members/${memberId}`);
      if (res.ok) {
        const data = await res.json();
        setModalMember(data.member);
      }
    } catch (err) {
      console.error("Failed to load member:", err);
    }
  }

  function openEditModal() {
    setEditingSections(JSON.parse(JSON.stringify(waiverSections)));
    setEditingGymSettings(JSON.parse(JSON.stringify(gymSettings)));
    setEditingWaiverOptions(JSON.parse(JSON.stringify(waiverOptions)));
    setShowEditModal(true);
  }

  function updateSection(index: number, field: "title" | "content", value: string) {
    setEditingSections(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addSection() {
    setEditingSections(prev => [
      ...prev.slice(0, -1), // Remove closing statement temporarily
      {
        id: `custom_${Date.now()}`,
        title: "NEW SECTION",
        content: "Enter content here..."
      },
      prev[prev.length - 1] // Add closing statement back at end
    ]);
  }

  function removeSection(index: number) {
    if (editingSections[index].id === "closing_statement") return; // Don't allow removing closing
    setEditingSections(prev => prev.filter((_, i) => i !== index));
  }

  async function saveWaiverContent() {
    setSavingWaiver(true);
    try {
      // Save waiver content
      const waiverRes = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "waiver_content",
          value: JSON.stringify(editingSections)
        }),
      });

      // Save gym settings
      const gymRes = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "gym_settings",
          value: JSON.stringify(editingGymSettings)
        }),
      });

      // Save waiver options
      const optionsRes = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "waiver_options",
          value: JSON.stringify(editingWaiverOptions)
        }),
      });

      if (waiverRes.ok && gymRes.ok && optionsRes.ok) {
        setWaiverSections(editingSections);
        setGymSettings(editingGymSettings);
        setWaiverOptions(editingWaiverOptions);
        setShowEditModal(false);
      }
    } catch (err) {
      console.error("Failed to save waiver content:", err);
    } finally {
      setSavingWaiver(false);
    }
  }

  function resetToDefaults() {
    if (window.confirm("Reset waiver content to defaults? This will discard your custom content.")) {
      setEditingSections(JSON.parse(JSON.stringify(DEFAULT_WAIVER_SECTIONS)));
    }
  }

  function handlePrint() {
    if (printRef.current) {
      const printContent = printRef.current.innerHTML;
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Waiver Form - ${modalMember?.firstName} ${modalMember?.lastName}</title>
              <style>
                @media print {
                  body { margin: 0; padding: 20px; }
                }
                body {
                  font-family: Georgia, 'Times New Roman', serif;
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 40px;
                  line-height: 1.6;
                  color: #333;
                }
                h1 { text-align: center; font-size: 24px; margin-bottom: 10px; }
                h2 { font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 5px; margin-top: 25px; }
                .subtitle { text-align: center; font-size: 14px; color: #666; margin-bottom: 30px; }
                .field { margin-bottom: 10px; }
                .field-label { font-weight: bold; display: inline-block; min-width: 150px; }
                .field-value { border-bottom: 1px solid #999; display: inline-block; min-width: 200px; padding: 2px 5px; }
                .terms { background: #f9f9f9; padding: 15px; border: 1px solid #ddd; margin: 20px 0; font-size: 12px; }
                .terms p { margin-bottom: 10px; }
                .signature-line { margin-top: 40px; display: flex; justify-content: space-between; }
                .signature-box { width: 45%; }
                .signature-box p { border-bottom: 1px solid #333; padding-bottom: 5px; min-height: 40px; }
                .signature-box span { font-size: 12px; color: #666; }
                .checkbox-item { margin-bottom: 8px; }
                .status-signed { color: green; font-weight: bold; }
                .status-pending { color: orange; font-weight: bold; }
              </style>
            </head>
            <body>
              ${printContent}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header with action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Waivers</h1>
            <p className="text-sm text-gray-500">
              Manage liability waivers for all members
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/waivers/blank"
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Blank Waivers
            </Link>
            <button
              onClick={openEditModal}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit Waiver Content
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Total Members</div>
            <div className="text-2xl font-bold text-gray-900">{totalMembers}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Waivers Signed</div>
            <div className="text-2xl font-bold text-green-600">{signedCount}</div>
            <div className="text-xs text-gray-400">
              {totalMembers > 0 ? Math.round((signedCount / totalMembers) * 100) : 0}% complete
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Pending Signatures</div>
            <div className="text-2xl font-bold text-orange-600">{unsignedCount}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "all"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                All ({totalMembers})
              </button>
              <button
                onClick={() => setFilter("signed")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "signed"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Signed ({signedCount})
              </button>
              <button
                onClick={() => setFilter("unsigned")}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                  filter === "unsigned"
                    ? "bg-primary text-white hover:bg-primaryDark"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                Pending ({unsignedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Members List */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No members found matching your criteria.
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    Member
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    Contact
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    Waiver Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMembers.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/members/${member.id}`}
                        className="font-medium text-gray-900 hover:text-primary"
                      >
                        {member.firstName} {member.lastName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {member.email || member.phone || "-"}
                    </td>
                    <td className="px-4 py-3">
                      {member.waiverSigned ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Signed
                          </span>
                          {member.waiverSignedAt && (
                            <div className="text-xs text-gray-400">
                              {new Date(member.waiverSignedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-600 text-sm font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => copyWaiverLink(member.id)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          {copiedId === member.id ? "Copied!" : "Copy Link"}
                        </button>
                        <button
                          onClick={() => openWaiverModal(member.id)}
                          className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Open Form
                        </button>
                        {member.waiverSigned && (
                          <button
                            onClick={() => resetWaiver(member.id)}
                            className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Info Box */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">
            How to Use Waivers
          </h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>
              <strong>Copy Link:</strong> Get a unique waiver link for the member to fill out online.
            </li>
            <li>
              <strong>Open Form:</strong> Opens the waiver form in a popup (useful for in-person signing or printing).
            </li>
            <li>
              <strong>Reset:</strong> Clears the waiver status so the member can sign again (e.g., for annual renewals).
            </li>
          </ul>
        </div>
      </div>

      {/* Waiver Modal */}
      {modalMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div>
                <h2 className="text-lg font-bold">Waiver Form</h2>
                <p className="text-sm text-gray-500">
                  {modalMember.firstName} {modalMember.lastName}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePrint}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print / Save as PDF
                </button>
                <Link
                  href={`/waiver/sign/${modalMember.id}`}
                  target="_blank"
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Open Full Form
                </Link>
                <button
                  onClick={() => setModalMember(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content - PDF Style View */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
              <div
                ref={printRef}
                className="bg-white shadow-lg mx-auto max-w-3xl p-8"
                style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
              >
                <h1 style={{ textAlign: "center", fontSize: "24px", marginBottom: "10px" }}>
                  Liability Waiver & Release Form
                </h1>
                <div className="subtitle" style={{ textAlign: "center", fontSize: "14px", color: "#666", marginBottom: "30px" }}>
                  Martial Arts Training Agreement
                </div>

                {/* Status Banner */}
                {modalMember.waiverSigned ? (
                  <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", padding: "10px 15px", borderRadius: "4px", marginBottom: "20px", textAlign: "center" }}>
                    <span className="status-signed" style={{ color: "#059669", fontWeight: "bold" }}>
                      SIGNED on {modalMember.waiverSignedAt ? new Date(modalMember.waiverSignedAt).toLocaleDateString() : "N/A"}
                    </span>
                  </div>
                ) : (
                  <div style={{ background: "#fef3c7", border: "1px solid #fbbf24", padding: "10px 15px", borderRadius: "4px", marginBottom: "20px", textAlign: "center" }}>
                    <span className="status-pending" style={{ color: "#d97706", fontWeight: "bold" }}>
                      PENDING SIGNATURE
                    </span>
                  </div>
                )}

                {/* Participant Information */}
                <h2 style={{ fontSize: "16px", borderBottom: "1px solid #333", paddingBottom: "5px", marginTop: "25px" }}>
                  Participant Information
                </h2>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Full Name:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.firstName} {modalMember.lastName}
                  </span>
                </div>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Date of Birth:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.dateOfBirth ? new Date(modalMember.dateOfBirth).toLocaleDateString() : "_______________"}
                  </span>
                </div>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Phone:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.phone || "_______________"}
                  </span>
                </div>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Email:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.email || "_______________"}
                  </span>
                </div>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Address:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "350px", padding: "2px 5px" }}>
                    {[modalMember.address, modalMember.city, modalMember.state, modalMember.zipCode].filter(Boolean).join(", ") || "_______________"}
                  </span>
                </div>

                {/* Emergency Contact */}
                <h2 style={{ fontSize: "16px", borderBottom: "1px solid #333", paddingBottom: "5px", marginTop: "25px" }}>
                  Emergency Contact
                </h2>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Contact Name:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.emergencyContactName || "_______________"}
                  </span>
                </div>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Contact Phone:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.emergencyContactPhone || "_______________"}
                  </span>
                </div>

                {/* Parent/Guardian */}
                <h2 style={{ fontSize: "16px", borderBottom: "1px solid #333", paddingBottom: "5px", marginTop: "25px" }}>
                  Parent/Guardian Information
                  <span style={{ fontSize: "12px", fontWeight: "normal", color: "#666", marginLeft: "10px" }}>(Required for participants under 18)</span>
                </h2>
                <div className="field" style={{ marginBottom: "10px" }}>
                  <span className="field-label" style={{ fontWeight: "bold", display: "inline-block", minWidth: "150px" }}>Parent/Guardian:</span>
                  <span className="field-value" style={{ borderBottom: "1px solid #999", display: "inline-block", minWidth: "200px", padding: "2px 5px" }}>
                    {modalMember.parentGuardianName || "_______________"}
                  </span>
                </div>

                {/* Waiver Terms */}
                <h2 style={{ fontSize: "16px", borderBottom: "1px solid #333", paddingBottom: "5px", marginTop: "25px" }}>
                  Waiver & Release of Liability
                </h2>
                <div className="terms" style={{ background: "#f9f9f9", padding: "15px", border: "1px solid #ddd", margin: "20px 0", fontSize: "12px" }}>
                  {waiverSections.map((section, idx) => (
                    <p key={section.id} style={{ marginBottom: idx === waiverSections.length - 1 ? "0" : "10px" }}>
                      {section.title && <strong>{section.title}:</strong>} {replacePlaceholders(section.content, modalMember, gymSettings)}
                    </p>
                  ))}
                </div>

                {/* Signature Section */}
                <div className="signature-line" style={{ marginTop: "40px", display: "flex", justifyContent: "space-between" }}>
                  <div className="signature-box" style={{ width: "45%" }}>
                    <p style={{ borderBottom: "1px solid #333", paddingBottom: "5px", minHeight: "40px" }}>
                      {modalMember.waiverSigned ? `${modalMember.firstName} ${modalMember.lastName}` : ""}
                    </p>
                    <span style={{ fontSize: "12px", color: "#666" }}>Signature</span>
                  </div>
                  <div className="signature-box" style={{ width: "45%" }}>
                    <p style={{ borderBottom: "1px solid #333", paddingBottom: "5px", minHeight: "40px" }}>
                      {modalMember.waiverSignedAt ? new Date(modalMember.waiverSignedAt).toLocaleDateString() : ""}
                    </p>
                    <span style={{ fontSize: "12px", color: "#666" }}>Date</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Waiver Content Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50">
              <div>
                <h2 className="text-lg font-bold">Edit Waiver Content</h2>
                <p className="text-sm text-gray-500">
                  Customize the waiver sections and text
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={resetToDefaults}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Reset to Defaults
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Gym Settings Section */}
              <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-3">Gym/Dojo Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gym Name</label>
                    <input
                      type="text"
                      value={editingGymSettings.name}
                      onChange={(e) => setEditingGymSettings(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Your Martial Arts School"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gym Address</label>
                    <input
                      type="text"
                      value={editingGymSettings.address}
                      onChange={(e) => setEditingGymSettings(prev => ({ ...prev, address: e.target.value }))}
                      placeholder="123 Main St, City, State"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gym Phone</label>
                    <input
                      type="tel"
                      value={editingGymSettings.phone}
                      onChange={(e) => setEditingGymSettings(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="(555) 123-4567"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Gym Email</label>
                    <input
                      type="email"
                      value={editingGymSettings.email}
                      onChange={(e) => setEditingGymSettings(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="info@yourdojo.com"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Placeholder Reference */}
              <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-yellow-800 mb-2">Available Placeholders</h3>
                <p className="text-xs text-yellow-700 mb-3">
                  Use these placeholders in your waiver text. They will be automatically replaced with actual values when viewing.
                </p>
                <div className="flex flex-wrap gap-2">
                  {PLACEHOLDERS.map(p => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => navigator.clipboard.writeText(p.key)}
                      className="inline-flex items-center gap-1 bg-yellow-200 text-yellow-800 px-2 py-1 rounded text-xs font-mono hover:bg-yellow-300 transition-colors"
                      title={`${p.description} (click to copy)`}
                    >
                      {p.key}
                      <svg className="w-3 h-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Minor (14-17) Waiver Options */}
              <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-purple-800 mb-2">Minor (Ages 14-17) Options</h3>
                <p className="text-xs text-purple-700 mb-3">
                  Configure which fields appear for minors aged 14-17 on the guardian waiver form.
                </p>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingWaiverOptions.includeMinorSignature}
                      onChange={(e) => setEditingWaiverOptions(prev => ({ ...prev, includeMinorSignature: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Require Minor Signature</span>
                      <p className="text-xs text-gray-500">When enabled, minors aged 14-17 must also sign the waiver</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingWaiverOptions.includeMinorEmail}
                      onChange={(e) => setEditingWaiverOptions(prev => ({ ...prev, includeMinorEmail: e.target.checked }))}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">Include Minor Email Field</span>
                      <p className="text-xs text-gray-500">When enabled, shows an optional email field for minors aged 14-17</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Waiver Sections */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Waiver Sections</h3>
              </div>

              {editingSections.map((section, idx) => (
                <div key={section.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Section Title {section.id === "closing_statement" && "(Closing Statement)"}
                      </label>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => updateSection(idx, "title", e.target.value)}
                        placeholder="e.g., ASSUMPTION OF RISK"
                        disabled={section.id === "closing_statement"}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-gray-100"
                      />
                    </div>
                    {section.id !== "closing_statement" && (
                      <button
                        onClick={() => removeSection(idx)}
                        className="mt-5 text-primary hover:text-primaryDark"
                        title="Remove section"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Content
                    </label>
                    <textarea
                      value={section.content}
                      onChange={(e) => updateSection(idx, "content", e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={addSection}
                className="w-full rounded-md border-2 border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add New Section
              </button>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={saveWaiverContent}
                disabled={savingWaiver}
                className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50 transition-colors"
              >
                {savingWaiver ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
