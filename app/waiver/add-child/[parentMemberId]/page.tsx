"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";

type Parent = { id: string; firstName: string; lastName: string };

type WaiverSection = { id: string; title: string; content: string };

type GymSettings = { name: string; address: string; phone: string; email: string };

const DEFAULT_GYM_SETTINGS: GymSettings = {
  name: "Our Martial Arts School",
  address: "",
  phone: "",
  email: "",
};

const DEFAULT_WAIVER_SECTIONS: WaiverSection[] = [
  {
    id: "assumption_of_risk",
    title: "ASSUMPTION OF RISK",
    content:
      "I understand that martial arts training involves physical contact and strenuous physical activity. I acknowledge the inherent risks of injury and accept those risks on behalf of my minor child.",
  },
  {
    id: "waiver_release",
    title: "WAIVER AND RELEASE",
    content:
      "In consideration of my child being permitted to participate, I waive and release the school, its owners, instructors, and agents from any and all liability arising from injuries that may be sustained.",
  },
  {
    id: "medical_authorization",
    title: "MEDICAL AUTHORIZATION",
    content:
      "I authorize staff to obtain emergency medical treatment for my minor child if necessary, and accept responsibility for any related expenses.",
  },
  {
    id: "photo_video_release",
    title: "PHOTO/VIDEO RELEASE",
    content:
      "I grant permission for photographs and videos of my child to be used for promotional purposes.",
  },
];

function replacePlaceholders(text: string, gym: GymSettings, parentName: string, childName: string): string {
  return text
    .replace(/\{\{MEMBER_NAME\}\}/g, childName)
    .replace(/\{\{PARENT_GUARDIAN\}\}/g, parentName)
    .replace(/\{\{GYM_NAME\}\}/g, gym.name || "[Gym Name]")
    .replace(/\{\{GYM_ADDRESS\}\}/g, gym.address || "")
    .replace(/\{\{GYM_PHONE\}\}/g, gym.phone || "")
    .replace(/\{\{GYM_EMAIL\}\}/g, gym.email || "")
    .replace(/\{\{DATE\}\}/g, new Date().toLocaleDateString());
}

