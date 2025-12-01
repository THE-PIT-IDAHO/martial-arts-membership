"use client";

import { useEffect, useState } from "react";
import { AppLayout } from "@/components/app-layout";

type GradingEvent = {
  id: string;
  date: string;
  name: string;
  notes?: string;
};

type Style = {
  id: string;
  name: string;
  beltConfig?: string | null;
  gradingDates?: string | null; // JSON array of grading events
};

export default function GradingPage() {
  const [styles, setStyles] = useState<Style[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStyleId, setSelectedStyleId] = useState<string>("");
  const [gradingEvents, setGradingEvents] = useState<GradingEvent[]>([]);
  const [saving, setSaving] = useState(false);

  // New event form
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventName, setNewEventName] = useState("");
  const [newEventNotes, setNewEventNotes] = useState("");

  // Load styles
  useEffect(() => {
    async function loadStyles() {
      try {
        const res = await fetch("/api/styles");
        if (res.ok) {
          const data = await res.json();
          setStyles(data.styles || []);
          if (data.styles && data.styles.length > 0) {
            setSelectedStyleId(data.styles[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load styles:", err);
      } finally {
        setLoading(false);
      }
    }
    loadStyles();
  }, []);

  // Load grading events when style changes
  useEffect(() => {
    if (!selectedStyleId) {
      setGradingEvents([]);
      return;
    }

    const style = styles.find((s) => s.id === selectedStyleId);
    if (style?.gradingDates) {
      try {
        const parsed = JSON.parse(style.gradingDates);
        setGradingEvents(Array.isArray(parsed) ? parsed : []);
      } catch {
        setGradingEvents([]);
      }
    } else {
      setGradingEvents([]);
    }
  }, [selectedStyleId, styles]);

  async function saveGradingEvents(events: GradingEvent[]) {
    if (!selectedStyleId) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/styles/${selectedStyleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gradingDates: JSON.stringify(events) }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update the style in local state
        setStyles((prev) =>
          prev.map((s) =>
            s.id === selectedStyleId ? { ...s, gradingDates: data.style.gradingDates } : s
          )
        );
      }
    } catch (err) {
      console.error("Failed to save grading events:", err);
    } finally {
      setSaving(false);
    }
  }

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEventDate) return;

    const newEvent: GradingEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      date: newEventDate,
      name: newEventName.trim() || "Grading",
      notes: newEventNotes.trim() || undefined,
    };

    const updated = [...gradingEvents, newEvent].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    setGradingEvents(updated);
    saveGradingEvents(updated);

    // Reset form
    setNewEventDate("");
    setNewEventName("");
    setNewEventNotes("");
  }

  function handleDeleteEvent(id: string) {
    if (!window.confirm("Delete this grading event?")) return;
    const updated = gradingEvents.filter((e) => e.id !== id);
    setGradingEvents(updated);
    saveGradingEvents(updated);
  }

  // Separate past and upcoming events
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const upcomingEvents = gradingEvents.filter(
    (e) => new Date(e.date + "T00:00:00") >= now
  );
  const pastEvents = gradingEvents
    .filter((e) => new Date(e.date + "T00:00:00") < now)
    .reverse(); // Most recent first

  // Get next grading date for display
  const nextGrading = upcomingEvents.length > 0 ? upcomingEvents[0] : null;

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Grading Events</h1>
          {styles.length > 1 && (
            <select
              value={selectedStyleId}
              onChange={(e) => setSelectedStyleId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {styles.map((style) => (
                <option key={style.id} value={style.id}>
                  {style.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {styles.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
            <p className="text-gray-500">
              No styles found. Create a style first to schedule grading events.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add New Event */}
            <div className="lg:col-span-1">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold mb-4">Schedule New Grading</h2>
                <form onSubmit={handleAddEvent} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Date *
                    </label>
                    <input
                      type="date"
                      value={newEventDate}
                      onChange={(e) => setNewEventDate(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={newEventName}
                      onChange={(e) => setNewEventName(e.target.value)}
                      placeholder="e.g., Spring Grading"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={newEventNotes}
                      onChange={(e) => setNewEventNotes(e.target.value)}
                      placeholder="Optional notes..."
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !newEventDate}
                    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Add Grading Event"}
                  </button>
                </form>
              </div>

              {/* Next Grading Info */}
              {nextGrading && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
                  <h3 className="text-xs font-semibold text-green-800 mb-2">
                    Next Grading
                  </h3>
                  <p className="text-lg font-bold text-green-900">
                    {new Date(nextGrading.date + "T00:00:00").toLocaleDateString(
                      undefined,
                      { weekday: "long", year: "numeric", month: "long", day: "numeric" }
                    )}
                  </p>
                  {nextGrading.name !== "Grading" && (
                    <p className="text-sm text-green-700">{nextGrading.name}</p>
                  )}
                </div>
              )}
            </div>

            {/* Upcoming Events */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-semibold mb-4">
                  Upcoming Grading Events ({upcomingEvents.length})
                </h2>
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    No upcoming grading events scheduled.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 rounded-md border border-gray-200 hover:bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {new Date(event.date + "T00:00:00").toLocaleDateString(
                              undefined,
                              { weekday: "short", year: "numeric", month: "short", day: "numeric" }
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {event.name}
                            {event.notes && ` - ${event.notes}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="text-xs text-primary hover:text-primaryDark"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Events (collapsible) */}
              {pastEvents.length > 0 && (
                <details className="rounded-lg border border-gray-200 bg-white">
                  <summary className="p-4 cursor-pointer text-sm font-semibold text-gray-600 hover:text-gray-900">
                    Past Grading Events ({pastEvents.length})
                  </summary>
                  <div className="px-4 pb-4 space-y-2">
                    {pastEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-center justify-between p-3 rounded-md border border-gray-200 bg-gray-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-600">
                            {new Date(event.date + "T00:00:00").toLocaleDateString(
                              undefined,
                              { weekday: "short", year: "numeric", month: "short", day: "numeric" }
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            {event.name}
                            {event.notes && ` - ${event.notes}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="text-xs text-primary/70 hover:text-primary"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">
            How Grading Dates Work
          </h3>
          <p className="text-xs text-blue-700">
            Grading dates are used with the "Attendance Window" setting on each rank.
            When checking if a member has met their class requirements, only classes
            attended within the attendance window before the next grading date will count.
          </p>
          <p className="text-xs text-blue-700 mt-2">
            If no grading date is set, the attendance window counts back from today's date instead.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
