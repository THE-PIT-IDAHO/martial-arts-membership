"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

export default function PdfViewerPage() {
  const router = useRouter();
  const [title, setTitle] = useState("Document");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildBlobUrl = useCallback((): Promise<string | null> => {
    const rawUrl = sessionStorage.getItem("pdf_viewer_url") || "";
    if (!rawUrl) return Promise.resolve(null);

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
      } catch (e) {
        setError(`Could not decode PDF: ${(e as Error).message}`);
        return Promise.resolve(null);
      }
    }

    if (rawUrl.startsWith("/")) {
      return fetch(rawUrl)
        .then((r) => r.blob())
        .then((blob) => URL.createObjectURL(blob))
        .catch((e) => {
          setError(`Could not load PDF: ${e.message}`);
          return null;
        });
    }

    return Promise.resolve(rawUrl);
  }, []);

  useEffect(() => {
    setTitle(sessionStorage.getItem("pdf_viewer_title") || "Document");
    buildBlobUrl().then((url) => {
      if (url) setBlobUrl(url);
      else if (!error) setError("No document data found.");
    });
  }, [buildBlobUrl, error]);

  function downloadPdf() {
    if (!blobUrl) return;
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `${title}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function openInNewTab() {
    if (!blobUrl) return;
    window.open(blobUrl, "_blank");
  }

  return (
    <div className="px-4 pt-4 pb-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back
        </button>
        <h1 className="text-sm font-semibold text-gray-900 truncate ml-3">{title}</h1>
      </div>

      {error ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
          <p className="text-sm text-red-600 mb-3">{error}</p>
          <p className="text-xs text-gray-500">Please contact the gym if this document is missing.</p>
        </div>
      ) : !blobUrl ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-3">
            <iframe
              src={blobUrl}
              title={title}
              className="w-full"
              style={{ height: "70vh", border: "none" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadPdf}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-primary text-white active:scale-[0.98] transition-all"
            >
              Download
            </button>
            <button
              onClick={openInNewTab}
              className="flex-1 py-2.5 rounded-xl font-semibold text-sm bg-white text-gray-700 border border-gray-300 active:scale-[0.98] transition-all"
            >
              Open in New Tab
            </button>
          </div>
        </>
      )}
    </div>
  );
}