export default function AddChildWaiverPage() {
  const params = useParams();
  const parentMemberId = params.parentMemberId as string;

  const [parent, setParent] = useState<Parent | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [childFirstName, setChildFirstName] = useState("");
  const [childLastName, setChildLastName] = useState("");
  const [childDateOfBirth, setChildDateOfBirth] = useState("");
  const [childMedicalNotes, setChildMedicalNotes] = useState("");
  const [relationship, setRelationship] = useState("Parent of");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [signatureName, setSignatureName] = useState("");

  const [waiverSections, setWaiverSections] = useState<WaiverSection[]>(DEFAULT_WAIVER_SECTIONS);
  const [gymSettings, setGymSettings] = useState<GymSettings>(DEFAULT_GYM_SETTINGS);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/public/parent-info?memberId=${parentMemberId}`);
        if (res.ok) {
          const data = await res.json();
          setParent(data.parent);
        } else {
          setError("This link is invalid or has expired.");
        }

        const wd = await fetch("/api/public/waiver-data");
        if (wd.ok) {
          const data = await wd.json();
          if (data.waiverContent) {
            try { setWaiverSections(JSON.parse(data.waiverContent)); } catch { /* ignore */ }
          }
          if (data.gymSettings) {
            try { setGymSettings(JSON.parse(data.gymSettings)); } catch { /* ignore */ }
          }
        }
      } catch {
        setError("Could not load waiver. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [parentMemberId]);

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const x = "touches" in e ? (e.touches[0].clientX - rect.left) * sx : (e.clientX - rect.left) * sx;
    const y = "touches" in e ? (e.touches[0].clientY - rect.top) * sy : (e.clientY - rect.top) * sy;
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
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    let x: number, y: number;
    if ("touches" in e) {
      e.preventDefault();
      x = (e.touches[0].clientX - rect.left) * sx;
      y = (e.touches[0].clientY - rect.top) * sy;
    } else {
      x = (e.clientX - rect.left) * sx;
      y = (e.clientY - rect.top) * sy;
    }
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!parent) {
      setError("Parent info not loaded.");
      return;
    }
    if (!childFirstName.trim() || !childLastName.trim()) {
      setError("Please enter the child's first and last name.");
      return;
    }
    if (!agreedToTerms) {
      setError("Please agree to the terms.");
      return;
    }
    if (!hasSignature && !signatureName.trim()) {
      setError("Please provide a signature.");
      return;
    }

    setSubmitting(true);
    try {
      const parentName = `${parent.firstName} ${parent.lastName}`.trim();
      const childName = `${childFirstName} ${childLastName}`.trim();
      const waiverContent = waiverSections
        .map((s) => {
          const title = s.title ? `${s.title}\n` : "";
          return `${title}${replacePlaceholders(s.content, gymSettings, parentName, childName)}`;
        })
        .join("\n\n");

      let signatureDataUrl = "";
      const canvas = canvasRef.current;
      if (hasSignature && canvas) {
        signatureDataUrl = canvas.toDataURL("image/png");
      } else if (signatureName.trim()) {
        const c = document.createElement("canvas");
        c.width = 400;
        c.height = 100;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.fillStyle = "#000";
          ctx.font = "italic 36px 'Times New Roman', serif";
          ctx.textBaseline = "middle";
          ctx.fillText(signatureName.trim(), 10, c.height / 2);
        }
        signatureDataUrl = c.toDataURL("image/png");
      }

      const res = await fetch("/api/waivers/add-child", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentMemberId,
          childFirstName: childFirstName.trim(),
          childLastName: childLastName.trim(),
          childDateOfBirth: childDateOfBirth || undefined,
          childMedicalNotes: childMedicalNotes || undefined,
          relationship,
          signatureData: signatureDataUrl,
          waiverContent,
          templateName: "Liability Waiver (Guardian)",
        }),
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to add child.");
      }
    } catch {
      setError("Failed to add child. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><p className="text-gray-500">Loading…</p></div>;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">Child added</h1>
          <p className="text-gray-600">{childFirstName} {childLastName} has been added to your account, and your waiver has been updated.</p>
        </div>
      </div>
    );
  }

  if (!parent) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md text-center">
          <p className="text-red-600">{error || "Invalid link."}</p>
        </div>
      </div>
    );
  }

  const parentName = `${parent.firstName} ${parent.lastName}`.trim();
  const childName = `${childFirstName} ${childLastName}`.trim() || "[Child Name]";

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-6">
        <h1 className="text-2xl font-bold text-gray-900">Add a Child</h1>
        <p className="text-sm text-gray-600 mt-1">
          Parent/Guardian: <span className="font-medium">{parentName}</span>
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Child First Name *</label>
              <input
                type="text"
                value={childFirstName}
                onChange={(e) => setChildFirstName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Child Last Name *</label>
              <input
                type="text"
                value={childLastName}
                onChange={(e) => setChildLastName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date of Birth</label>
              <input
                type="date"
                value={childDateOfBirth}
                onChange={(e) => setChildDateOfBirth(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Relationship</label>
              <select
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="Parent of">Parent of</option>
                <option value="Guardian of">Guardian of</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Medical Notes (optional)</label>
            <textarea
              value={childMedicalNotes}
              onChange={(e) => setChildMedicalNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          <div className="border border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto text-sm text-gray-700 space-y-3">
            {waiverSections.map((s) => (
              <div key={s.id}>
                {s.title && <p className="font-semibold text-gray-900 text-sm">{s.title}</p>}
                <p className="whitespace-pre-wrap">{replacePlaceholders(s.content, gymSettings, parentName, childName)}</p>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5"
            />
            <span>I have read and agree to the waiver on behalf of my minor child.</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Signature</label>
            <canvas
              ref={canvasRef}
              width={500}
              height={140}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={() => setIsDrawing(false)}
              onMouseLeave={() => setIsDrawing(false)}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={() => setIsDrawing(false)}
              className="w-full h-32 border border-gray-300 rounded-lg bg-white touch-none"
            />
            <div className="flex items-center justify-between mt-1">
              <button type="button" onClick={clearSignature} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
              <span className="text-xs text-gray-400">Or type your name below</span>
            </div>
            <input
              type="text"
              value={signatureName}
              onChange={(e) => setSignatureName(e.target.value)}
              placeholder="Type your full name"
              className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Add Child & Submit Waiver"}
          </button>
        </form>
      </div>
    </div>
  );
}
