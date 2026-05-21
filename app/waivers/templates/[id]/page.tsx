"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/app-layout";

type Audience = "adult" | "guardian";

type WaiverSection = {
  id: string;
  title: string;
  content: string;
};

type WaiverOptions = {
  includeMinorSignature: boolean;
  includeMinorEmail: boolean;
};

type Template = {
  id: string;
  name: string;
  slug: string | null;
  audience: Audience;
  isDefault: boolean;
  isActive: boolean;
  archivedAt: string | null;
  content: string;
  options: string | null;
};

const PLACEHOLDERS = [
  { key: "{{MEMBER_NAME}}", label: "Member full name" },
  { key: "{{MEMBER_FIRST_NAME}}", label: "Member first name" },
  { key: "{{MEMBER_LAST_NAME}}", label: "Member last name" },
  { key: "{{PARENT_GUARDIAN}}", label: "Parent / guardian name" },
  { key: "{{GYM_NAME}}", label: "Gym name" },
  { key: "{{GYM_ADDRESS}}", label: "Gym address" },
  { key: "{{GYM_PHONE}}", label: "Gym phone" },
  { key: "{{GYM_EMAIL}}", label: "Gym email" },
  { key: "{{DATE}}", label: "Today's date" },
];

export default function WaiverTemplateEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [audience, setAudience] = useState<Audience>("adult");
  const [sections, setSections] = useState<WaiverSection[]>([]);
  const [options, setOptions] = useState<WaiverOptions>({
    includeMinorSignature: true,
    includeMinorEmail: true,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/waiver-templates/${id}`);
        if (!res.ok) {
          setError("Template not found");
          setLoading(false);
          return;
        }
        const data = await res.json();
        const t: Template = data.template;
        setTemplate(t);
        setName(t.name);
        setSlug(t.slug || "");
        setAudience(t.audience);
        try {
          setSections(JSON.parse(t.content || "[]"));
        } catch {
          setSections([]);
        }
        if (t.options) {
          try {
            const parsed = JSON.parse(t.options);
            setOptions({
              includeMinorSignature: parsed.includeMinorSignature ?? true,
              includeMinorEmail: parsed.includeMinorEmail ?? true,
            });
          } catch { /* defaults */ }
        }
      } catch (err) {
        setError("Failed to load template");
      } finally {
        setLoading(false);
      }
    }
    if (id) load();
  }, [id]);

  function updateSection(index: number, field: "title" | "content", value: string) {
    setSections((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  function addSection() {
    setSections((prev) => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        title: "NEW SECTION",
        content: "Enter content here…",
      },
    ]);
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  function moveSection(index: number, delta: number) {
    setSections((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const updated = [...prev];
      const [item] = updated.splice(index, 1);
      updated.splice(target, 0, item);
      return updated;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/waiver-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          audience,
          content: JSON.stringify(sections),
          options: JSON.stringify(options),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const t: Template = data.template;
        setTemplate(t);
        setSlug(t.slug || "");
        setSavedAt(new Date().toLocaleTimeString());
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to save");
      }
    } catch (err) {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="px-4 py-6 max-w-4xl mx-auto text-sm text-gray-500">Loading…</div>
      </AppLayout>
    );
  }

  if (!template) {
    return (
      <AppLayout>
        <div className="px-4 py-6 max-w-4xl mx-auto">
          <div className="text-sm text-red-700">Template not found.</div>
          <Link href="/waivers/templates" className="text-sm text-primary hover:underline">
            Back to templates
          </Link>
        </div>
      </AppLayout>
    );
  }

  const shareUrl = template.slug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/waivers/sign/${template.slug}`
    : "";

  return (
    <AppLayout>
      <div className="px-4 py-6 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <Link href="/waivers/templates" className="text-xs text-primary hover:underline">
              ← Back to templates
            </Link>
            <h1 className="text-2xl font-bold mt-1">Edit Waiver Template</h1>
          </div>
          <div className="flex items-center gap-2">
            {savedAt && <span className="text-xs text-gray-500">Saved at {savedAt}</span>}
            <button
              onClick={save}
              disabled={saving || !name.trim() || sections.length === 0}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Template Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Audience</label>
              <select
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                disabled={template.isDefault}
                title={template.isDefault ? "Default templates have fixed audiences" : undefined}
              >
                <option value="adult">Adult (single participant)</option>
                <option value="guardian">Guardian / Dependent (parent + minor)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Share URL (slug)</label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 font-mono">/waivers/sign/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="default-adult"
                className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-mono"
              />
            </div>
            {shareUrl && (
              <div className="mt-1 text-xs text-gray-500">
                Current: <span className="font-mono">{shareUrl}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h2 className="text-sm font-bold text-gray-800">Options</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.includeMinorSignature}
              onChange={(e) => setOptions((o) => ({ ...o, includeMinorSignature: e.target.checked }))}
            />
            <span>Collect a separate signature from minors aged 14–17 (guardian audience only)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.includeMinorEmail}
              onChange={(e) => setOptions((o) => ({ ...o, includeMinorEmail: e.target.checked }))}
            />
            <span>Allow the minor to enter their own email (guardian audience only)</span>
          </label>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Content Sections</h2>
            <button
              onClick={addSection}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              + Add Section
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Placeholders auto-filled at sign time:{" "}
            {PLACEHOLDERS.map((p, i) => (
              <span key={p.key}>
                <span className="font-mono bg-yellow-100 text-yellow-800 px-1 rounded">{p.key}</span>
                {i < PLACEHOLDERS.length - 1 && " "}
              </span>
            ))}
          </div>

          {sections.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 rounded p-4 text-xs text-center text-gray-500">
              No sections yet. Click <span className="font-semibold">Add Section</span> to add one.
            </div>
          ) : (
            sections.map((section, index) => (
              <div key={section.id} className="border border-gray-200 rounded-md p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={section.title}
                    onChange={(e) => updateSection(index, "title", e.target.value)}
                    placeholder="Section title (leave blank for an unlabeled paragraph)"
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm font-semibold"
                  />
                  <button
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sections.length - 1}
                    className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30"
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeSection(index)}
                    className="text-xs text-red-600 hover:text-red-800"
                    title="Remove section"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  value={section.content}
                  onChange={(e) => updateSection(index, "content", e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
