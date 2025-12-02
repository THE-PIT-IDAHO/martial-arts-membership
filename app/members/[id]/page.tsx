"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

// Format phone number as user types: (123) 456-7890
function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const digits = value.replace(/\D/g, "");

  // Format based on length
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

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
  styleDocuments?: string | null; // JSON array of document entries
  paymentNotes?: string | null;

  // Attendance data
  attendances?: Array<{
    id: string;
    checkedInAt: string;
    classSession: {
      id: string;
      name: string;
      classType: string | null;
      program: {
        id: string;
        name: string;
      } | null;
    } | null;
  }>;
};

type StyleEntry = {
  name: string;
  rank?: string;
  beltSize?: string;
  uniformSize?: string;
  startDate?: string;
  lastPromotionDate?: string;  // Date of last rank promotion (for attendance window calculation)
  active?: boolean;  // Whether this style is currently active for the member
};

type StyleDocument = {
  id: string;
  name: string;
  url: string;
  uploadedAt: string;
};

type AvailableStyle = {
  id: string;
  name: string;
  beltConfig?: string | null;
  ranks: { id: string; name: string; order: number; classRequirement?: number | null; thumbnail?: string | null }[];
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

const STATUS_OPTIONS = ["PROSPECT", "ACTIVE", "INACTIVE", "PARENT", "COACH", "BANNED"] as const;

// Priority order for displaying statuses: Coach, Active, Parent, Inactive, Prospect, Banned
const STATUS_PRIORITY = ["COACH", "ACTIVE", "PARENT", "INACTIVE", "PROSPECT", "BANNED"];

function sortStatusesByPriority(statuses: string[]): string[] {
  return [...statuses].sort((a, b) => {
    const aIndex = STATUS_PRIORITY.indexOf(a.toUpperCase());
    const bIndex = STATUS_PRIORITY.indexOf(b.toUpperCase());
    const aPriority = aIndex === -1 ? STATUS_PRIORITY.length : aIndex;
    const bPriority = bIndex === -1 ? STATUS_PRIORITY.length : bIndex;
    return aPriority - bPriority;
  });
}

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-green-100 text-green-800 border-green-300";
    case "PROSPECT":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "INACTIVE":
      return "bg-primary/10 text-primary border-primary/30";
    case "PARENT":
      return "bg-blue-100 text-blue-800 border-blue-300";
    case "COACH":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "BANNED":
      return "bg-gray-200 text-gray-900 border-gray-400";
    default:
      return "bg-gray-100 text-gray-800 border-gray-300";
  }
}

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
  const [statuses, setStatuses] = useState<string[]>(["PROSPECT"]);
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
  const [availableStyles, setAvailableStyles] = useState<AvailableStyle[]>([]);
  const [stylesTab, setStylesTab] = useState<"active" | "inactive">("active");

  // style documents
  const [styleDocuments, setStyleDocuments] = useState<StyleDocument[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  // membership
  const [membershipType, setMembershipType] = useState("");

  // photo + payments
  const [photoUrl, setPhotoUrl] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  // edit flags
  const [editingPhoto, setEditingPhoto] = useState(false);
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingStyleIndex, setEditingStyleIndex] = useState<number | null>(null);
  const [editingMembership, setEditingMembership] = useState(false);
  const [editingPayments, setEditingPayments] = useState(false);

  // activity
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  // relationships
  const [relationships, setRelationships] = useState<RelationshipRecord[]>([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [addingRelationship, setAddingRelationship] = useState(false);

  // Rank documents popup - tracks which style index has its popup open
  const [rankDocsPopupIndex, setRankDocsPopupIndex] = useState<number | null>(null);
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

  // load available styles
  useEffect(() => {
    async function fetchStyles() {
      try {
        const res = await fetch("/api/styles");
        if (!res.ok) return;
        const data = await res.json();
        const stylesList: AvailableStyle[] = (data.styles || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          beltConfig: s.beltConfig,
          ranks: s.ranks || []
        }));
        setAvailableStyles(stylesList);
      } catch (e) {
        console.error("Failed to load styles:", e);
      }
    }
    fetchStyles();
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
                      : undefined,
                  lastPromotionDate:
                    obj.lastPromotionDate !== undefined && obj.lastPromotionDate !== null
                      ? String(obj.lastPromotionDate)
                      : undefined,
                  active:
                    obj.active !== undefined
                      ? Boolean(obj.active)
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
    // Parse status - can be comma-separated or single value
    const statusValue = m.status || "PROSPECT";
    const statusArray = statusValue.includes(",")
      ? statusValue.split(",").map(s => s.trim()).filter(s => s)
      : [statusValue];
    setStatuses(statusArray);
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

    // Parse style documents
    let docs: StyleDocument[] = [];
    if (m.styleDocuments) {
      try {
        docs = JSON.parse(m.styleDocuments);
      } catch {
        docs = [];
      }
    }
    setStyleDocuments(docs);

    setMembershipType(m.membershipType || "");
    setPhotoUrl(m.photoUrl || "");
    setPaymentNotes(m.paymentNotes || "");
  }

  function cancelSection(section: EditableSection) {
    if (!member) return;
    hydrateFormFromMember(member);

    if (section === "personal") setEditingPersonal(false);
    if (section === "style") setEditingStyleIndex(null);
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

  async function copyRankPDFsToStyleDocuments(styles: StyleEntry[], memberData: Member) {
    if (!memberId) return;

    try {
      // Parse current style documents from the fresh member data
      let currentDocs: StyleDocument[] = [];
      if (memberData.styleDocuments) {
        try {
          currentDocs = JSON.parse(memberData.styleDocuments);
        } catch {
          currentDocs = [];
        }
      }

      let updatedDocs = [...currentDocs];
      let hasNewDocs = false;

      // For each style with a rank, find the corresponding rank PDFs
      for (const style of styles) {
        if (!style.rank || !style.name) continue;

        // Find the style in availableStyles
        const styleData = availableStyles.find(s => s.name === style.name);
        if (!styleData || !styleData.beltConfig) continue;

        // Parse the beltConfig to get rank PDFs
        let beltConfig: any;
        try {
          beltConfig = typeof styleData.beltConfig === 'string'
            ? JSON.parse(styleData.beltConfig)
            : styleData.beltConfig;
        } catch {
          continue;
        }

        if (!beltConfig.ranks || !Array.isArray(beltConfig.ranks)) continue;

        // Find the current rank in beltConfig
        const currentRank = beltConfig.ranks.find((r: any) => r.name === style.rank);
        if (!currentRank) continue;

        // Get the current rank's order number
        const currentOrder = currentRank.order;

        // Get all ranks up to and including the current rank (by order number)
        const ranksToInclude = beltConfig.ranks.filter((r: any) => r.order <= currentOrder);

        // Add PDFs from all these ranks
        for (const rank of ranksToInclude) {
          if (!rank.pdfDocuments || rank.pdfDocuments.length === 0) continue;

          // Add each PDF to style documents if not already there
          for (const rankPdf of rank.pdfDocuments) {
            // Check if this PDF already exists (by name)
            const exists = updatedDocs.some(doc => doc.name === rankPdf.name);
            if (!exists) {
              const newDoc: StyleDocument = {
                id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                name: rankPdf.name,
                url: rankPdf.url,
                uploadedAt: new Date().toISOString()
              };
              updatedDocs.push(newDoc);
              hasNewDocs = true;
              // Small delay to ensure unique IDs
              await new Promise(resolve => setTimeout(resolve, 1));
            }
          }
        }
      }

      // If we added new documents, save them
      if (hasNewDocs) {
        setStyleDocuments(updatedDocs);

        const res = await fetch(`/api/members/${memberId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            styleDocuments: JSON.stringify(updatedDocs)
          })
        });

        if (res.ok) {
          const updated = await res.json();
          setMember(updated.member);
          addActivityFromUpdate("Rank documents added automatically");
        }
      }
    } catch (err: any) {
      console.error("Failed to copy rank PDFs:", err);
      // Don't throw error - this is a supplementary feature
    }
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
        startDate: s.startDate || undefined,
        lastPromotionDate: s.lastPromotionDate || undefined
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
      status: statuses.join(","),
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

      // If saving styles section and there are ranks, automatically add rank PDFs to style documents
      if (section === "style" && normalizedStyles.length > 0) {
        await copyRankPDFsToStyleDocuments(normalizedStyles, updated);
      }

      if (section === "personal") setEditingPersonal(false);
      if (section === "style") setEditingStyleIndex(null);
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

  async function handleDeleteMember() {
    if (!member) return;

    const confirmDelete = window.confirm(
      `Are you sure you want to delete ${member.firstName} ${member.lastName}? This action cannot be undone.`
    );

    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete member");
      }

      // Redirect to members list after successful deletion
      router.push("/members");
    } catch (err: any) {
      console.error("Error deleting member:", err);
      setError(err.message || "Failed to delete member");
    }
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
          startDate: "",
          lastPromotionDate: ""
        };

      // If rank is changing to a different value, update lastPromotionDate
      if (field === "rank" && value !== current.rank && value !== "") {
        const today = new Date().toISOString().split("T")[0];
        copy[index] = { ...current, [field]: value, lastPromotionDate: today };
      } else {
        copy[index] = { ...current, [field]: value };
      }
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

  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (file.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB");
      return;
    }

    setUploadingDocument(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const result = reader.result;
        if (typeof result === "string") {
          // Create new document entry
          // Remove .pdf extension from the name
          const fileName = file.name.replace(/\.pdf$/i, '');
          const newDoc: StyleDocument = {
            id: `doc-${Date.now()}`,
            name: fileName,
            url: result, // base64 data URL
            uploadedAt: new Date().toISOString()
          };

          const updatedDocs = [...styleDocuments, newDoc];
          setStyleDocuments(updatedDocs);

          // Save to server
          const res = await fetch(`/api/members/${memberId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              styleDocuments: JSON.stringify(updatedDocs)
            })
          });

          if (!res.ok) {
            throw new Error("Failed to upload document");
          }

          const updated = await res.json();
          setMember(updated.member);
          addActivityFromUpdate(`Uploaded document: ${file.name}`);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setError(err.message || "Failed to upload document");
      // Revert on error
      if (member) {
        hydrateFormFromMember(member);
      }
    } finally {
      setUploadingDocument(false);
      // Reset file input
      e.target.value = "";
    }
  }

  async function handleRemoveDocument(docId: string) {
    const doc = styleDocuments.find((d) => d.id === docId);
    if (!doc) return;

    if (!window.confirm(`Are you sure you want to remove "${doc.name}"?`)) {
      return;
    }

    try {
      const updatedDocs = styleDocuments.filter((d) => d.id !== docId);
      setStyleDocuments(updatedDocs);

      const res = await fetch(`/api/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleDocuments: JSON.stringify(updatedDocs)
        })
      });

      if (!res.ok) {
        throw new Error("Failed to remove document");
      }

      const updated = await res.json();
      setMember(updated.member);
      addActivityFromUpdate(`Removed document: ${doc.name}`);
    } catch (err: any) {
      setError(err.message || "Failed to remove document");
      // Revert on error
      if (member) {
        hydrateFormFromMember(member);
      }
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header + photo */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {/* Photo column */}
            <div className="flex flex-col items-center gap-2">
              {photoUrl ? (
                <div className="relative group">
                  <img
                    src={photoUrl}
                    alt={`${firstName} ${lastName}`}
                    className="h-16 w-16 rounded-full object-cover border border-gray-200 cursor-pointer"
                  />
                  {/* Full-size photo popup on hover */}
                  <div className="absolute left-20 top-0 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none">
                    <div className="w-96 h-96 rounded-lg shadow-2xl border-4 border-white bg-white overflow-hidden">
                      <img
                        src={photoUrl}
                        alt={`${firstName} ${lastName}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center text-lg font-semibold text-gray-700 border border-gray-300">
                  {initials}
                </div>
              )}

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

              {/* Edit/Save button under photo */}
              {!editingPhoto ? (
                <button
                  type="button"
                  onClick={() => setEditingPhoto(true)}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                >
                  Edit
                </button>
              ) : (
                <button
                  type="button"
                  disabled={savingSection === "photo"}
                  onClick={() => saveSection("photo")}
                  className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                >
                  {savingSection === "photo" ? "Saving..." : "Save"}
                </button>
              )}
            </div>

            {/* Name and info column */}
            <div>
              <h1 className="text-2xl font-bold">
                {member
                  ? `${member.firstName} ${member.lastName}`
                  : "Member Profile"}
              </h1>
              <p className="text-sm text-gray-600">
                Personal info, relationships, styles, payments, and activity.
              </p>

              {/* Photo edit buttons - only show when editing */}
              {editingPhoto && (
                <div className="flex items-center gap-2" style={{ marginTop: '18px' }}>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="text-xs rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Use Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="text-xs rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Upload from Device
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelSection("photo")}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Back to Members button */}
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={goBackToList}
              className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
            >
              Back to Members
            </button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading profile…</p>}

        {(error || relationshipError) && (
          <div className="space-y-1">
            {error && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                {error}
              </div>
            )}
            {relationshipError && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
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
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingSection === "personal"}
                        onClick={() => saveSection("personal")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "personal" ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelSection("personal")}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
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
                              ` ${member.emergencyContactPhone}`}
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
                      <dd className="flex flex-wrap gap-1">
                        {sortStatusesByPriority(
                          member.status.includes(",")
                            ? member.status.split(",").map(s => s.trim())
                            : [member.status]
                        ).map((s) => (
                          <span
                            key={s}
                            className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClasses(s)}`}
                          >
                            {s.charAt(0) + s.slice(1).toLowerCase()}
                          </span>
                        ))}
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

                    {/* RELATIONSHIPS SECTION */}
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Relationships
                      </dt>
                      <dd className="text-gray-900">
                        {relationshipsLoading ? (
                          <span className="text-xs text-gray-500">
                            Loading relationships…
                          </span>
                        ) : relationships.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="space-y-1">
                            {relationships.map((rel) => (
                              <div key={rel.id} className="text-sm">
                                <RelationshipLabel
                                  rel={rel}
                                  currentMemberId={memberId}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </dd>
                    </div>

                    {/* WAIVER SECTION */}
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Waiver
                      </dt>
                      <dd className="text-gray-900">
                        <div className="space-y-0.5 text-sm">
                          <div>
                            Signed: <span>{member.waiverSigned ? "Yes" : "No"}</span>
                          </div>
                          {member.waiverSignedAt && (
                            <div>
                              Date: <span>{new Date(member.waiverSignedAt).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </dd>
                    </div>

                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Medical Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.medicalNotes || (
                          <span className="text-gray-400">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500 text-xs uppercase">
                        Notes
                      </dt>
                      <dd className="text-gray-900 whitespace-pre-wrap">
                        {member.notes || (
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Last Name *
                      </label>
                      <input
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Member #
                      </label>
                      <input
                        value={memberNumber}
                        onChange={(e) => setMemberNumber(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="e.g. 10000001"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Status
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Coach */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("COACH")) {
                              setStatuses((prev) => prev.filter((s) => s !== "COACH"));
                            } else {
                              // Adding Coach clears Banned
                              setStatuses((prev) => [...prev.filter((s) => s !== "COACH" && s !== "BANNED"), "COACH"]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("COACH")
                              ? "bg-purple-100 text-purple-800 border-purple-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Coach
                        </button>
                        {/* Active */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "ACTIVE"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("ACTIVE")
                              ? "bg-green-100 text-green-800 border-green-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Active
                        </button>
                        {/* Parent */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("PARENT")) {
                              setStatuses((prev) => prev.filter((s) => s !== "PARENT"));
                            } else {
                              // Adding Parent clears Banned
                              setStatuses((prev) => [...prev.filter((s) => s !== "PARENT" && s !== "BANNED"), "PARENT"]);
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("PARENT")
                              ? "bg-blue-100 text-blue-800 border-blue-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Parent
                        </button>
                        {/* Inactive */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "INACTIVE"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("INACTIVE")
                              ? "bg-primary/10 text-primary border-primary/30"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Inactive
                        </button>
                        {/* Prospect */}
                        <button
                          type="button"
                          onClick={() => {
                            // Prospect/Active/Inactive are mutually exclusive, clears Banned
                            setStatuses((prev) => {
                              const others = prev.filter((s) => !["PROSPECT", "ACTIVE", "INACTIVE", "BANNED"].includes(s));
                              return [...others, "PROSPECT"];
                            });
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("PROSPECT")
                              ? "bg-yellow-100 text-yellow-800 border-yellow-300"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Prospect
                        </button>
                        {/* Banned */}
                        <button
                          type="button"
                          onClick={() => {
                            if (statuses.includes("BANNED")) {
                              // Removing Banned - confirm first
                              if (window.confirm("Are you sure you want to remove the banned status from this member?")) {
                                setStatuses((prev) => prev.filter((s) => s !== "BANNED"));
                              }
                            } else {
                              // Adding Banned clears ALL other statuses - confirm first
                              if (window.confirm("Are you sure you want to ban this member? This will clear all other statuses.")) {
                                setStatuses(["BANNED"]);
                              }
                            }
                          }}
                          className={`rounded-full px-3 py-1 text-xs font-medium border ${
                            statuses.includes("BANNED")
                              ? "bg-gray-200 text-gray-900 border-gray-400"
                              : "bg-white text-gray-400 border-gray-300 hover:bg-gray-50"
                          }`}
                        >
                          Banned
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                        placeholder="(123) 456-7890"
                        maxLength={14}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        City
                      </label>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        State
                      </label>
                      <input
                        value={stateValue}
                        onChange={(e) => setStateValue(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Zip Code
                      </label>
                      <input
                        value={zipCode}
                        onChange={(e) => setZipCode(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Emergency Contact Phone
                      </label>
                      <input
                        type="tel"
                        value={emergencyContactPhoneState}
                        onChange={(e) =>
                          setEmergencyContactPhoneState(formatPhoneNumber(e.target.value))
                        }
                        placeholder="(123) 456-7890"
                        maxLength={14}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                      />
                    </div>

                    {/* RELATIONSHIPS AND WAIVER SECTION - SIDE BY SIDE */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-medium text-gray-700">
                          Relationships
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingRelationship(true);
                            setRelationshipError(null);
                          }}
                          className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
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
                          <p className="text-xs text-gray-400">
                            No relationships linked yet.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {relationships.map((rel) => (
                              <div
                                key={rel.id}
                                className="flex items-center justify-between gap-2"
                              >
                                <span className="text-xs text-gray-900">
                                  <RelationshipLabel
                                    rel={rel}
                                    currentMemberId={memberId}
                                  />
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRelationship(rel.id)}
                                  className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {addingRelationship && (
                          <div className="mt-2 rounded-md border border-gray-200 p-2 space-y-2">
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
                                onClick={handleAddRelationship}
                                className="rounded-md bg-primary px-2 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                              >
                                Add
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setAddingRelationship(false);
                                  setNewRelationshipType("PARENT");
                                  setNewRelationshipMemberId("");
                                  setRelationshipError(null);
                                }}
                                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                              >
                                Cancel
                              </button>
                            </div>
                            {relationshipError && (
                              <p className="text-xs text-primary">
                                {relationshipError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* WAIVER SECTION */}
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-gray-700">
                        Waiver
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                          <input
                            type="checkbox"
                            checked={waiverSigned}
                            onChange={(e) =>
                              setWaiverSigned(e.target.checked)
                            }
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          Signed
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700">
                            Date:
                          </label>
                          <input
                            type="date"
                            value={waiverSignedAt}
                            onChange={(e) => setWaiverSignedAt(e.target.value)}
                            className="rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                            style={{ width: '150px' }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Medical Notes
                      </label>
                      <textarea
                        value={medicalNotes}
                        onChange={(e) => setMedicalNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-700">
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        rows={2}
                      />
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
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingSection === "membership"}
                        onClick={() => saveSection("membership")}
                        className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "membership" ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelSection("membership")}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
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
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        placeholder="e.g. Adult Unlimited, Kids 2x/week"
                      />
                    </div>
                  </form>
                )}
              </section>

              {/* STYLES */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Styles</h2>
                  <button
                    type="button"
                    onClick={() => {
                      addStyle();
                      setEditingStyleIndex(styles.length);
                      setStylesTab("active"); // Switch to active tab when adding
                    }}
                    className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
                  >
                    Add Style
                  </button>
                </div>

                {/* Tabs for Active/Inactive Styles */}
                <div className="flex gap-2 mb-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setStylesTab("active")}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      stylesTab === "active"
                        ? "border-primary text-primary"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Active Styles ({styles.filter(s => s.active !== false).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStylesTab("inactive")}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                      stylesTab === "inactive"
                        ? "border-primary text-primary"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    Inactive Styles ({styles.filter(s => s.active === false).length})
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  {styles.length === 0 ? (
                    <span className="text-sm text-gray-400">
                      No styles added yet.
                    </span>
                  ) : (() => {
                    const filteredStyles = styles
                      .map((s, i) => ({ style: s, originalIndex: i }))
                      .filter(({ style }) =>
                        stylesTab === "active"
                          ? style.active !== false
                          : style.active === false
                      );

                    if (filteredStyles.length === 0) {
                      return (
                        <span className="text-sm text-gray-400">
                          {stylesTab === "active"
                            ? "No active styles."
                            : "No inactive styles."}
                        </span>
                      );
                    }

                    return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredStyles.map(({ style: s, originalIndex: i }) => (
                        <div
                          key={i}
                          className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gradient-to-br from-gray-50 to-white shadow-sm hover:shadow-md transition-shadow"
                          style={{ maxWidth: '280px' }}
                        >
                          {editingStyleIndex === i ? (
                            /* EDIT MODE for this style */
                            <div className="space-y-2">
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Style
                                </label>
                                <select
                                  value={s.name}
                                  onChange={(e) =>
                                    updateStyle(i, "name", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                >
                                  <option value="">Select Style</option>
                                  {availableStyles.map((st) => (
                                    <option key={st.id} value={st.name}>
                                      {st.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Rank Level
                                </label>
                                <select
                                  value={s.rank || ""}
                                  onChange={(e) =>
                                    updateStyle(i, "rank", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                >
                                  <option value="">Select Rank</option>
                                  {(() => {
                                    const selectedStyle = availableStyles.find(
                                      (st) => st.name === s.name
                                    );
                                    if (!selectedStyle || !selectedStyle.ranks) {
                                      return null;
                                    }
                                    return selectedStyle.ranks
                                      .sort((a, b) => a.order - b.order)
                                      .map((rank) => (
                                        <option key={rank.id} value={rank.name}>
                                          {rank.name}
                                        </option>
                                      ));
                                  })()}
                                </select>
                              </div>
                              {(() => {
                                const selectedStyle = availableStyles.find(
                                  (st) => st.name === s.name
                                );
                                const selectedRank = selectedStyle?.ranks?.find(
                                  (r) => r.name === s.rank
                                );
                                if (selectedRank && selectedRank.classRequirement != null) {
                                  return (
                                    <div className="space-y-1">
                                      <label className="block text-[11px] font-medium text-gray-700">
                                        Class Requirement
                                      </label>
                                      <input
                                        type="text"
                                        value={`${selectedRank.classRequirement} classes`}
                                        readOnly
                                        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm bg-gray-50 text-gray-600"
                                      />
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Training Start Date
                                </label>
                                <input
                                  type="date"
                                  value={s.startDate || ""}
                                  onChange={(e) =>
                                    updateStyle(i, "startDate", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Last Promotion Date
                                </label>
                                <input
                                  type="date"
                                  value={s.lastPromotionDate || ""}
                                  onChange={(e) =>
                                    updateStyle(i, "lastPromotionDate", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                />
                                <p className="text-[10px] text-gray-500">Auto-updates when rank changes</p>
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Belt Size
                                </label>
                                <input
                                  value={s.beltSize || ""}
                                  onChange={(e) =>
                                    updateStyle(i, "beltSize", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  placeholder="e.g. A2"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-[11px] font-medium text-gray-700">
                                  Uniform Size
                                </label>
                                <input
                                  value={s.uniformSize || ""}
                                  onChange={(e) =>
                                    updateStyle(i, "uniformSize", e.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                                  placeholder="e.g. Small"
                                />
                              </div>
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  disabled={savingSection === "style"}
                                  onClick={() => saveSection("style")}
                                  className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                                >
                                  {savingSection === "style" ? "Saving..." : "Save"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    cancelSection("style");
                                  }}
                                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* READ-ONLY MODE for this style */
                            <>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-gray-900">
                                    {s.name}
                                  </span>
                                </div>
                                <div className="mt-3 space-y-2 text-sm">
                                  {s.rank && (() => {
                                    // Get the rank color from beltConfig
                                    const styleData = availableStyles.find((style) => style.name === s.name);
                                    let rankColor = "#e5e7eb"; // default gray
                                    if (styleData?.beltConfig) {
                                      try {
                                        const beltConfig = JSON.parse(styleData.beltConfig);
                                        const rankData = beltConfig.ranks?.find((r: any) => r.name === s.rank);
                                        if (rankData?.layers?.fabricColor) {
                                          const color = rankData.layers.fabricColor.toLowerCase();
                                          // Use light gray for white/near-white colors
                                          if (color === "#ffffff" || color === "#fff" || color === "white") {
                                            rankColor = "#e5e7eb";
                                          } else {
                                            rankColor = rankData.layers.fabricColor;
                                          }
                                        }
                                      } catch { /* ignore */ }
                                    }
                                    // Create a light tint (10% opacity effect)
                                    const hexToRgb = (hex: string) => {
                                      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                                      return result ? {
                                        r: parseInt(result[1], 16),
                                        g: parseInt(result[2], 16),
                                        b: parseInt(result[3], 16)
                                      } : { r: 229, g: 231, b: 235 };
                                    };
                                    const rgb = hexToRgb(rankColor);
                                    // Create a very light tint by mixing with white (90% white, 10% color)
                                    const lightBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
                                    const borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.4)`;
                                    // Use slate-500 - a soft neutral that works on all tinted backgrounds
                                    const textColor = "#64748b";

                                    return (
                                      <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Rank</span>
                                        <span
                                          className="text-xs font-medium rounded px-2 py-0.5"
                                          style={{
                                            backgroundColor: lightBg,
                                            border: `1px solid ${borderColor}`,
                                            color: textColor
                                          }}
                                        >
                                          {s.rank}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                  {s.beltSize && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Belt</span>
                                      <span className="text-xs font-medium text-gray-700">{s.beltSize}</span>
                                    </div>
                                  )}
                                  {s.uniformSize && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Uniform</span>
                                      <span className="text-xs font-medium text-gray-700">{s.uniformSize}</span>
                                    </div>
                                  )}
                                  {(() => {
                                    const selectedStyle = availableStyles.find(
                                      (style) => style.name === s.name
                                    );

                                    if (!selectedStyle || !s.rank) return null;

                                    // Try to get class requirements from beltConfig JSON
                                    let classRequirements: Array<{ label: string; minCount: number | null }> = [];

                                    if (selectedStyle.beltConfig) {
                                      try {
                                        const beltConfig = JSON.parse(selectedStyle.beltConfig);
                                        const rankData = beltConfig.ranks?.find((r: any) => r.name === s.rank);
                                        if (rankData?.classRequirements) {
                                          classRequirements = rankData.classRequirements.filter(
                                            (req: any) => req.label && req.minCount != null && req.minCount > 0
                                          );
                                        }
                                      } catch (e) {
                                        // Ignore JSON parse errors
                                      }
                                    }

                                    // If we have class type requirements from beltConfig, show them
                                    // Helper to check if attendance matches this style
                                    const matchesStyle = (att: { classSession?: { styleName?: string | null; styleNames?: string | null; program?: { name?: string } | null } | null }) => {
                                      const cs = att.classSession;
                                      if (!cs) return false;
                                      // Check styleName (single style)
                                      if (cs.styleName?.toLowerCase() === s.name.toLowerCase()) return true;
                                      // Check styleNames (JSON array of style names)
                                      if (cs.styleNames) {
                                        try {
                                          const names = JSON.parse(cs.styleNames);
                                          if (Array.isArray(names) && names.some((n: string) => n.toLowerCase() === s.name.toLowerCase())) return true;
                                        } catch { /* ignore */ }
                                      }
                                      // Check program name (legacy)
                                      if (cs.program?.name?.toLowerCase() === s.name.toLowerCase()) return true;
                                      return false;
                                    };

                                    if (classRequirements.length > 0) {
                                      return (
                                        <div className="space-y-1.5 pt-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Progress</span>
                                          {classRequirements.map((req, idx) => {
                                            // Count attendance for this class type
                                            const attended = (member?.attendances || []).filter(
                                              (att) =>
                                                matchesStyle(att) &&
                                                att.classSession?.classType === req.label
                                            ).length;
                                            const progress = req.minCount ? Math.min(100, (attended / req.minCount) * 100) : 0;
                                            const isComplete = req.minCount ? attended >= req.minCount : false;

                                            return (
                                              <div key={idx} className="space-y-0.5">
                                                <div className="flex items-center justify-between text-xs">
                                                  <span className="font-medium text-gray-600">{req.label}</span>
                                                  <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-800'}`}>{attended}/{req.minCount}</span>
                                                </div>
                                                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                                  <div
                                                    className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
                                                    style={{ width: `${progress}%` }}
                                                  />
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      );
                                    }

                                    // Fallback: show single requirement from Rank model if available
                                    const selectedRank = selectedStyle.ranks?.find((r) => r.name === s.rank);
                                    if (selectedRank?.classRequirement != null) {
                                      const styleAttendance = (member?.attendances || []).filter(
                                        (att) => matchesStyle(att)
                                      );
                                      const progress = Math.min(100, (styleAttendance.length / selectedRank.classRequirement) * 100);
                                      const isComplete = styleAttendance.length >= selectedRank.classRequirement;
                                      return (
                                        <div className="space-y-1.5 pt-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Progress</span>
                                          <div className="space-y-0.5">
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="font-medium text-gray-600">Classes</span>
                                              <span className={`font-bold ${isComplete ? 'text-green-600' : 'text-gray-800'}`}>{styleAttendance.length}/{selectedRank.classRequirement}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                                              <div
                                                className={`h-full rounded-full transition-all ${isComplete ? 'bg-green-500' : 'bg-primary'}`}
                                                style={{ width: `${progress}%` }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    }

                                    return null;
                                  })()}
                                  {s.startDate && (
                                    <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Started</span>
                                      <span className="text-xs font-medium text-gray-700">
                                        {new Date(
                                          s.startDate + "T00:00:00"
                                        ).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                  {s.lastPromotionDate && (
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Last Promotion</span>
                                      <span className="text-xs font-medium text-gray-700">
                                        {new Date(
                                          s.lastPromotionDate + "T00:00:00"
                                        ).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                {/* Rank Documents button + popup */}
                                {(() => {
                                  const styleData = availableStyles.find((style) => style.name === s.name);
                                  if (!styleData || !s.rank || !styleData.beltConfig) return <div className="flex-1" />;

                                  let styleDocs: StyleDocument[] = [];
                                  try {
                                    const beltConfig = JSON.parse(styleData.beltConfig);
                                    const currentRank = beltConfig.ranks?.find((r: any) => r.name === s.rank);
                                    if (currentRank) {
                                      const ranksToInclude = beltConfig.ranks
                                        .filter((r: any) => r.order <= currentRank.order)
                                        .sort((a: any, b: any) => b.order - a.order); // Sort descending by order
                                      ranksToInclude.forEach((rank: any) => {
                                        if (rank.pdfDocuments && Array.isArray(rank.pdfDocuments)) {
                                          rank.pdfDocuments.forEach((pdf: any) => {
                                            if (!styleDocs.some(d => d.name === pdf.name)) {
                                              styleDocs.push(pdf);
                                            }
                                          });
                                        }
                                      });
                                    }
                                  } catch { /* ignore */ }

                                  if (styleDocs.length === 0) return <div className="flex-1" />;

                                  return (
                                    <div className="relative flex-1 min-w-0">
                                      <button
                                        type="button"
                                        onClick={() => setRankDocsPopupIndex(rankDocsPopupIndex === i ? null : i)}
                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs text-left hover:bg-gray-50"
                                      >
                                        Rank Documents
                                      </button>
                                      {rankDocsPopupIndex === i && (
                                        <>
                                          {/* Backdrop to close popup */}
                                          <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setRankDocsPopupIndex(null)}
                                          />
                                          {/* Popup */}
                                          <div className="absolute left-0 top-full mt-1 z-50 w-64 max-h-60 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
                                            <div className="p-2 border-b border-gray-200 bg-gray-50">
                                              <span className="text-xs font-semibold text-gray-700">Rank Documents</span>
                                            </div>
                                            <div className="py-1">
                                              {styleDocs.map((doc, idx) => (
                                                <button
                                                  key={idx}
                                                  type="button"
                                                  onClick={() => {
                                                    const byteString = atob(doc.url.split(',')[1]);
                                                    const mimeString = doc.url.split(',')[0].split(':')[1].split(';')[0];
                                                    const ab = new ArrayBuffer(byteString.length);
                                                    const ia = new Uint8Array(ab);
                                                    for (let j = 0; j < byteString.length; j++) {
                                                      ia[j] = byteString.charCodeAt(j);
                                                    }
                                                    const blob = new Blob([ab], { type: mimeString });
                                                    const blobUrl = URL.createObjectURL(blob);
                                                    window.open(blobUrl, '_blank', 'noopener,noreferrer');
                                                    setRankDocsPopupIndex(null);
                                                  }}
                                                  className="w-full px-3 py-2 text-left text-xs hover:bg-gray-100 flex items-center gap-2"
                                                >
                                                  <svg className="w-4 h-4 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                                  </svg>
                                                  <span className="truncate">{doc.name}</span>
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="flex gap-2 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const styleName = s.name || "this style";
                                      if (!window.confirm(`Are you sure you want to remove ${styleName}?`)) {
                                        return;
                                      }

                                      // Remove the style from local state
                                      const updatedStyles = styles.filter((_, idx) => idx !== i);
                                      setStyles(updatedStyles);

                                      // Immediately save to server
                                      try {
                                        const body = {
                                          stylesNotes: JSON.stringify(updatedStyles),
                                        };

                                        const res = await fetch(`/api/members/${memberId}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(body),
                                        });

                                        if (!res.ok) {
                                          const errText = await res.text();
                                          throw new Error(errText || "Failed to remove style");
                                        }

                                        const updated = await res.json();
                                        setMember(updated.member);
                                        hydrateFormFromMember(updated.member);
                                      } catch (err: any) {
                                        setError(err.message || "Failed to remove style");
                                        // Restore the style if save failed
                                        if (member) {
                                          hydrateFormFromMember(member);
                                        }
                                      }
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    Remove
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      // Toggle active status
                                      const updatedStyles = styles.map((style, idx) =>
                                        idx === i ? { ...style, active: style.active === false ? true : false } : style
                                      );
                                      setStyles(updatedStyles);

                                      // Immediately save to server
                                      try {
                                        const body = {
                                          stylesNotes: JSON.stringify(updatedStyles),
                                        };

                                        const res = await fetch(`/api/members/${memberId}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify(body),
                                        });

                                        if (!res.ok) {
                                          const errText = await res.text();
                                          throw new Error(errText || "Failed to update style status");
                                        }

                                        const updated = await res.json();
                                        setMember(updated.member);
                                        hydrateFormFromMember(updated.member);
                                      } catch (err: any) {
                                        setError(err.message || "Failed to update style status");
                                        // Restore if save failed
                                        if (member) {
                                          hydrateFormFromMember(member);
                                        }
                                      }
                                    }}
                                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                                  >
                                    {s.active === false ? "Activate" : "Deactivate"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingStyleIndex(i)}
                                    className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                                  >
                                    Edit
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    );
                  })()}
                </div>
              </section>

              {/* STYLE DOCUMENTS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Style Documents</h2>
                  <label className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark cursor-pointer">
                    {uploadingDocument ? "Uploading..." : "Upload PDF"}
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={handleDocumentUpload}
                      disabled={uploadingDocument}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="space-y-2 text-sm">
                  {styles.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <p className="text-xs text-gray-400">
                        No styles assigned yet. Assign a style to upload documents.
                      </p>
                    </div>
                  ) : (
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <p className="text-xs text-gray-400">
                        Click "Upload PDF" to add documents to this member's styles.
                      </p>
                    </div>
                  )}
                </div>
              </section>

            </div>

            {/* RIGHT: Payments + Activity */}
            <div className="flex flex-col gap-4">
              {/* PAYMENTS */}
              <section className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold">Payments / POS</h2>
                  {!editingPayments ? (
                    <button
                      type="button"
                      onClick={() => setEditingPayments(true)}
                      className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark"
                    >
                      Edit
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        form="payments-form"
                        disabled={savingSection === "payments"}
                        className="rounded-md bg-primary px-3 py-1 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-60"
                      >
                        {savingSection === "payments" ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelSection("payments")}
                        className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {!editingPayments ? (
                  <>
                    <div className="mb-2">
                      <span className="text-xs text-gray-500">
                        Safe notes only (no card numbers).
                      </span>
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
                    id="payments-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveSection("payments");
                    }}
                    className="space-y-2 text-sm"
                  >
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Payment / POS Notes
                      </label>
                    </div>
                    <textarea
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
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

        {/* PDF Viewer Modal */}
      </div>
    </AppLayout>
  );
}
