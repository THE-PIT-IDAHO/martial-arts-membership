"use client";

import { useState, useRef } from "react";

export default function CameraTestPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Click the button to test camera");
  const [error, setError] = useState("");

  async function testCamera() {
    setStatus("Requesting camera...");
    setError("");
    try {
      const hasMedia = !!navigator.mediaDevices?.getUserMedia;
      setStatus(`getUserMedia available: ${hasMedia}`);

      if (!hasMedia) {
        setError("getUserMedia not supported in this browser. Make sure you're using HTTPS.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStatus(`Camera working! Tracks: ${stream.getTracks().length}`);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      const e = err as Error;
      setError(`${e.name}: ${e.message}`);
      setStatus("Camera failed");
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Camera Test</h1>
      <p className="text-sm text-gray-600">{status}</p>
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</p>}
      <button
        onClick={testCamera}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold"
      >
        Test Camera
      </button>
      <video ref={videoRef} playsInline muted autoPlay className="w-full rounded-lg border" />
      <p className="text-xs text-gray-400">
        URL: {typeof window !== "undefined" ? window.location.href : ""}<br />
        Protocol: {typeof window !== "undefined" ? window.location.protocol : ""}<br />
        Secure: {typeof window !== "undefined" ? String(window.isSecureContext) : ""}
      </p>
    </div>
  );
}
