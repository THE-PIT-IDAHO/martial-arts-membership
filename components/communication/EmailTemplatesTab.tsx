"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { TEMPLATE_CATEGORIES } from "@/lib/email-template-defaults";

interface EmailTemplate {
  id: string;
  eventKey: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string;
  isCustom: boolean;
  enabled: boolean;
}

export default function EmailTemplatesTab() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/email-templates")
      .then((r) => r.json())
      .then((data) => {
        setTemplates(data);
        setLoading(false);
      });
  }, []);

  const selectedTemplate = templates.find((t) => t.eventKey === selectedKey);

  // Sync visual editor content back to state
  const syncFromVisual = useCallback(() => {
    if (visualRef.current) {
      setEditBody(visualRef.current.innerHTML);
    }
  }, []);

  function openEditor(tpl: EmailTemplate) {
    setSelectedKey(tpl.eventKey);
    setEditSubject(tpl.subject);
    setEditBody(tpl.bodyHtml);
    setPreviewHtml("");
    setShowPreview(false);
    setTestResult(null);
    setSaveResult(null);
    setSourceMode(false);
  }

  function backToList() {
    if (!sourceMode && visualRef.current) {
      // Don't need to sync since we're leaving
    }
    setSelectedKey(null);
    setPreviewHtml("");
    setShowPreview(false);
    setTestResult(null);
    setSaveResult(null);
    setSourceMode(false);
  }

  function toggleSourceMode() {
    if (!sourceMode) {
      // Switching TO source: grab current visual HTML
      if (visualRef.current) {
        setEditBody(visualRef.current.innerHTML);
      }
    }
    setSourceMode(!sourceMode);
  }

  // When switching back to visual mode, we need to set innerHTML after render
  useEffect(() => {
    if (!sourceMode && visualRef.current && selectedKey) {
      visualRef.current.innerHTML = editBody;
    }
  }, [sourceMode, selectedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    if (!selectedKey) return;
    // Sync from visual if needed
    let body = editBody;
    if (!sourceMode && visualRef.current) {
      body = visualRef.current.innerHTML;
      setEditBody(body);
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch("/api/email-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: selectedKey, subject: editSubject, bodyHtml: body }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates((prev) => prev.map((t) => (t.eventKey === selectedKey ? updated : t)));
        setSaveResult({ ok: true, msg: "Template saved!" });
      } else {
        setSaveResult({ ok: false, msg: "Failed to save." });
      }
    } catch {
      setSaveResult({ ok: false, msg: "Error saving template." });
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (!selectedKey) return;
    let body = editBody;
    if (!sourceMode && visualRef.current) {
      body = visualRef.current.innerHTML;
    }
    try {
      const res = await fetch("/api/email-templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: selectedKey, subject: editSubject, bodyHtml: body }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewHtml(data.html);
        setShowPreview(true);
      }
    } catch {
      // silent
    }
  }

  async function handleSendTest() {
    if (!selectedKey || !testEmail.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/email-templates/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: selectedKey, toEmail: testEmail.trim() }),
      });
      if (res.ok) {
        setTestResult({ ok: true, msg: "Test email sent!" });
      } else {
        const data = await res.json();
        setTestResult({ ok: false, msg: data.error || "Failed to send." });
      }
    } catch {
      setTestResult({ ok: false, msg: "Error sending test email." });
    } finally {
      setSendingTest(false);
    }
  }

  async function handleReset() {
    if (!selectedKey) return;
    if (!confirm("Reset this template to default? Your customizations will be lost.")) return;
    try {
      const res = await fetch(`/api/email-templates/${selectedKey}/reset`, { method: "POST" });
      if (res.ok) {
        const updated = await res.json();
        setTemplates((prev) => prev.map((t) => (t.eventKey === selectedKey ? updated : t)));
        setEditSubject(updated.subject);
        setEditBody(updated.bodyHtml);
        if (visualRef.current) {
          visualRef.current.innerHTML = updated.bodyHtml;
        }
        setSaveResult({ ok: true, msg: "Reset to default." });
      }
    } catch {
      setSaveResult({ ok: false, msg: "Error resetting template." });
    }
  }

  function insertVariable(varName: string) {
    const text = `{{${varName}}}`;

    if (sourceMode) {
      // Insert into textarea
      const textarea = bodyRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newValue = editBody.substring(0, start) + text + editBody.substring(end);
      setEditBody(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      }, 0);
    } else {
      // Insert into contentEditable at cursor
      const el = visualRef.current;
      if (!el) return;
      el.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        // Only insert if cursor is inside our editor
        if (el.contains(range.commonAncestorContainer)) {
          range.deleteContents();
          const textNode = document.createTextNode(text);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          // Cursor not in editor, append at end
          el.innerHTML += text;
        }
      } else {
        el.innerHTML += text;
      }
    }
  }

  async function toggleEnabled(eventKey: string, enabled: boolean) {
    try {
      const res = await fetch("/api/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey, enabled }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTemplates((prev) => prev.map((t) => (t.eventKey === eventKey ? updated : t)));
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading templates...</p>
        </div>
      </div>
    );
  }

  // --- Editor View ---
  if (selectedKey && selectedTemplate) {
    const variables: string[] = JSON.parse(selectedTemplate.variables || "[]");

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={backToList}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{selectedTemplate.name}</h2>
            <p className="text-xs text-gray-500">Event key: {selectedKey}</p>
          </div>
          {selectedTemplate.isCustom && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Customized
            </span>
          )}
        </div>

        {/* Available Variables */}
        {variables.length > 0 && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-600 mb-2">Available Variables (click to insert in body)</p>
            <div className="flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVariable(v)}
                  className="text-xs font-mono bg-white border border-gray-300 rounded px-2 py-1 hover:bg-primary hover:text-white hover:border-primary transition-colors"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
          <input
            type="text"
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>

        {/* Body Editor */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Body</label>
            <button
              onClick={toggleSourceMode}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
            >
              {sourceMode ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.64 0 8.577 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.64 0-8.577-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Visual
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                  </svg>
                  Source
                </>
              )}
            </button>
          </div>

          {sourceMode ? (
            <textarea
              ref={bodyRef}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              rows={14}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-primary focus:border-primary outline-none resize-y"
            />
          ) : (
            <div
              ref={visualRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={syncFromVisual}
              dangerouslySetInnerHTML={{ __html: editBody }}
              className="w-full min-h-[280px] px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none overflow-y-auto bg-white prose prose-sm max-w-none"
              style={{ maxHeight: "500px" }}
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-primary text-white text-xs font-semibold rounded-md hover:bg-primaryDark disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handlePreview}
            className="px-3 py-1 bg-white border border-gray-300 text-xs font-semibold rounded-md hover:bg-gray-50 transition-colors"
          >
            Preview
          </button>
          {selectedTemplate.isCustom && (
            <button
              onClick={handleReset}
              className="px-3 py-1 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-md hover:bg-gray-100 transition-colors"
            >
              Reset to Default
            </button>
          )}
        </div>

        {saveResult && (
          <p className={`text-sm font-medium ${saveResult.ok ? "text-green-600" : "text-red-600"}`}>
            {saveResult.msg}
          </p>
        )}

        {/* Send Test Email */}
        <div className="border-t border-gray-200 pt-4 mt-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Send Test Email</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
            />
            <button
              onClick={handleSendTest}
              disabled={sendingTest || !testEmail.trim()}
              className="px-3 py-1 bg-gray-800 text-white text-xs font-semibold rounded-md hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {sendingTest ? "Sending..." : "Send Test"}
            </button>
          </div>
          {testResult && (
            <p className={`text-sm mt-1 font-medium ${testResult.ok ? "text-green-600" : "text-red-600"}`}>
              {testResult.msg}
            </p>
          )}
        </div>

        {/* Preview Panel */}
        {showPreview && previewHtml && (
          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Email Preview</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-100">
              <iframe
                srcDoc={previewHtml}
                title="Email Preview"
                className="w-full bg-white"
                style={{ height: "500px", border: "none" }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- List View ---
  return (
    <div className="space-y-6">
      {TEMPLATE_CATEGORIES.map((category) => {
        const catTemplates = category.keys
          .map((key) => templates.find((t) => t.eventKey === key))
          .filter(Boolean) as EmailTemplate[];
        if (catTemplates.length === 0) return null;

        return (
          <div key={category.label}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {category.label}
            </h3>
            <div className="space-y-1">
              {catTemplates.map((tpl) => (
                <div
                  key={tpl.eventKey}
                  className={`flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-lg hover:border-primary/40 hover:bg-gray-50 transition-colors ${!tpl.enabled ? "opacity-60" : ""}`}
                >
                  {/* Enable/Disable Toggle */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleEnabled(tpl.eventKey, !tpl.enabled);
                    }}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tpl.enabled ? "bg-primary" : "bg-gray-300"
                    }`}
                    title={tpl.enabled ? "Auto-email enabled — click to disable" : "Auto-email disabled — click to enable"}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        tpl.enabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>

                  {/* Clickable area to open editor */}
                  <button
                    type="button"
                    onClick={() => openEditor(tpl)}
                    className="flex-1 flex items-center gap-3 min-w-0 ml-3 text-left"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{tpl.name}</p>
                      <p className="text-xs text-gray-500 truncate">{tpl.subject}</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {tpl.isCustom ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        Customized
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Default
                      </span>
                    )}
                    <button type="button" onClick={() => openEditor(tpl)}>
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
