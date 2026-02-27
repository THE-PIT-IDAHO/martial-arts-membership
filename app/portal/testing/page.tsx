"use client";

import { useEffect, useState } from "react";

interface TestingEvent {
  id: string;
  name: string;
  date: string;
  time: string | null;
  location: string | null;
  styleName: string;
  isRegistered: boolean;
  registrationId: string | null;
  registrationStatus: string | null;
}

interface TestResult {
  id: string;
  eventName: string;
  eventDate: string;
  styleName: string;
  testingForRank: string | null;
  currentRank: string | null;
  status: string;
  score: number | null;
  notes: string | null;
  date: string;
}

export default function PortalTestingPage() {
  const [events, setEvents] = useState<TestingEvent[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState<string | null>(null);

  const loadData = () => {
    fetch("/api/portal/testing")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events || []);
        setResults(data.results || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleRegister = async (eventId: string) => {
    setRegistering(eventId);
    try {
      const res = await fetch("/api/portal/testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testingEventId: eventId }),
      });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || "Registration failed");
      }
    } catch {
      alert("Registration failed");
    }
    setRegistering(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-24 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Belt Testing</h1>

      {/* Upcoming Events */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Upcoming Tests</h2>
        {events.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-center">
            <p className="text-gray-500 text-sm">No upcoming testing events for your styles</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((event) => {
              const eventDate = new Date(event.date);
              return (
                <div key={event.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900">{event.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {event.styleName}
                      </p>
                    </div>
                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      {event.styleName}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <span className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                      </svg>
                      {eventDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                    {event.time && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {event.time}
                      </span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                        </svg>
                        {event.location}
                      </span>
                    )}
                  </div>

                  {event.isRegistered ? (
                    <div className="flex items-center gap-2 py-2 px-3 bg-green-50 rounded-lg">
                      <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm font-medium text-green-700">Registered</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleRegister(event.id)}
                      disabled={registering === event.id}
                      className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {registering === event.id ? "Registering..." : "Register for Test"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Past Results */}
      {results.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Past Results</h2>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {results.map((result) => {
              const statusColors: Record<string, string> = {
                PASSED: "bg-green-100 text-green-700",
                FAILED: "bg-red-100 text-red-700",
                REGISTERED: "bg-blue-100 text-blue-700",
                NO_SHOW: "bg-gray-100 text-gray-500",
              };
              const statusColor = statusColors[result.status] || "bg-gray-100 text-gray-500";

              return (
                <div key={result.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-gray-900 text-sm">{result.eventName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                      {result.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{result.styleName}</span>
                    <span>{new Date(result.eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    {result.testingForRank && <span>Testing for: {result.testingForRank}</span>}
                    {result.score !== null && <span>Score: {result.score}%</span>}
                  </div>
                  {result.notes && (
                    <p className="text-xs text-gray-600 mt-1 italic">{result.notes}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
