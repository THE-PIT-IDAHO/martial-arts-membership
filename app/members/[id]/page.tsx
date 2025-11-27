"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type Member = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;

  memberNumber?: number | null;

  dateOfBirth?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  parentGuardianName?: string | null;
  notes?: string | null;

  // Global training info (mirrored from primary style)
  startDate?: string | null;
  rank?: string | null;
  uniformSize?: string | null;
  medicalNotes?: string | null;
  waiverSigned?: boolean;
  waiverSignedAt?: string | null;

  membershipType?: string | null;

  photoUrl?: string | null;
  primaryStyle?: string | null;
  stylesNotes?: string | null; // JSON array of style entries
  paymentNotes?: string | null;
};

type StyleEntry = {
  name: string;
  rank?: string;
  beltSize?: string;
  uniformSize?: string;
  startDate?: string;
};

type ActivityItem = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

type RelationshipRecord = {
  id: string;
  relationship: string;
  fromMemberId: string;
  toMemberId: string;
  fromMember: {
    id: string;
    firstName: string;
    lastName: string;
  };
  toMember: {
    id: string;
    firstName: string;
    lastName: string;
  };
};

type MemberSummary = {
  id: string;
  firstName: string;
  lastName: string;
  status: string;
};

const STATUS_OPTIONS = ["PROSPECT", "ACTIVE", "INACTIVE", "PARENT"] as const;

// Relationship types
const RELATIONSHIP_OPTIONS = [
  { value: "PARENT", label: "Parent of" },
  { value: "CHILD", label: "Child of" },
  { value: "GUARDIAN", label: "Guardian of" },
  { value: "SPOUSE", label: "Spouse of" },
  { value: "SIGNIFICANT_OTHER", label: "Significant other of" },
  { value: "SIBLING", label: "Sibling of" },
  { value: "PAYS_FOR", label: "Pays for" },
  { value: "PAID_FOR_BY", label: "Paid for by" }
] as const;

