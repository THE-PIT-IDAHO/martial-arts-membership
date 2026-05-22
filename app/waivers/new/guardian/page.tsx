"use client";

import { useEffect, useState, useRef } from "react";
import { getTodayString, parseLocalDate } from "@/lib/dates";
import { DateOfBirthPicker } from "@/components/date-of-birth-picker";
import { generateWaiverPdf } from "@/lib/waiver-pdf";

function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

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

const DEFAULT_GYM_SETTINGS: GymSettings = {
  name: "Our Martial Arts School",
  address: "",
  phone: "",
  email: "",
};

type WaiverOptions = {
  includeMinorSignature: boolean;
  includeMinorEmail: boolean;
};

const DEFAULT_WAIVER_OPTIONS: WaiverOptions = {
  includeMinorSignature: true,
  includeMinorEmail: true,
};

// Function to replace placeholders with actual values.
// memberFirst/memberLast feed the {{MEMBER_FIRST_NAME}} / {{MEMBER_LAST_NAME}}
// tags. parentGuardian feeds {{PARENT_GUARDIAN}} — callers pass the
// guardian's name on the child's copy and an empty string on the parent's
// own copy (where the parent IS the member).
function replacePlaceholders(
  text: string,
  gym: GymSettings,
  memberName?: string,
  memberFirst?: string,
  memberLast?: string,
  parentGuardian?: string,
): string {
  if (!text) return text;

  let result = text;

  result = result.replace(/\{\{MEMBER_NAME\}\}/g, memberName || "my minor child");
  result = result.replace(/\{\{MEMBER_FIRST_NAME\}\}/g, memberFirst || "");
  result = result.replace(/\{\{MEMBER_LAST_NAME\}\}/g, memberLast || "");
  result = result.replace(/\{\{PARENT_GUARDIAN\}\}/g, parentGuardian || "");

  // Gym placeholders
  result = result.replace(/\{\{GYM_NAME\}\}/g, gym.name || "[Gym Name]");
  result = result.replace(/\{\{GYM_ADDRESS\}\}/g, gym.address || "[Gym Address]");
  result = result.replace(/\{\{GYM_PHONE\}\}/g, gym.phone || "[Gym Phone]");
  result = result.replace(/\{\{GYM_EMAIL\}\}/g, gym.email || "[Gym Email]");

  // Date placeholder
  result = result.replace(/\{\{DATE\}\}/g, new Date().toLocaleDateString());

  return result;
}

const DEFAULT_WAIVER_SECTIONS: WaiverSection[] = [
  {
    id: "assumption_of_risk",
    title: "ASSUMPTION OF RISK",
    content: "I understand that martial arts training involves physical contact and strenuous physical activity. I acknowledge that there are inherent risks associated with martial arts training including, but not limited to, bruises, sprains, strains, fractures, and other injuries that may occur during training, sparring, or practice."
  },
  {
    id: "waiver_release",
    title: "WAIVER AND RELEASE",
    content: "In consideration of my minor child being permitted to participate in martial arts classes, training, and related activities, I hereby waive, release, and discharge the martial arts school, its owners, instructors, employees, and agents from any and all liability, claims, demands, and causes of action arising out of or related to any loss, damage, or injury that may be sustained by my minor child while participating in such activities."
  },
  {
    id: "medical_authorization",
    title: "MEDICAL AUTHORIZATION",
    content: "I authorize the staff to obtain emergency medical treatment for my minor child if necessary. I understand that I am responsible for any medical expenses incurred."
  },
  {
    id: "photo_video_release",
    title: "PHOTO/VIDEO RELEASE",
    content: "I grant permission for photographs and/or videos of my minor child taken during classes or events to be used for promotional purposes, including but not limited to websites, social media, and marketing materials."
  },
  {
    id: "rules_regulations",
    title: "RULES AND REGULATIONS",
    content: "I agree that my minor child will abide by all rules and regulations of the martial arts school. I understand that failure to follow instructions or rules may result in dismissal from the program without refund."
  },
  {
    id: "health_declaration",
    title: "HEALTH DECLARATION",
    content: "I certify that my minor child is in good physical condition and has no medical conditions that would prevent safe participation in martial arts training. I agree to notify the instructors of any changes in health status."
  },
  {
    id: "closing_statement",
    title: "",
    content: "I HAVE READ THIS WAIVER AND RELEASE, FULLY UNDERSTAND ITS TERMS, AND SIGN IT FREELY AND VOLUNTARILY WITHOUT ANY INDUCEMENT."
  }
];

