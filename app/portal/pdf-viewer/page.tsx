"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

export default function PdfViewerPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Document");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const buildBlobUrl = useCallback((): Promise<string | null> => {
    const rawUrl = sessionStorage.getItem("pdf_viewer_url") || "";
    if (!rawUrl) return Promise.resolve(null);

    // Base64 data URI → blob
    if (rawUrl.startsWith("data:")) {
      try {
        const [header, b64] = rawUrl.split(",");
        const mimeMatch = header.match(/data:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : "application/pdf";
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        return Promise.resolve(URL.createObjectURL(blob));
      } catch {
        return Promise.resolve(null);
      }
    }

    // Relative path → fetch and create blob
    if (rawUrl.startsWith("/")) {
      return fetch(rawUrl)
        .then((r) => r.blob())
        .then((blob) => URL.createObjectURL(blob))
        .catch(() => null);
    }

    // External URL — use directly
    return Promise.resolve(rawUrl);
  }, []);

  useEffect(() => {
    setTitle(sessionStorage.getItem("pdf_viewer_title") || "Document");
    buildBlobUrl().then((url) => {
      if (url) setBlobUrl(url);
    });
  }, [buildBlobUrl]);

  function openPdf() {
    if (!blobUrl) return;
    // Open in a new tab — lets the OS/browser native PDF viewer handle it
    window.open(blobUrl, "_blank");
    setOpened(true);
  }

  function downloadPdf() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-gray-500 mb-4"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Back
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
        {/* PDF icon */}
        <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>

        <h1 className="text-lg font-bold text-gray-900 mb-1">{title}</h1>

        {!blobUrl ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
          </div>
        ) : opened ? (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Your document should have opened. If not, tap the buttons below.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={openPdf}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-primary text-white active:scale-[0.98] transition-all"
              >
                Open Again
              </button>
              <button
                onClick={downloadPdf}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-white text-gray-700 border border-gray-300 active:scale-[0.98] transition-all"
              >
                Download PDF
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Tap below to view this document.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={openPdf}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-primary text-white active:scale-[0.98] transition-all"
              >
                View PDF
              </button>
              <button
                onClick={downloadPdf}
                className="w-full py-2.5 rounded-xl font-semibold text-sm bg-white text-gray-700 border border-gray-300 active:scale-[0.98] transition-all"
              >
                Download PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
