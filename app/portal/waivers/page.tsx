"use client";

import { useEffect, useState, useRef } from "react";

export default function PortalWaiversPage() {
  const [template, setTemplate] = useState<{ id: string; name: string; content: string } | null>(null);
  const [signed, setSigned] = useState<{ id: string; templateName: string; signedAt: string }[]>([]);
  const [signing, setSigning] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const [success, setSuccess] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    fetch("/api/portal/waivers/sign")
      .then((r) => r.json())
      .then((data) => {
        if (data.template) setTemplate(data.template);
        if (data.signed) setSigned(data.signed);
      })
      .catch(() => {});
  }, []);

  function initCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
  }

  function getPos(e: React.TouchEvent | React.MouseEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }

  function startDraw(e: React.TouchEvent | React.MouseEvent) {
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function draw(e: React.TouchEvent | React.MouseEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    drawingRef.current = false;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function handleSign() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const signatureData = canvas.toDataURL("image/png");

    setSigning(true);
    try {
      const res = await fetch("/api/portal/waivers/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template?.id, signatureData }),
      });
      if (res.ok) {
        setSuccess(true);
        setShowPad(false);
        // Refresh signed list
        const data = await fetch("/api/portal/waivers/sign").then((r) => r.json());
        if (data.signed) setSigned(data.signed);
      }
    } catch {
      // error
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Waivers</h1>

      {success && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          Waiver signed successfully!
        </div>
      )}

      {/* Waiver template to sign */}
      {template && !showPad && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">{template.name}</h2>
          <div
            className="text-sm text-gray-600 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: template.content }}
          />
          <button
            onClick={() => {
              setShowPad(true);
              setSuccess(false);
              setTimeout(initCanvas, 100);
            }}
            className="px-4 py-2 bg-primary text-white text-sm rounded-md font-medium hover:bg-primaryDark"
          >
            Sign Waiver
          </button>
        </div>
      )}

      {/* Signature pad */}
      {showPad && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-sm font-semibold">Sign Below</h2>
          <div className="border border-gray-300 rounded-md bg-gray-50 touch-none">
            <canvas
              ref={canvasRef}
              className="w-full"
              style={{ height: 200 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearCanvas}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              onClick={handleSign}
              disabled={signing}
              className="px-4 py-1.5 bg-primary text-white text-sm rounded-md font-medium hover:bg-primaryDark disabled:opacity-50"
            >
              {signing ? "Submitting..." : "Submit Signature"}
            </button>
            <button
              onClick={() => setShowPad(false)}
              className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Signed waivers */}
      {signed.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-semibold">Signed Waivers</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {signed.map((w) => (
              <div key={w.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{w.templateName}</p>
                  <p className="text-xs text-gray-500">
                    Signed {new Date(w.signedAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  Signed
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!template && signed.length === 0 && (
        <p className="text-sm text-gray-500">No waivers available at this time.</p>
      )}
    </div>
  );
}
