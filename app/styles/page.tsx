"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppLayout } from "@/components/app-layout";

type Style = {
  id: string;
  name: string;
  shortName?: string | null;
  description?: string | null;
  beltSystemEnabled?: boolean | null;
};

export default function StylesPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStyles() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/styles");
        if (!res.ok) {
          throw new Error("Failed to load styles");
        }
        const data = await res.json();
        setStyles(data.styles || []);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load styles");
        setStyles([]);
      } finally {
        setLoading(false);
      }
    }

    fetchStyles();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Styles</h1>
            <p className="text-sm text-gray-600">
              Choose an existing style to edit, or create a new one.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/styles/new"
              className="text-xs rounded-md bg-primary px-3 py-1 font-semibold text-white hover:bg-primaryDark"
            >
              Create Style
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Styles list */}
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Existing Styles
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Short
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Description
                  </th>
                  <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Belt System
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase text-gray-500 whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-sm text-gray-500"
                    >
                      Loading styles…
                    </td>
                  </tr>
                ) : styles.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-6 text-center text-sm text-gray-400"
                    >
                      No styles yet. Use the &quot;Create Style&quot; button to
                      add your first one.
                    </td>
                  </tr>
                ) : (
                  styles.map((style) => (
                    <tr
                      key={style.id}
                      className="border-t border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 whitespace-nowrap align-middle">
                        <Link
                          href={`/styles/${style.id}`}
                          className="text-sm font-medium text-primary hover:text-primaryDark"
                        >
                          {style.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap align-middle text-xs text-gray-700">
                        {style.shortName || "—"}
                      </td>
                      <td className="px-3 py-2 align-middle text-xs text-gray-700 max-w-xs">
                        <span className="line-clamp-2">
                          {style.description || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center align-middle">
                        {style.beltSystemEnabled ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 border border-green-300">
                            Enabled
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 border border-gray-300">
                            Off
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap align-middle">
                        <div className="inline-flex items-center gap-2">
                          {/* These are styled as subtle text links, not primary buttons */}
                          <Link
                            href={`/styles/${style.id}`}
                            className="text-xs text-primary hover:text-primaryDark font-medium"
                          >
                            Edit
                          </Link>
                          <Link
                            href={`/styles/belt-designer?styleId=${style.id}&styleName=${encodeURIComponent(
                              style.name
                            )}`}
                            className="text-xs text-gray-600 hover:text-primary font-medium"
                          >
                            Belt Designer
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