// Auto-capitalize first letter of each word
function autoCapitalize(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

// One signing session can cover up to 5 children — the parent signs once
// and we generate a separate PDF per kid + a single adult-style PDF for
// the parent.
const MAX_CHILDREN = 5;

type ChildEntry = {
  // When set, the new waiver attaches to this existing member ID. When
  // empty, a fresh child member is created from the firstName/lastName
  // fields.
  existingChildMemberId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  // Per-child emergency contact. Defaults to "same as guardian's" so the
  // common case ("kid's emergency contact is the other parent") is one
  // click. Toggle off to enter different name/phone.
  emergencyContactSameAsGuardian: boolean;
  emergencyContactName: string;
  emergencyContactPhone: string;
  // Relationship label is always per-child ("Aunt" to the kid even if the
  // person is the guardian's "Sister"). Stored independently.
  emergencyContactRelationship: string;
  medicalNotes: string;
};

function newChildEntry(): ChildEntry {
  return {
    existingChildMemberId: "",
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    email: "",
    emergencyContactSameAsGuardian: true,
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
    medicalNotes: "",
  };
}

export default function GuardianWaiverPage() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  // Dependent (Minor) fields — one entry per child, up to MAX_CHILDREN.
  // Each entry is self-contained: when picking an existing linked kid via
  // existingChildMemberId, the form attaches the new SignedWaiver to that
  // member ID; otherwise a new child member is created from the entered
  // fields. Emergency contact + medical notes are per-child so siblings
  // with different needs don't collide.
  const [children, setChildren] = useState<ChildEntry[]>([newChildEntry()]);

  // Guardian fields
  const [guardianFirstName, setGuardianFirstName] = useState("");
  const [guardianLastName, setGuardianLastName] = useState("");
  const [guardianDateOfBirth, setGuardianDateOfBirth] = useState("");
  const [relationship, setRelationship] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");

  // Guardian's emergency contact (single — children carry their own per
  // ChildEntry.emergency* fields, defaulting to "same as guardian's").
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState("");

  // Agreement
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToGuardian, setAgreedToGuardian] = useState(false);
  const [hasScrolledWaiver, setHasScrolledWaiver] = useState(false);
  const waiverScrollRef = useRef<HTMLDivElement>(null);
  const [signatureDate, setSignatureDate] = useState(getTodayString());
  const [waiverSections, setWaiverSections] = useState<WaiverSection[]>(DEFAULT_WAIVER_SECTIONS);
  const [gymSettings, setGymSettings] = useState<GymSettings>(DEFAULT_GYM_SETTINGS);
  const [gymLogoImg, setGymLogoImg] = useState<HTMLImageElement | null>(null);
  const [waiverOptions, setWaiverOptions] = useState<WaiverOptions>(DEFAULT_WAIVER_OPTIONS);

  // Signature canvas - Guardian
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Container ref for scrolling
  const containerRef = useRef<HTMLDivElement>(null);

  // Signature canvas - Minor (14-17)
  const minorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isMinorDrawing, setIsMinorDrawing] = useState(false);
  const [hasMinorSignature, setHasMinorSignature] = useState(false);

  // Calculate age from DOB
  function calculateAge(dob: string): number {
    if (!dob) return 0;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  // Minor signature feature is tied to the first child entry only — the
  // common case for the 14-17 minor-signature requirement. If a parent
  // needs to sign for multiple 14-17 kids, they should email a separate
  // session per kid.
  const firstChild = children[0] || newChildEntry();
  const minorAge = calculateAge(firstChild.dateOfBirth);
  const isMinor14to17 = minorAge >= 14 && minorAge <= 17;

  // Optional template slug from ?template=<slug>. Used to tag the
  // SignedWaiver row on the server and to load template-specific content +
  // options instead of the tenant's global defaults.
  const [templateSlug, setTemplateSlug] = useState<string>("");
  const [templateId, setTemplateId] = useState<string>("");
  // If ?parentMemberId=<id> is present, this page was reached from an
  // admin "Add Child" email link. Pre-fill the guardian block from that
  // member so the parent doesn't re-enter their info, and offer an
  // existing-child picker so a re-sign attaches to the same child member
  // record (instead of creating a duplicate).
  const [parentMemberId, setParentMemberId] = useState<string>("");
  const [linkedChildren, setLinkedChildren] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string | null;
    email: string | null;
    phone: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelationship: string | null;
    medicalNotes: string | null;
  }>>([]);
  // Helpers for the children[] array. Index-based so the UI can render
  // one section per kid without prop-drilling.
  function updateChild(index: number, patch: Partial<ChildEntry>) {
    setChildren((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function addChild() {
    setChildren((prev) => (prev.length >= MAX_CHILDREN ? prev : [...prev, newChildEntry()]));
  }
  function removeChild(index: number) {
    setChildren((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }
  // Apply a linked-child record to a child slot (clears it when picker
  // returns to the empty/"New child" option).
  function applyExistingChild(index: number, id: string) {
    if (!id) {
      updateChild(index, { ...newChildEntry() });
      return;
    }
    const c = linkedChildren.find((x) => x.id === id);
    if (!c) return;
    updateChild(index, {
      existingChildMemberId: id,
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      dateOfBirth: c.dateOfBirth ? new Date(c.dateOfBirth).toISOString().split("T")[0] : "",
      email: c.email || "",
      emergencyContactSameAsGuardian: !(c.emergencyContactName || c.emergencyContactPhone || c.emergencyContactRelationship),
      emergencyContactName: c.emergencyContactName || "",
      emergencyContactPhone: c.emergencyContactPhone || "",
      emergencyContactRelationship: c.emergencyContactRelationship || "",
      medicalNotes: c.medicalNotes || "",
    });
  }

  // The parent's own PDF reads like an adult enrollment waiver. We pull the
  // first active adult template's content for it so the legal language fits
  // ("I, [parent], acknowledge…") instead of reusing the guardian template
  // (which leaves {{PARENT_GUARDIAN}} dangling because the parent IS the
  // member on their own copy).
  const [parentWaiverSections, setParentWaiverSections] = useState<WaiverSection[] | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get("template") || "";
        const parentIdParam = params.get("parentMemberId") || "";
        let usedTemplate = false;

        // Parent pre-fill (admin "Add Child" flow)
        if (parentIdParam) {
          const pRes = await fetch(`/api/public/member-info?memberId=${encodeURIComponent(parentIdParam)}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            const p = pData.member;
            setParentMemberId(p.id);
            setGuardianFirstName(p.firstName || "");
            setGuardianLastName(p.lastName || "");
            if (p.dateOfBirth) setGuardianDateOfBirth(new Date(p.dateOfBirth).toISOString().split("T")[0]);
            setEmail(p.email || "");
            setPhone(p.phone || "");
            setAddress(p.address || "");
            setCity(p.city || "");
            setState(p.state || "");
            setZipCode(p.zipCode || "");
            setEmergencyContactName(p.emergencyContactName || "");
            setEmergencyContactPhone(p.emergencyContactPhone || "");
            setEmergencyContactRelationship(p.emergencyContactRelationship || "");
          }
          // Pull linked children for the existing-child dropdown.
          try {
            const lcRes = await fetch(
              `/api/public/linked-children?parentMemberId=${encodeURIComponent(parentIdParam)}`,
            );
            if (lcRes.ok) {
              const lcData = await lcRes.json();
              setLinkedChildren(lcData.children || []);
            }
          } catch { /* non-critical */ }
        }

        if (slug) {
          const tRes = await fetch(`/api/public/waiver-template/${encodeURIComponent(slug)}`);
          if (tRes.ok) {
            const tData = await tRes.json();
            if (tData.template?.content) {
              try { setWaiverSections(JSON.parse(tData.template.content)); } catch { /* defaults */ }
            }
            if (tData.template?.options) {
              try {
                const parsed = JSON.parse(tData.template.options);
                setWaiverOptions({ ...DEFAULT_WAIVER_OPTIONS, ...parsed });
              } catch { /* defaults */ }
            }
            if (tData.gymSettings) {
              try { setGymSettings(JSON.parse(tData.gymSettings)); } catch { /* defaults */ }
            }
            if (tData.gymLogo) {
              const img = new Image();
              img.onload = () => setGymLogoImg(img);
              img.src = tData.gymLogo;
            }
            setTemplateSlug(tData.template.slug || slug);
            setTemplateId(tData.template.id || "");
            usedTemplate = true;
          }
        }

        if (!usedTemplate) {
          const res = await fetch("/api/public/waiver-data");
          if (res.ok) {
            const data = await res.json();
            if (data.waiverContent) {
              try { setWaiverSections(JSON.parse(data.waiverContent)); } catch { /* defaults */ }
            }
            if (data.gymSettings) {
              try { setGymSettings(JSON.parse(data.gymSettings)); } catch { /* defaults */ }
            }
            if (data.gymLogo) {
              const img = new Image();
              img.onload = () => setGymLogoImg(img);
              img.src = data.gymLogo;
            }
            if (data.waiverOptions) {
              try {
                const parsed = JSON.parse(data.waiverOptions);
                setWaiverOptions({ ...DEFAULT_WAIVER_OPTIONS, ...parsed });
              } catch { /* defaults */ }
            }
          }
        }

        // Fetch the first active adult template (preferring the default
        // adult one if present) for use as the parent's own PDF content.
        // Best-effort — if none exists, parent PDF falls back to the
        // current (guardian) sections.
        try {
          const listRes = await fetch("/api/public/waiver-templates");
          if (listRes.ok) {
            const listData = await listRes.json();
            const adultTpl = (listData.templates || []).find(
              (t: { audience: string; slug: string }) => t.audience === "adult",
            );
            if (adultTpl?.slug) {
              const adultRes = await fetch(
                `/api/public/waiver-template/${encodeURIComponent(adultTpl.slug)}`,
              );
              if (adultRes.ok) {
                const adultData = await adultRes.json();
                if (adultData.template?.content) {
                  try {
                    setParentWaiverSections(JSON.parse(adultData.template.content));
                  } catch { /* keep null → fall back to guardian sections */ }
                }
              }
            }
          }
        } catch { /* non-critical */ }
      } catch (err) {
        console.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function handleWaiverScroll() {
    const el = waiverScrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setHasScrolledWaiver(true);
    }
  }

  // Canvas drawing functions
  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  // Minor signature canvas functions
  function startMinorDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsMinorDrawing(true);
    const canvas = minorCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function drawMinor(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isMinorDrawing) return;

    const canvas = minorCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let x, y;

    if ("touches" in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * scaleX;
      y = (e.touches[0].clientY - rect.top) * scaleY;
    } else {
      x = (e.clientX - rect.left) * scaleX;
      y = (e.clientY - rect.top) * scaleY;
    }

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasMinorSignature(true);
  }

  function stopMinorDrawing() {
    setIsMinorDrawing(false);
  }

  function clearMinorSignature() {
    const canvas = minorCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMinorSignature(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!agreedToTerms || !agreedToGuardian) {
      setError("You must agree to all terms and confirm you are the legal guardian");
      return;
    }

    if (!hasSignature) {
      setError("Please provide a guardian signature");
      return;
    }

    // Every child entry needs first + last name. Walk the array so the
    // first missing entry gets called out by position.
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (!c.firstName.trim() || !c.lastName.trim()) {
        setError(`Please enter the first and last name for child ${i + 1}`);
        return;
      }
    }

    if (!guardianFirstName.trim() || !guardianLastName.trim()) {
      setError("Please enter the guardian's first and last name");
      return;
    }

    if (isMinor14to17 && waiverOptions.includeMinorSignature && !hasMinorSignature) {
      setError("Please provide the minor's signature (required for ages 14-17)");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // One signature image reused across every PDF — same handwriting
      // for the guardian copy + each kid's copy.
      const guardianCanvas = canvasRef.current;
      const signatureDataUrl =
        guardianCanvas && hasSignature
          ? guardianCanvas.toDataURL("image/png")
          : "";
      const minorCanvas = minorCanvasRef.current;
      const minorSignatureDataUrl =
        isMinor14to17 &&
        waiverOptions.includeMinorSignature &&
        hasMinorSignature &&
        minorCanvas
          ? minorCanvas.toDataURL("image/png")
          : "";

      const isGuardianFlavor =
        relationship === "Legal Guardian" || /guardian/i.test(relationship);
      const adultTitleForParent = isGuardianFlavor
        ? "Guardian Liability Waiver"
        : "Adult Liability Waiver";
      const dependentLabel = isGuardianFlavor ? "Dependent" : "Child";

      // One PDF per child. Each carries that child's info + guardian
      // info + that child's emergency contact. We attach the minor
      // signature only to the first child's PDF (the minor-signature
      // feature is tied to that entry).
      const childPayloads = children.map((c, idx) => {
        const cAge = calculateAge(c.dateOfBirth);
        const ecName = c.emergencyContactSameAsGuardian ? emergencyContactName : c.emergencyContactName;
        const ecPhone = c.emergencyContactSameAsGuardian ? emergencyContactPhone : c.emergencyContactPhone;
        const pdfBase64 = generateWaiverPdf({
          gym: gymSettings,
          logoImage: gymLogoImg,
          waiverTitle: isGuardianFlavor
            ? "Guardian and Dependent Liability Waiver"
            : "Parent and Child Liability Waiver",
          infoBlocks: [
            {
              title: `${dependentLabel} (Minor) Information`,
              rows: [
                { label: "Name", value: `${c.firstName} ${c.lastName}` },
                {
                  label: "Date of Birth",
                  value: c.dateOfBirth
                    ? `${new Date(c.dateOfBirth).toLocaleDateString()} (Age: ${cAge})`
                    : "",
                },
                { label: "Email", value: c.email },
              ],
            },
            {
              title: "Parent/Guardian Information",
              rows: [
                { label: "Name", value: `${guardianFirstName} ${guardianLastName}` },
                { label: "Date of Birth", value: guardianDateOfBirth ? new Date(guardianDateOfBirth).toLocaleDateString() : "" },
                { label: "Relationship", value: relationship },
                { label: "Email", value: email },
                { label: "Phone", value: phone },
                { label: "Address", value: address ? `${address}, ${city}, ${state} ${zipCode}` : "" },
              ],
            },
            {
              title: `${dependentLabel}'s Emergency Contact`,
              rows: [
                { label: "Name", value: ecName },
                { label: "Phone", value: ecPhone },
                { label: "Relationship", value: c.emergencyContactRelationship },
              ],
            },
          ],
          sections: waiverSections,
          replacePlaceholders: (t) =>
            replacePlaceholders(
              t,
              gymSettings,
              `${c.firstName} ${c.lastName}`,
              c.firstName,
              c.lastName,
              `${guardianFirstName} ${guardianLastName}`.trim(),
            ),
          signatures: [
            {
              title: `${isGuardianFlavor ? "Guardian" : "Parent"} Signature`,
              signaturePng: signatureDataUrl || undefined,
              name: `${guardianFirstName} ${guardianLastName} (${relationship})`,
              date: parseLocalDate(signatureDate).toLocaleDateString(),
            },
            ...(idx === 0 && minorSignatureDataUrl
              ? [
                  {
                    title: "Minor Signature (Ages 14-17)",
                    signaturePng: minorSignatureDataUrl,
                    name: `${c.firstName} ${c.lastName}`,
                    date: parseLocalDate(signatureDate).toLocaleDateString(),
                  },
                ]
              : []),
          ],
          electronicallySignedAt: new Date().toLocaleString(),
        });
        return {
          existingChildMemberId: c.existingChildMemberId || undefined,
          firstName: c.firstName.trim(),
          lastName: c.lastName.trim(),
          dateOfBirth: c.dateOfBirth || undefined,
          email: c.email || undefined,
          emergencyContactName: ecName || undefined,
          emergencyContactPhone: ecPhone || undefined,
          emergencyContactRelationship: c.emergencyContactRelationship || undefined,
          medicalNotes: c.medicalNotes || undefined,
          pdfBase64,
        };
      });

      // Parent's own PDF — looks like the standard adult waiver. No dependent
      // info, no "Parent/Guardian" block. The parent is the participant.
      const parentPdfBase64 = generateWaiverPdf({
        gym: gymSettings,
        logoImage: gymLogoImg,
        waiverTitle: adultTitleForParent,
        infoBlocks: [
          {
            title: "Participant Information",
            rows: [
              { label: "Name", value: `${guardianFirstName} ${guardianLastName}` },
              { label: "Date of Birth", value: guardianDateOfBirth ? new Date(guardianDateOfBirth).toLocaleDateString() : "" },
              { label: "Email", value: email },
              { label: "Phone", value: phone },
              { label: "Address", value: address ? `${address}, ${city}, ${state} ${zipCode}` : "" },
            ],
          },
          {
            title: "Emergency Contact",
            rows: [
              { label: "Name", value: emergencyContactName },
              { label: "Phone", value: emergencyContactPhone },
              { label: "Relationship", value: emergencyContactRelationship },
            ],
          },
        ],
        // Use the adult template's content if we found one; falls back to
        // the guardian template's sections so we still produce a PDF when
        // the tenant has no adult template configured.
        sections: parentWaiverSections && parentWaiverSections.length > 0 ? parentWaiverSections : waiverSections,
        replacePlaceholders: (t) =>
          replacePlaceholders(
            t,
            gymSettings,
            `${guardianFirstName} ${guardianLastName}`,
            guardianFirstName,
            guardianLastName,
            "",
          ),
        signatures: [
          {
            title: "Signature",
            signaturePng: signatureDataUrl || undefined,
            name: `${guardianFirstName} ${guardianLastName}`,
            date: parseLocalDate(signatureDate).toLocaleDateString(),
          },
        ],
        electronicallySignedAt: new Date().toLocaleString(),
      });

      // One submit covers every child + the parent. Server iterates
      // children[] and creates/attaches per kid.
      const res = await fetch("/api/public/waiver-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "guardian",
          children: childPayloads,
          guardianFirstName: guardianFirstName.trim(),
          guardianLastName: guardianLastName.trim(),
          guardianDateOfBirth: guardianDateOfBirth || undefined,
          relationship: relationship || undefined,
          email: email || undefined,
          phone: phone || undefined,
          address: address || undefined,
          city: city || undefined,
          state: state || undefined,
          zipCode: zipCode || undefined,
          emergencyContactName: emergencyContactName || undefined,
          emergencyContactPhone: emergencyContactPhone || undefined,
          emergencyContactRelationship: emergencyContactRelationship || undefined,
          parentPdfBase64,
          signatureData: signatureDataUrl || undefined,
          templateSlug: templateSlug || undefined,
          templateId: templateId || undefined,
          existingParentMemberId: parentMemberId || undefined,
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const text = await res.text().catch(() => "");
        console.error("waiver submit failed", res.status, text);
        setError(`Failed to submit waiver (${res.status}): ${text.slice(0, 200) || "no response body"}`);
      }
    } catch (err) {
      console.error("waiver submit threw", err);
      setError(`Failed to submit waiver: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setChildren([newChildEntry()]);
    setGuardianFirstName("");
    setGuardianLastName("");
    setGuardianDateOfBirth("");
    setRelationship("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCity("");
    setState("");
    setZipCode("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setEmergencyContactRelationship("");
    setAgreedToTerms(false);
    setAgreedToGuardian(false);
    setSignatureDate(getTodayString());
    clearSignature();
    clearMinorSignature();
    setSuccess(false);
    setError("");
    // Delay scroll to allow form to re-render first
    setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.scrollTo({ top: 0, behavior: "instant" });
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 50);
  }

  // Auto-reset after 3 seconds on success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        resetForm();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-40 bg-primary shadow-sm">
          <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
            <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
            <div className="flex flex-col leading-none brand-dynamic">
              <span className="text-sm font-black tracking-wider uppercase text-white">
                Dojo <span className="italic">Storm</span>
              </span>
              <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/80">
                Software
              </span>
            </div>
          </div>
        </header>
        <div className="h-full bg-gray-100 flex items-center justify-center">
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="sticky top-0 z-40 bg-primary shadow-sm">
          <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
            <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
            <div className="flex flex-col leading-none brand-dynamic">
              <span className="text-sm font-black tracking-wider uppercase text-white">
                Dojo <span className="italic">Storm</span>
              </span>
              <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/80">
                Software
              </span>
            </div>
          </div>
        </header>
        <div className="h-full bg-gray-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-md p-8 text-center max-w-md">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Waiver Signed!</h2>
            <p className="text-gray-600 mb-4">
              Thank you for completing the liability waiver. Your dependent is all set to participate.
            </p>
            <p className="text-sm text-gray-500">
              Signed on {new Date().toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-primary shadow-sm">
        <div className="flex items-center justify-center gap-2.5 px-4 py-2.5">
          <img src="/logo.png" alt="Dojo Storm" className="h-7 w-7 object-contain drop-shadow-md" />
          <div className="flex flex-col leading-none brand-dynamic">
            <span className="text-sm font-black tracking-wider uppercase text-white">
              Dojo <span className="italic">Storm</span>
            </span>
            <span className="text-[8px] uppercase tracking-[0.25em] font-semibold text-white/80">
              Software
            </span>
          </div>
        </div>
      </header>
      <div ref={containerRef} className="bg-gray-100 py-4 sm:py-8 px-2 sm:px-4 overflow-y-auto">
        <div className="max-w-3xl mx-auto pb-8">

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {/* Header */}
          <div className="bg-primary text-white p-4 sm:p-6 text-center">
            <h1 className="text-xl sm:text-2xl font-bold">Guardian and Dependent Waiver</h1>
            <p className="text-xs sm:text-sm opacity-90 mt-1">Liability Waiver & Release Form for Minor Participants</p>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Parent/Guardian Information */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Parent/Legal Guardian Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    First Name *
                  </label>
                  <input
                    type="text"
                    value={guardianFirstName}
                    onChange={(e) => setGuardianFirstName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    value={guardianLastName}
                    onChange={(e) => setGuardianLastName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date of Birth *
                  </label>
                  <DateOfBirthPicker
                    value={guardianDateOfBirth}
                    onChange={setGuardianDateOfBirth}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship to Minor *
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select relationship</option>
                    <option value="Parent">Parent</option>
                    <option value="Legal Guardian">Legal Guardian</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    placeholder="(123) 456-7890"
                    maxLength={14}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address *
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(autoCapitalize(e.target.value))}
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code *
                    </label>
                    <input
                      type="text"
                      value={zipCode}
                      onChange={(e) => setZipCode(e.target.value)}
                      required
                      className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Emergency Contact (guardian's). The per-child blocks below
                each have their own emergency contact with a "same as
                guardian's" toggle. */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Emergency Contact
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name *
                  </label>
                  <input
                    type="text"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(autoCapitalize(e.target.value))}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Phone *
                  </label>
                  <input
                    type="tel"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(formatPhoneNumber(e.target.value))}
                    placeholder="(123) 456-7890"
                    maxLength={14}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Relationship to Guardian *
                  </label>
                  <input
                    type="text"
                    value={emergencyContactRelationship}
                    onChange={(e) => setEmergencyContactRelationship(autoCapitalize(e.target.value))}
                    placeholder="e.g., Sister, Spouse"
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Per-child blocks. Each child gets its own dependent info +
                existing-child picker + dependent emergency contact +
                medical notes. Up to MAX_CHILDREN; the "Add Child" button
                below the last block adds another. */}
            {children.map((c, idx) => {
              const cAge = calculateAge(c.dateOfBirth);
              const cIsMinor14to17 = cAge >= 14 && cAge <= 17;
              return (
                <section key={idx} className="rounded-lg border border-gray-200 p-3 sm:p-4 bg-gray-50/40">
                  <div className="flex items-center justify-between mb-3 sm:mb-4 pb-2 border-b border-gray-200">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900">
                      Child {idx + 1}
                    </h2>
                    {children.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeChild(idx)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Existing-child picker (admin "Add Child" flow only).
                      Picking a linked kid auto-fills this entire block. */}
                  {parentMemberId && linkedChildren.length > 0 && (
                    <div className="mb-3 sm:mb-4 rounded-md border border-gray-200 bg-white p-3">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Add a new child, or use an existing one
                      </label>
                      <select
                        value={c.existingChildMemberId}
                        onChange={(e) => applyExistingChild(idx, e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="">+ Add a new child</option>
                        {linkedChildren.map((lc) => (
                          <option key={lc.id} value={lc.id}>
                            {lc.firstName} {lc.lastName}
                          </option>
                        ))}
                      </select>
                      {c.existingChildMemberId && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Auto-filled from an existing record. Edit anything that&apos;s changed before signing.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                      <input
                        type="text"
                        value={c.firstName}
                        onChange={(e) => updateChild(idx, { firstName: autoCapitalize(e.target.value) })}
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                      <input
                        type="text"
                        value={c.lastName}
                        onChange={(e) => updateChild(idx, { lastName: autoCapitalize(e.target.value) })}
                        required
                        className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth *</label>
                      <DateOfBirthPicker
                        value={c.dateOfBirth}
                        onChange={(v) => updateChild(idx, { dateOfBirth: v })}
                        required
                      />
                      {cAge > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Age: {cAge} years old
                          {idx === 0 && cIsMinor14to17 && waiverOptions.includeMinorSignature && (
                            <span className="ml-2 text-primary font-medium">(Minor signature required)</span>
                          )}
                        </p>
                      )}
                    </div>
                    {cIsMinor14to17 && waiverOptions.includeMinorEmail && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dependent&apos;s Email</label>
                        <input
                          type="email"
                          value={c.email}
                          onChange={(e) => updateChild(idx, { email: e.target.value })}
                          placeholder="minor@email.com"
                          className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                    )}
                  </div>

                  {/* Per-child emergency contact + relationship */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-800 mb-2">Emergency Contact for this Child</h3>
                    <label className="flex items-center gap-2 mb-2 cursor-pointer text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={c.emergencyContactSameAsGuardian}
                        onChange={(e) => updateChild(idx, { emergencyContactSameAsGuardian: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                      />
                      Same person as guardian&apos;s emergency contact
                    </label>
                    {!c.emergencyContactSameAsGuardian && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                          <input
                            type="text"
                            value={c.emergencyContactName}
                            onChange={(e) => updateChild(idx, { emergencyContactName: autoCapitalize(e.target.value) })}
                            required={!c.emergencyContactSameAsGuardian}
                            className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone *</label>
                          <input
                            type="tel"
                            value={c.emergencyContactPhone}
                            onChange={(e) => updateChild(idx, { emergencyContactPhone: formatPhoneNumber(e.target.value) })}
                            placeholder="(123) 456-7890"
                            maxLength={14}
                            required={!c.emergencyContactSameAsGuardian}
                            className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Relationship to Dependent *</label>
                      <input
                        type="text"
                        value={c.emergencyContactRelationship}
                        onChange={(e) => updateChild(idx, { emergencyContactRelationship: autoCapitalize(e.target.value) })}
                        placeholder="e.g., Aunt, Uncle, Grandparent"
                        required
                        className="w-full sm:max-w-xs rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Per-child medical notes */}
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Medical Notes / Health Conditions</label>
                    <textarea
                      value={c.medicalNotes}
                      onChange={(e) => updateChild(idx, { medicalNotes: e.target.value })}
                      rows={2}
                      placeholder="Conditions, allergies, injuries, medications…"
                      className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </section>
              );
            })}

            {/* Add Child button — disabled at MAX_CHILDREN. */}
            {children.length < MAX_CHILDREN && (
              <button
                type="button"
                onClick={addChild}
                className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primaryDark transition-colors"
              >
                Add Additional Child
              </button>
            )}

            {/* Waiver Terms */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Waiver & Release of Liability
              </h2>
              <div
                ref={waiverScrollRef}
                onScroll={handleWaiverScroll}
                className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 max-h-96 sm:max-h-[32rem] overflow-y-auto text-xs sm:text-sm text-gray-700 space-y-2 sm:space-y-3"
              >
                {(() => {
                  // Preview uses the first child's name (multi-child sign
                  // sessions generate the same text, just with per-child
                  // names on each PDF).
                  const previewChild = children[0] || newChildEntry();
                  const previewFull = previewChild.firstName && previewChild.lastName
                    ? `${previewChild.firstName} ${previewChild.lastName}`
                    : "my minor child";
                  const previewGuardianFull = `${guardianFirstName || ""} ${guardianLastName || ""}`.trim();
                  return waiverSections.map((section) => (
                    <p key={section.id}>
                      {section.title && <strong>{replacePlaceholders(
                        section.title,
                        gymSettings,
                        previewFull,
                        previewChild.firstName,
                        previewChild.lastName,
                        previewGuardianFull,
                      )}:</strong>} {replacePlaceholders(
                        section.content,
                        gymSettings,
                        previewFull,
                        previewChild.firstName,
                        previewChild.lastName,
                        previewGuardianFull,
                      )}
                    </p>
                  ));
                })()}
              </div>
              {!hasScrolledWaiver && (
                <p className="text-xs text-gray-400 mt-1 text-center">Scroll to the bottom to continue</p>
              )}
            </section>

            {/* Agreement Checkboxes */}
            <div className="space-y-3">
              <div className={`flex items-start gap-3 rounded-lg p-3 sm:p-4 transition-opacity ${hasScrolledWaiver ? "bg-red-50 border border-red-200" : "bg-gray-100 border border-gray-200 opacity-50"}`}>
                <input
                  type="checkbox"
                  id="agreeGuardian"
                  checked={agreedToGuardian}
                  onChange={(e) => setAgreedToGuardian(e.target.checked)}
                  disabled={!hasScrolledWaiver}
                  className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                />
                <label htmlFor="agreeGuardian" className={`text-xs sm:text-sm ${hasScrolledWaiver ? "text-gray-700" : "text-gray-400"}`}>
                  I am the parent or legal guardian of the minor named above and have the legal authority to sign this waiver on their behalf.
                </label>
              </div>

              <div className={`flex items-start gap-3 rounded-lg p-3 sm:p-4 transition-opacity ${hasScrolledWaiver ? "bg-red-50 border border-red-200" : "bg-gray-100 border border-gray-200 opacity-50"}`}>
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  disabled={!hasScrolledWaiver}
                  className="mt-0.5 h-5 w-5 sm:h-4 sm:w-4 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                />
                <label htmlFor="agreeTerms" className={`text-xs sm:text-sm ${hasScrolledWaiver ? "text-gray-700" : "text-gray-400"}`}>
                  I have read and agree to the terms and conditions stated above. I understand that this is a legally binding agreement and that I am giving up certain legal rights by signing this waiver.
                </label>
              </div>
            </div>

            {/* Signature Section */}
            <section>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                Parent/Guardian Signature
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sign in the box below using your finger or stylus:
                  </label>
                  <div className="border-2 border-primary rounded-xl overflow-hidden bg-white shadow-inner relative">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full cursor-crosshair touch-none"
                      style={{ height: "150px", minHeight: "150px" }}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    {!hasSignature && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-gray-300 text-lg sm:text-xl font-handwriting select-none">Sign Here</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-500">Use your finger or stylus to sign</span>
                    <button
                      type="button"
                      onClick={clearSignature}
                      className="text-sm text-primary hover:text-primaryDark font-medium flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={signatureDate}
                    onChange={(e) => setSignatureDate(e.target.value)}
                    required
                    className="w-full rounded-md border border-gray-300 px-3 py-3 sm:py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </section>

            {/* Minor Signature Section (14-17 years old) */}
            {isMinor14to17 && waiverOptions.includeMinorSignature && (
              <section>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4 border-b pb-2">
                  Minor&apos;s Signature (Ages 14-17)
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Since the minor is between 14-17 years old, they must also sign this waiver.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sign in the box below using your finger or stylus:
                    </label>
                    <div className="border-2 border-primary rounded-xl overflow-hidden bg-white shadow-inner relative">
                      <canvas
                        ref={minorCanvasRef}
                        width={600}
                        height={200}
                        className="w-full cursor-crosshair touch-none"
                        style={{ height: "150px", minHeight: "150px" }}
                        onMouseDown={startMinorDrawing}
                        onMouseMove={drawMinor}
                        onMouseUp={stopMinorDrawing}
                        onMouseLeave={stopMinorDrawing}
                        onTouchStart={startMinorDrawing}
                        onTouchMove={drawMinor}
                        onTouchEnd={stopMinorDrawing}
                      />
                      {!hasMinorSignature && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-gray-300 text-lg sm:text-xl font-handwriting select-none">Sign Here</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-gray-500">Use your finger or stylus to sign</span>
                      <button
                        type="button"
                        onClick={clearMinorSignature}
                        className="text-sm text-primary hover:text-primaryDark font-medium flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Clear
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Submit Button */}
            <div className="pt-4 sm:pt-6 border-t">
              <button
                type="submit"
                disabled={submitting || !agreedToTerms || !agreedToGuardian}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primaryDark active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {submitting ? "Submitting..." : "Sign Waiver"}
              </button>
              <p className="text-center text-xs text-gray-500 mt-3 sm:hidden">
                Tap the button above to submit your waiver
              </p>
            </div>
          </form>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          This form is securely processed. Your information is kept confidential.
        </p>
      </div>
    </div>
    </div>
  );
}
