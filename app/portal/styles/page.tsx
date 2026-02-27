"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface BeltLayers {
  fabric?: boolean;
  fabricColor?: string;
  twotone?: boolean;
  twotoneColor?: string;
  linear?: boolean;
  linearColor?: string;
  camo?: boolean;
  patch?: boolean;
  patchColor?: string;
  patch2?: boolean;
  patch2Color?: string;
  [key: string]: unknown;
}

interface ClassRequirement {
  label: string;
  attended: number;
  required: number;
  met: boolean;
}

interface RankStyle {
  styleName: string;
  rankName: string;
  beltLayers: BeltLayers | null;
  nextRankName: string | null;
  classRequirements: ClassRequirement[];
  documents: Array<{ id: string; name: string; url: string }>;
}

export default function PortalStylesPage() {
  const [rankInfo, setRankInfo] = useState<RankStyle[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/portal/profile")
      .then((r) => r.json())
      .then((data) => {
        setRankInfo(data.rankInfo || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My Styles</h1>

      {rankInfo.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No styles enrolled.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rankInfo.map((rs, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{rs.styleName}</p>
                  {rs.nextRankName && (
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">
                      Next: {rs.nextRankName}
                    </p>
                  )}
                </div>
                <p className="font-semibold text-gray-900 text-lg">{rs.rankName}</p>

                {rs.beltLayers && rs.beltLayers.fabricColor && (
                  <BeltImage layers={rs.beltLayers} />
                )}

                {rs.classRequirements.length > 0 && (
                  <div className="space-y-2 mt-1">
                    {rs.classRequirements.map((req, j) => {
                      const pct = Math.min(100, Math.round((req.attended / req.required) * 100));
                      return (
                        <div key={j}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-600">{req.label}</span>
                            <span className={`text-xs font-medium ${req.met ? "text-green-600" : "text-gray-500"}`}>
                              {req.attended}/{req.required}
                            </span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                req.met ? "bg-green-500" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              {rs.documents.length > 0 && (
                <div className="border-t border-gray-100">
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-gray-400 uppercase tracking-wide">Documents</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {rs.documents.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => {
                          if (doc.url.startsWith("data:")) {
                            sessionStorage.setItem("pdf_viewer_url", doc.url);
                            sessionStorage.setItem("pdf_viewer_title", doc.name);
                            router.push("/portal/pdf-viewer");
                          } else {
                            window.open(doc.url, "_blank");
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                        </div>
                        <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TintedLayer({ src, color }: { src: string; color: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundColor: color,
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat" as const,
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
      }}
    />
  );
}

function BeltImage({ layers }: { layers: BeltLayers }) {
  const stripeKeys = [
    "stripe10", "stripe9", "stripe8", "stripe7", "stripe6",
    "stripe5", "stripe4", "stripe3", "stripe2", "stripe1",
  ];

  return (
    <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-3">
      <div className="relative w-full h-28 overflow-hidden rounded-md">
        {layers.fabric && layers.fabricColor && (
          <TintedLayer src="/belts/fabric.png" color={layers.fabricColor} />
        )}
        {layers.twotone && layers.twotoneColor && (
          <TintedLayer src="/belts/twotone.png" color={layers.twotoneColor} />
        )}
        {layers.camo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/belts/camo.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
        )}
        {layers.linear && layers.linearColor && (
          <TintedLayer src="/belts/linear.png" color={layers.linearColor} />
        )}
        {layers.patch2 && layers.patch2Color && (
          <TintedLayer src="/belts/patch2.png" color={layers.patch2Color} />
        )}
        {layers.patch && layers.patchColor && (
          <TintedLayer src="/belts/patch.png" color={layers.patchColor} />
        )}
        {stripeKeys.map((key) => {
          if (!layers[key]) return null;
          const color = (layers[`${key}Color`] as string) || "#ffffff";
          return <TintedLayer key={key} src={`/belts/${key}.png`} color={color} />;
        })}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/belts/outline.png" alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" />
      </div>
    </div>
  );
}
