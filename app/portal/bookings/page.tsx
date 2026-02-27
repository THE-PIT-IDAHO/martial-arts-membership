"use client";

import { useEffect, useState } from "react";

interface Booking {
  id: string;
  bookingDate: string;
  status: string;
  waitlistPosition?: number;
  classSession: {
    name: string;
    startsAt: string;
    endsAt: string;
    coachName?: string;
    styleName?: string;
  };
}

interface ScheduledAppt {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  appointment: { id: string; title: string; duration: number };
}

export default function PortalBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [appointments, setAppointments] = useState<ScheduledAppt[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancellingApptId, setCancellingApptId] = useState<string | null>(null);

  function loadBookings() {
    Promise.all([
      fetch("/api/portal/bookings").then((r) => r.json()),
      fetch("/api/portal/appointments/mine").then((r) => r.json()),
    ]).then(([bookingData, apptData]) => {
      setBookings(bookingData);
      setAppointments(apptData.appointments || []);
      setLoading(false);
    });
  }

  useEffect(() => { loadBookings(); }, []);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/portal/bookings/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadBookings();
      }
    } catch {
      // ignore
    } finally {
      setCancellingId(null);
    }
  }

  async function handleCancelAppt(id: string) {
    setCancellingApptId(id);
    try {
      const res = await fetch(`/api/portal/appointments/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadBookings();
      }
    } catch {
      // ignore
    } finally {
      setCancellingApptId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">My Bookings</h1>

      {bookings.length === 0 && appointments.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No upcoming bookings.</p>
          <div className="flex items-center justify-center gap-4 mt-2">
            <a href="/portal/classes" className="text-primary text-sm font-medium">
              Browse classes
            </a>
            <a href="/portal/appointments" className="text-primary text-sm font-medium">
              Book appointment
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => {
            const start = new Date(b.classSession.startsAt);
            const bookDate = new Date(b.bookingDate);
            const isCancelling = cancellingId === b.id;

            return (
              <div key={b.id} className={`bg-white rounded-2xl border shadow-sm p-4 ${
                b.status === "WAITLISTED" ? "border-yellow-300" : "border-gray-200"
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{b.classSession.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {bookDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" at "}
                      {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </p>
                    {b.classSession.coachName && (
                      <p className="text-xs text-gray-400 mt-0.5">Coach: {b.classSession.coachName}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      b.status === "WAITLISTED" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                    }`}>
                      {b.status === "WAITLISTED" ? `Waitlist #${b.waitlistPosition}` : "Confirmed"}
                    </span>
                    <button
                      onClick={() => handleCancel(b.id)}
                      disabled={isCancelling}
                      className="text-xs text-gray-700 font-medium px-2 py-1 rounded-lg border border-gray-300 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCancelling ? "..." : "Cancel"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {appointments.map((appt) => {
            const apptDate = new Date(appt.scheduledDate);
            const isCancelling = cancellingApptId === appt.id;

            return (
              <div key={appt.id} className="bg-white rounded-2xl border border-purple-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{appt.appointment.title}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {apptDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      {" at "}
                      {appt.startTime} – {appt.endTime}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Appointment
                    </span>
                    <button
                      onClick={() => handleCancelAppt(appt.id)}
                      disabled={isCancelling}
                      className="text-xs text-gray-700 font-medium px-2 py-1 rounded-lg border border-gray-300 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      {isCancelling ? "..." : "Cancel"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