function calculateAgeFromDateString(dateString?: string | null): number | null {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > d.getMonth() ||
    (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
  if (!hasHadBirthdayThisYear) age--;
  return age >= 0 ? age : null;
}

// Small helper component: renders relationship sentence with linked names
function RelationshipLabel({
  rel,
  currentMemberId
}: {
  rel: RelationshipRecord;
  currentMemberId: string;
}) {
  const isFrom = rel.fromMemberId === currentMemberId;
  const other = isFrom ? rel.toMember : rel.fromMember;
  const otherName = `${other.firstName} ${other.lastName}`;
  const type = rel.relationship;

  const linkedName = (
    <Link
      href={`/members/${other.id}`}
      className="text-xs text-primary hover:text-primaryDark font-medium"
    >
      {otherName}
    </Link>
  );

  if (type === "PARENT") {
    return (
      <>
        {isFrom ? "Parent of " : "Child of "}
        {linkedName}
      </>
    );
  }
  if (type === "CHILD") {
    return (
      <>
        {isFrom ? "Child of " : "Parent of "}
        {linkedName}
      </>
    );
  }
  if (type === "GUARDIAN") {
    return (
      <>
        {isFrom ? "Guardian of " : "Guarded by "}
        {linkedName}
      </>
    );
  }
  if (type === "SPOUSE") {
    return <>Spouse of {linkedName}</>;
  }
  if (type === "SIGNIFICANT_OTHER") {
    return <>Significant other of {linkedName}</>;
  }
  if (type === "SIBLING") {
    return <>Sibling of {linkedName}</>;
  }
  if (type === "PAYS_FOR") {
    return (
      <>
        {isFrom ? "Pays for " : "Paid for by "}
        {linkedName}
      </>
    );
  }
  if (type === "PAID_FOR_BY") {
    return (
      <>
        {isFrom ? "Paid for by " : "Pays for "}
        {linkedName}
      </>
    );
  }

  // fallback
  return (
    <>
      {type} – {linkedName}
    </>
  );
}

type EditableSection =
  | "personal"
  | "style"
  | "membership"
  | "payments"
  | "photo"
  | "waiver"
  | "relationships";

export default function MemberProfilePage() {
  const params = useParams();
  const router = useRouter();
  const memberId = params?.id as string;

  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<EditableSection | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // unified personal info state
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<string>("PROSPECT");
  const [memberNumber, setMemberNumber] = useState<string>("");

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateValue, setStateValue] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [emergencyContactNameState, setEmergencyContactNameState] =
    useState("");
  const [emergencyContactPhoneState, setEmergencyContactPhoneState] =
    useState("");
  const [parentGuardianName, setParentGuardianName] = useState("");
  const [notes, setNotes] = useState("");

  const [medicalNotes, setMedicalNotes] = useState("");
  const [editingWaiver, setEditingWaiver] = useState(false);
  const [waiverSigned, setWaiverSigned] = useState(false);
  const [waiverSignedAt, setWaiverSignedAt] = useState("");

  // styles: array of { name, rank, beltSize, uniformSize, startDate }
  const [styles, setStyles] = useState<StyleEntry[]>([]);

  // membership
  const [membershipType, setMembershipType] = useState("");

  // photo + payments
  const [photoUrl, setPhotoUrl] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // edit flags
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingStyle, setEditingStyle] = useState(false);
  const [editingMembership, setEditingMembership] = useState(false);
  const [editingPayments, setEditingPayments] = useState(false);

  // activity
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // relationships
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);
  const [newRelationshipType, setNewRelationshipType] =
    useState<string>("PARENT");
  const [newRelationshipMemberId, setNewRelationshipMemberId] = useState("");
  const [allMembers, setAllMembers] = useState<MemberSummary[]>([]);
  const [relationshipError, setRelationshipError] = useState<string | null>(
    null
  );

  // photo upload refs
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // load member
  useEffect(() => {
    if (!memberId) return;

    async function fetchMember() {
      try {
        setLoading(true);
        const res = await fetch(`/api/members/${memberId}`);
        if (!res.ok) {
          throw new Error("Failed to load member profile");
        }
        const data = await res.json();
        const m: Member = data.member;
        setMember(m);
        hydrateFormFromMember(m);
        seedActivityFromMember(m);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load member profile");
      } finally {
        setLoading(false);
      }
    }

    fetchMember();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  // load all members for relationship dropdown
  useEffect(() => {
    async function fetchMembers() {
      try {
        const res = await fetch("/api/members");
        if (!res.ok) return;
        const data = await res.json();
        const list: MemberSummary[] = (data.members || []).map((m: any) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          status: m.status
        }));
        setAllMembers(list);
      } catch (e) {
        console.error("Failed to load member list:", e);
      }
    }
    fetchMembers();
  }, []);

  // load relationships
  useEffect(() => {
    if (!memberId) return;
    fetchRelationships();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function fetchRelationships() {
    try {
      setRelationshipsLoading(true);
      const res = await fetch(`/api/members/${memberId}/relationships`);
      if (!res.ok) {
        throw new Error("Failed to load relationships");
      }
      const data = await res.json();
      setRelationships(data.relationships || []);
      setRelationshipError(null);
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to load relationships");
    } finally {
      setRelationshipsLoading(false);
    }
  }

  function seedActivityFromMember(m: Member) {
    const base: ActivityItem[] = [
      {
        id: "created",
        type: "SYSTEM",
        message: "Member profile created",
        createdAt: m.createdAt
      }
    ];
    if (m.startDate) {
      base.push({
        id: "start",
        type: "TRAINING",
        message: "Training start date recorded",
        createdAt: m.startDate
      });
    }
    if (m.waiverSigned && m.waiverSignedAt) {
      base.push({
        id: "waiver",
        type: "ADMIN",
        message: "Waiver signed",
        createdAt: m.waiverSignedAt
      });
    }
    setActivity(base.reverse());
  }

  function parseStylesFromMember(m: Member): StyleEntry[] {
    if (m.stylesNotes) {
      try {
        const parsed = JSON.parse(m.stylesNotes);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => {
              if (typeof item === "string") {
                return { name: item.trim() } as StyleEntry;
              }
              if (item && typeof item === "object") {
                const obj = item as any;
                const name = String(obj.name ?? "").trim();
                if (!name) return null;
                const entry: StyleEntry = {
                  name,
                  rank:
                    obj.rank !== undefined && obj.rank !== null
                      ? String(obj.rank)
                      : undefined,
                  beltSize:
                    obj.beltSize !== undefined && obj.beltSize !== null
                      ? String(obj.beltSize)
                      : undefined,
                  uniformSize:
                    obj.uniformSize !== undefined && obj.uniformSize !== null
                      ? String(obj.uniformSize)
                      : undefined,
                  startDate:
                    obj.startDate !== undefined && obj.startDate !== null
                      ? String(obj.startDate)
                      : undefined
                };
                return entry;
              }
              return null;
            })
            .filter((s): s is StyleEntry => !!s && s.name.trim() !== "");
        }
      } catch {
        // ignore invalid JSON
      }
    }

    // fallback: primaryStyle + rank/uniform/startDate
    const baseName = m.primaryStyle;
    if (baseName) {
      const entry: StyleEntry = {
        name: baseName,
        rank: m.rank || undefined,
        uniformSize: m.uniformSize || undefined,
        startDate: m.startDate
          ? new Date(m.startDate).toISOString().slice(0, 10)
          : undefined
      };
      return [entry];
    }

    return [];
  }

  function hydrateFormFromMember(m: Member) {
    setFirstName(m.firstName);
    setLastName(m.lastName);
    setEmail(m.email || "");
    setPhone(m.phone || "");
    setStatus(m.status || "PROSPECT");
    setMemberNumber(
      m.memberNumber != null ? String(m.memberNumber) : ""
    );

    setDateOfBirth(
      m.dateOfBirth ? new Date(m.dateOfBirth).toISOString().slice(0, 10) : ""
    );
    setAddress(m.address || "");
    setCity(m.city || "");
    setStateValue(m.state || "");
    setZipCode(m.zipCode || "");
    setEmergencyContactNameState(m.emergencyContactName || "");
    setEmergencyContactPhoneState(m.emergencyContactPhone || "");
    setParentGuardianName(m.parentGuardianName || "");
    setNotes(m.notes || "");

    setMedicalNotes(m.medicalNotes || "");
    setWaiverSigned(!!m.waiverSigned);
    setWaiverSignedAt(
      m.waiverSignedAt
        ? new Date(m.waiverSignedAt).toISOString().slice(0, 10)
        : ""
    );

    const parsedStyles = parseStylesFromMember(m);
    setStyles(parsedStyles);

    setMembershipType(m.membershipType || "");
    setPhotoUrl(m.photoUrl || "");
    setPaymentNotes(m.paymentNotes || "");
  }

  function cancelSection(section: EditableSection) {
    if (!member) return;
    hydrateFormFromMember(member);

    if (section === "personal") setEditingPersonal(false);
    if (section === "style") setEditingStyle(false);
    if (section === "membership") setEditingMembership(false);
    if (section === "payments") setEditingPayments(false);
    if (section === "photo") setEditingPhoto(false);
    if (section === "waiver") setEditingWaiver(false);
    if (section === "relationships") {
      setAddingRelationship(false);
      setNewRelationshipMemberId("");
      setNewRelationshipType("PARENT");
    }

    setError(null);
    setRelationshipError(null);
  }

  function addActivityFromUpdate(message: string) {
    setActivity((prev) => [
      {
        id: `update-${Date.now()}`,
        type: "PROFILE",
        message,
        createdAt: new Date().toISOString()
      },
      ...prev
    ]);
  }

  async function saveSection(section: EditableSection) {
    if (!memberId) return;
    setError(null);

    if (section === "personal") {
      if (!firstName.trim() || !lastName.trim()) {
        setError("First and last name are required.");
        return;
      }
    }

    const normalizedStyles: StyleEntry[] = styles
      .map((s) => ({
        name: s.name.trim(),
        rank: s.rank?.trim() || undefined,
        beltSize: s.beltSize?.trim() || undefined,
        uniformSize: s.uniformSize?.trim() || undefined,
        startDate: s.startDate || undefined
      }))
      .filter((s) => s.name !== "");

    const primary = normalizedStyles[0];

    const memberNumberValue =
      memberNumber.trim() === "" ? null : Number(memberNumber.trim());

    const payload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      status,
      memberNumber:
        memberNumberValue != null && !Number.isNaN(memberNumberValue)
          ? memberNumberValue
          : null,

      dateOfBirth: dateOfBirth || null,
      address: address.trim() || null,
      city: city.trim() || null,
      state: stateValue.trim() || null,
      zipCode: zipCode.trim() || null,
      emergencyContactName: emergencyContactNameState.trim() || null,
      emergencyContactPhone: emergencyContactPhoneState.trim() || null,
      parentGuardianName: parentGuardianName.trim() || null,
      notes: notes.trim() || null,

      medicalNotes: medicalNotes.trim() || null,
      waiverSigned,
      waiverSignedAt: waiverSignedAt || null,

      primaryStyle: primary ? primary.name : null,
      stylesNotes:
        normalizedStyles.length > 0 ? JSON.stringify(normalizedStyles) : null,

      rank: primary && primary.rank ? primary.rank : null,
      startDate: primary && primary.startDate ? primary.startDate : null,
      uniformSize:
        primary && primary.uniformSize ? primary.uniformSize : null,

      membershipType: membershipType.trim() || null,

      photoUrl: photoUrl.trim() || null,
      paymentNotes: paymentNotes.trim() || null
    };

    try {
      setSavingSection(section);
      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update member");
      }

      const data = await res.json();
      const updated: Member = data.member;
      setMember(updated);
      hydrateFormFromMember(updated);

      if (section === "personal") setEditingPersonal(false);
      if (section === "style") setEditingStyle(false);
      if (section === "membership") setEditingMembership(false);
      if (section === "payments") setEditingPayments(false);
      if (section === "photo") setEditingPhoto(false);
      if (section === "waiver") setEditingWaiver(false);

      addActivityFromUpdate(
        section === "personal"
          ? "Personal info updated"
          : section === "style"
          ? "Styles updated"
          : section === "membership"
          ? "Membership info updated"
          : section === "payments"
          ? "Payment notes updated"
          : section === "waiver"
          ? "Waiver info updated"
          : "Photo updated"
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to update member");
    } finally {
      setSavingSection(null);
    }
  }

  async function handleAddRelationship() {
    if (!memberId) return;
    setRelationshipError(null);

    if (!newRelationshipMemberId || !newRelationshipType) {
      setRelationshipError("Please select a member and relationship type.");
      return;
    }

    try {
      const res = await fetch(`/api/members/${memberId}/relationships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetMemberId: newRelationshipMemberId,
          relationship: newRelationshipType
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add relationship");
      }

      await fetchRelationships();
      setNewRelationshipMemberId("");
      setNewRelationshipType("PARENT");
      setAddingRelationship(false);

      addActivityFromUpdate("Relationships updated");
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to add relationship");
    }
  }

  async function handleRemoveRelationship(id: string) {
    if (!memberId) return;
    try {
      const res = await fetch(`/api/members/${memberId}/relationships`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to remove relationship");
      }

      setRelationships((prev) => prev.filter((r) => r.id !== id));
      addActivityFromUpdate("Relationships updated");
    } catch (err: any) {
      console.error(err);
      setRelationshipError(err.message || "Failed to remove relationship");
    }
  }

  function goBackToList() {
    router.push("/members");
  }

  const initials =
    firstName && lastName
      ? `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase()
      : "M";

  function addStyle() {
    setStyles((prev) => [
      ...prev,
      { name: "", rank: "", beltSize: "", uniformSize: "", startDate: "" }
    ]);
  }

  function updateStyle(
    index: number,
    field: keyof StyleEntry,
    value: string
  ) {
    setStyles((prev) => {
      const copy = [...prev];
      const current =
        copy[index] ?? {
          name: "",
          rank: "",
          beltSize: "",
          uniformSize: "",
          startDate: ""
        };
      copy[index] = { ...current, [field]: value };
      return copy;
    });
  }

  function removeStyle(index: number) {
    setStyles((prev) => prev.filter((_, i) => i !== index));
  }

  const availableMembersForRelationships = allMembers.filter(
    (m) => m.id !== memberId
  );

  const ageFromState = calculateAgeFromDateString(dateOfBirth);
  const ageFromMember = calculateAgeFromDateString(member?.dateOfBirth);

  function handlePhotoFileChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setPhotoUrl(result);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header + photo */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt={`${firstName} ${lastName}`}
                  className="h-16 w-16 rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-700 border border-gray-300">
                  {initials}
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                onClick={goBackToList}
                className="text-xs text-gray-500 hover:text-gray-700 underline mb-1"
              >
                ← Back to members
              </button>
              <h1 className="text-2xl font-bold">
                {member
                  ? `${member.firstName} ${member.lastName}`
                  : "Member Profile"}
              </h1>
              <p className="text-sm text-gray-600">
                Personal info, relationships, styles, payments, and activity.
              </p>
            </div>
          </div>

          {/* Edit photo */}
          <div className="flex flex-col items-end">
            {!editingPhoto ? (
              <button
                type="button"
                onClick={() => setEditingPhoto(true)}
                className="text-xs text-primary hover:text-primaryDark font-medium"
              >
                Edit Photo
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cancelSection("photo")}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingSection === "photo"}
                  onClick={() => saveSection("photo")}
                  className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingSection === "photo" ? "Saving..." : "Save"}
                </button>
              </div>
            )}

            {editingPhoto && (
              <div className="mt-2 space-y-2">
                <p className="text-[11px] text-gray-600 mb-1">
                  Add a member photo using your camera or by uploading from this
                  device.
                </p>

                {/* Hidden file inputs */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoFileChange}
                />
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoFileChange}
                />

                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="text-xs rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Use Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="text-xs rounded-md border border-gray-300 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Upload from Device
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading profile…</p>}

        {(error || relationshipError) && (
          <div className="space-y-1">
            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            {relationshipError && (
              <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {relationshipError}
              </div>
            )}
          </div>
        )}

        {!loading && member && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* LEFT: Personal + Relationships + Styles + Membership */}
            <div className="space-y-4 xl:col-span-2">
              {/* PERSONAL INFO */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Personal Info</h2>
                  {!editingPersonal ? (
                    <button
                      type="button"
                      onClick={() => setEditingPersonal(true)}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cancelSection("personal")}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSection === "personal"}
                        onClick={() => saveSection("personal")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "personal" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {!editingPersonal ? (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">Name</dt>
                      <dd className="text-gray-900">
                        {member.firstName} {member.lastName}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Member #
                      </dt>
                      <dd className="text-gray-900">
                        {member.memberNumber != null ? (
                          member.memberNumber
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Email
                      </dt>
                      <dd className="text-gray-900">
                        {member.email || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Phone
                      </dt>
                      <dd className="text-gray-900">
                        {member.phone || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Date of Birth
                      </dt>
                      <dd className="text-gray-900">
                        {member.dateOfBirth ? (
                          <>
                            {new Date(
                              member.dateOfBirth
                            ).toLocaleDateString()}
                            {ageFromMember !== null && (
                              <span className="text-xs text-gray-500">
                                {" "}
                                ({ageFromMember} yrs)
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Address
                      </dt>
                      <dd className="text-gray-900">
                        {member.address ? (
                          <>
                            {member.address}
                            {member.city && `, ${member.city}`}
                            {member.state && `, ${member.state}`}
                            {member.zipCode && ` ${member.zipCode}`}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Emergency Contact
                      </dt>
                      <dd className="text-gray-900">
                        {member.emergencyContactName ? (
                          <>
                            {member.emergencyContactName}
                            {member.emergencyContactPhone &&
                              ` (${member.emergencyContactPhone})`}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Status
                      </dt>
                      <dd>
                        <span className="inline-flex items-center rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700">
                          {member.status}
                        </span>
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Parent / Guardian
                      </dt>
                      <dd className="text-gray-900">
                        {member.parentGuardianName || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Created
                      </dt>
                      <dd className="text-gray-900 text-xs">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </dd>
                    </div>

                    <div className="md:col-span-2">
                      <dt className="text-gray-500 text-xs uppercase">
                        Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.notes || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div className="md:col-span-2">
                      <dt className="text-gray-500 text-xs uppercase">
                        Medical Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.medicalNotes || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("personal");
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-sm"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        First Name *
                      </label>
                      <input
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Last Name *
                      </label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Member #
                      </label>
                      <input
                        value={memberNumber}
                        onChange={(e) => setMemberNumber(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="e.g. 10000001"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Status
                      </label>
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Phone
                      </label>
                      <input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={dateOfBirth}
                        onChange={(e) => setDateOfBirth(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                      {dateOfBirth && ageFromState !== null && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Age: {ageFromState} years
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Address
                      </label>
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        City
                      </label>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        State
                      </label>
                      <input
                        value={stateValue}
                        onChange={(e) => setStateValue(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Zip Code
                      </label>
                      <input
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Emergency Contact Name
                      </label>
                      <input
                        value={emergencyContactNameState}
                        onChange={(e) =>
                          setEmergencyContactNameState(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Emergency Contact Phone
                      </label>
                      <input
                        value={emergencyContactPhoneState}
                        onChange={(e) =>
                          setEmergencyContactPhoneState(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Parent/Guardian Name (for minors)
                      </label>
                      <input
                        value={parentGuardianName}
                        onChange={(e) =>
                          setParentGuardianName(e.target.value)
                        }
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700">
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700">
                        Medical Notes
                      </label>
                      <textarea
                        value={medicalNotes}
                        onChange={(e) => setMedicalNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
                    </div>
                  </form>
                )}
              </section>

              {/* RELATIONSHIPS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Relationships</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingRelationship(true);
                      setRelationshipError(null);
                    }}
                    className="text-xs text-primary hover:text-primaryDark font-medium"
                  >
                    Add Relationship
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  {relationshipsLoading ? (
                    <p className="text-xs text-gray-500">
                      Loading relationships…
                    </p>
                  ) : relationships.length === 0 ? (
                    <p className="text-sm text-gray-400">
                      No relationships linked yet. Use this to connect family
                      members and payers (e.g., parents paying for multiple
                      kids).
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {relationships.map((rel) => (
                        <div
                          key={rel.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="text-gray-900">
                            <RelationshipLabel
                              rel={rel}
                              currentMemberId={memberId}
                            />
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveRelationship(rel.id)}
                            className="text-[11px] text-gray-400 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingRelationship && (
                    <div className="mt-3 rounded-md border border-gray-200 p-2 space-y-2">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">
                            Relationship Type
                          </label>
                          <select
                            value={newRelationshipType}
                            onChange={(e) =>
                              setNewRelationshipType(e.target.value)
                            }
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            {RELATIONSHIP_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-gray-700">
                            Linked Member
                          </label>
                          <select
                            value={newRelationshipMemberId}
                            onChange={(e) =>
                              setNewRelationshipMemberId(e.target.value)
                            }
                            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                          >
                            <option value="">Select member…</option>
                            {availableMembersForRelationships.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.firstName} {m.lastName} (
                                {m.status.toLowerCase()})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => cancelSection("relationships")}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddRelationship}
                          className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* STYLES */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Styles</h2>
                  {!editingStyle ? (
                    <button
                      type="button"
                      onClick={() => setEditingStyle(true)}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cancelSection("style")}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSection === "style"}
                        onClick={() => saveSection("style")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "style" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {!editingStyle ? (
                  <div className="space-y-3 text-sm">
                    {styles.length === 0 ? (
                      <span className="text-sm text-gray-400">
                        No styles added yet.
                      </span>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {styles.map((s, i) => (
                          <div
                            key={i}
                            className="border border-gray-200 rounded-md p-2"
                          >
                            <div className="font-medium text-gray-900">
                              {s.name}
                            </div>
                            <div className="mt-1 space-y-0.5 text-sm text-gray-700">
                              {s.rank && (
                                <div>
                                  Rank: <span>{s.rank}</span>
                                </div>
                              )}
                              {s.beltSize && (
                                <div>
                                  Belt Size: <span>{s.beltSize}</span>
                                </div>
                              )}
                              {s.uniformSize && (
                                <div>
                                  Uniform Size: <span>{s.uniformSize}</span>
                                </div>
                              )}
                              {s.startDate && (
                                <div>
                                  Start:{" "}
                                  <span>
                                    {new Date(
                                      s.startDate
                                    ).toLocaleDateString()}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("style");
                    }}
                    className="space-y-4 text-sm"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={addStyle}
                          className="text-xs rounded-md border border-primary px-2 py-0.5 text-primary hover:bg-primary hover:text-white"
                        >
                          Add Style
                        </button>
                      </div>

                      {styles.length === 0 && (
                        <p className="text-[11px] text-gray-500">
                          No styles yet. Click &quot;Add Style&quot; to add one
                          (e.g. &quot;Kids BJJ&quot;, &quot;Hawaiian Kempo&quot;,
                          &quot;Kickboxing&quot;).
                        </p>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {styles.map((style, index) => (
                          <div
                            key={index}
                            className="border border-gray-200 rounded-md p-2 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                value={style.name}
                                onChange={(e) =>
                                  updateStyle(index, "name", e.target.value)
                                }
                                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                placeholder={`Style #${index + 1} (e.g. Kids BJJ)`}
                              />
                              <button
                                type="button"
                                onClick={() => removeStyle(index)}
                                className="text-[11px] text-gray-500 hover:text-red-600"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Training Start Date
                                </label>
                                <input
                                  type="date"
                                  value={style.startDate || ""}
                                  onChange={(e) =>
                                    updateStyle(
                                      index,
                                      "startDate",
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Rank / Belt Level
                                </label>
                                <input
                                  value={style.rank || ""}
                                  onChange={(e) =>
                                    updateStyle(index, "rank", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  placeholder="e.g. Gray/White"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Belt Size
                                </label>
                                <input
                                  value={style.beltSize || ""}
                                  onChange={(e) =>
                                    updateStyle(
                                      index,
                                      "beltSize",
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  placeholder="e.g. A2, 3, Small"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Uniform Size
                                </label>
                                <input
                                  value={style.uniformSize || ""}
                                  onChange={(e) =>
                                    updateStyle(
                                      index,
                                      "uniformSize",
                                      e.target.value
                                    )
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  placeholder="e.g. A2, Youth Small"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </form>
                )}
              </section>

              {/* MEMBERSHIP INFO */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Membership Info</h2>
                  {!editingMembership ? (
                    <button
                      type="button"
                      onClick={() => setEditingMembership(true)}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cancelSection("membership")}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSection === "membership"}
                        onClick={() => saveSection("membership")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "membership" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {!editingMembership ? (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Membership Type
                      </dt>
                      <dd className="text-gray-900">
                        {member.membershipType || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("membership");
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-sm"
                  >
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Membership Type
                      </label>
                      <input
                        value={membershipType}
                        onChange={(e) => setMembershipType(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="e.g. Adult Unlimited, Kids 2x/week"
                      />
                    </div>
                  </form>
                )}
              </section>

              {/* WAIVER SECTION */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Waiver</h2>
                  {!editingWaiver ? (
                    <button
                      type="button"
                      onClick={() => setEditingWaiver(true)}
                      className="text-xs text-primary hover:text-primaryDark font-medium"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => cancelSection("waiver")}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingSection === "waiver"}
                        onClick={() => saveSection("waiver")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "waiver" ? "Saving..." : "Save"}
                      </button>
                    </div>
                  )}
                </div>

                {!editingWaiver ? (
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Waiver Signed
                      </dt>
                      <dd className="text-gray-900">
                        {member.waiverSigned ? "Yes" : "No"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Waiver Signed Date
                      </dt>
                      <dd className="text-gray-900">
                        {member.waiverSignedAt ? (
                          new Date(
                            member.waiverSignedAt
                          ).toLocaleDateString()
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("waiver");
                    }}
                    className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-sm"
                  >
                    <div className="space-y-1">
                      <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={waiverSigned}
                          onChange={(e) =>
                            setWaiverSigned(e.target.checked)
                          }
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        Waiver Signed
                      </label>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Waiver Signed Date
                      </label>
                      <input
                        type="date"
                        value={waiverSignedAt}
                        onChange={(e) => setWaiverSignedAt(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                  </form>
                )}
              </section>
            </div>

            {/* RIGHT: Payments + Activity */}
            <div className="flex flex-col gap-4">
              {/* PAYMENTS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Payments / POS</h2>
                </div>

                {!editingPayments ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">
                        Safe notes only (no card numbers).
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditingPayments(true)}
                        className="text-xs text-primary hover:text-primaryDark font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="space-y-2 text-sm">
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {member.paymentNotes || (
                          <span className="text-gray-400">
                            Use this area for{" "}
                            <strong>safe payment notes</strong> like:
                            {"\n"}
                            • &quot;Visa ending 1234 (in Stripe)&quot;
                            {"\n"}
                            • &quot;Family account pays at front desk&quot;
                            {"\n"}
                            • &quot;Promo: HEROES-CUP-2026 until 1/31/26&quot;
                            {"\n\n"}
                            Do <strong>not</strong> store full card numbers or
                            CVV here.
                          </span>
                        )}
                      </p>
                    </div>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("payments");
                    }}
                    className="space-y-2 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-700">
                        Payment / POS Notes
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => cancelSection("payments")}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingSection === "payments"}
                          className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                        >
                          {savingSection === "payments" ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      rows={5}
                      placeholder={
                        'Examples:\n- "Visa ending 1234, saved in Square; default for tuition."\n- "Cash only; pays first week of each month."\n- "Promo: HEROES-CUP-2026 (50% off Jan) applied."'
                      }
                    />
                    <p className="mt-1 text-[10px] text-gray-500">
                      For security, never store full card numbers or CVV here.
                    </p>
                  </form>
                )}
              </section>

              {/* ACTIVITY (flex-1 so it stretches) */}
              <section className="rounded-lg border border-gray-200 bg-white p-4 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Activity</h2>
                  <span className="text-[10px] text-gray-500">
                    Only meaningful events: check-ins, waivers, profile
                    changes.
                  </span>
                </div>

                {activity.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No activity yet. Once connected to attendance and billing,
                    this will show a running history (e.g., &quot;John Doe
                    checked into class&quot;, &quot;Profile updated&quot;).
                  </p>
                ) : (
                  <div className="space-y-2 text-sm overflow-y-auto flex-1">
                    {activity.map((item) => (
                      <div
                        key={item.id}
                        className="flex justify-between items-start border-b border-gray-100 pb-1 last:border-0"
                      >
                        <div>
                          <div className="text-xs uppercase text-gray-500">
                            {item.type}
                          </div>
                          <div className="text-gray-900">{item.message}</div>
                        </div>
                        <div className="text-[10px] text-gray-400 whitespace-nowrap pl-2">
                          {new Date(item.createdAt).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
