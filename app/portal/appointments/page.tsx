"use client";

import { useEffect, useState } from "react";

interface AppointmentType {
  id: string;
  title: string;
  duration: number;
  description: string | null;
  priceCents: number | null;
}

interface ServiceCredit {
  id: string;
  creditsRemaining: number;
  creditsTotal: number;
  servicePackage: {
    id: string;
    name: string;
    appointmentId: string | null;
  };
}

interface ScheduledAppt {
  id: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  status: string;
  coachName: string | null;
  appointment: { id: string; title: string; duration: number };
}

interface TimeSlot {
  coachId: string;
  coachName: string;
  startTime: string;
  endTime: string;
}

export default function PortalAppointmentsPage() {
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [credits, setCredits] = useState<ServiceCredit[]>([]);
  const [myAppointments, setMyAppointments] = useState<ScheduledAppt[]>([]);
  const [loading, setLoading] = useState(true);

  // Booking form state
  const [showBooking, setShowBooking] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedCreditId, setSelectedCreditId] = useState<string>("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);

  // Available slots
  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);

  function loadData() {
    Promise.all([
      fetch("/api/portal/appointments").then((r) => r.json()),
      fetch("/api/portal/appointments/mine").then((r) => r.json()),
    ]).then(([data, mineData]) => {
      setAppointmentTypes(data.appointments || []);
      setCredits(data.credits || []);
      setSpaces(data.spaces || []);
      setMyAppointments(mineData.appointments || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  // Get credits applicable to a given appointment type
  function getApplicableCredits(apptId: string) {
    return credits.filter(
      (c) =>
        c.creditsRemaining > 0 &&
        (!c.servicePackage.appointmentId || c.servicePackage.appointmentId === apptId)
    );
  }

  // Fetch available slots when date or appointment type changes
  async function fetchSlots(apptId: string, date: string) {
    if (!apptId || !date) {
      setAvailableSlots([]);
      return;
    }
    setSlotsLoading(true);
    setSelectedSlotIndex(null);
    try {
      const apptType = appointmentTypes.find((a) => a.id === apptId);
      const duration = apptType?.duration || 60;
      const params = new URLSearchParams({
        date,
        appointmentId: apptId,
        duration: String(duration),
      });
      const res = await fetch(`/api/portal/appointments/slots?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableSlots(data.slots || []);
      } else {
        setAvailableSlots([]);
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function handleBook() {
    if (!selectedType || !selectedDate || selectedSlotIndex === null) {
      alert("Please select an appointment type, date, and time slot.");
      return;
    }
    const slot = availableSlots[selectedSlotIndex];
    if (!slot) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/portal/appointments/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appointmentId: selectedType,
          scheduledDate: selectedDate,
          startTime: slot.startTime,
          endTime: slot.endTime,
          coachId: slot.coachId,
          coachName: slot.coachName,
          notes: bookingNotes || null,
          memberServiceCreditId: selectedCreditId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to book appointment");
        return;
      }
      // Reset and reload
      setShowBooking(false);
      setSelectedType("");
      setSelectedDate("");
      setSelectedCreditId("");
      setSelectedSlotIndex(null);
      setAvailableSlots([]);
      setBookingNotes("");
      loadData();
    } catch {
      alert("Failed to book appointment");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch(`/api/portal/appointments/${id}`, { method: "DELETE" });
      if (res.ok) {
        loadData();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to cancel");
      }
    } catch {
      alert("Failed to cancel appointment");
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const applicableCredits = selectedType ? getApplicableCredits(selectedType) : [];

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Appointments</h1>
        <button
          onClick={() => setShowBooking(!showBooking)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark transition-colors"
        >
          {showBooking ? "Cancel" : "Book Appointment"}
        </button>
      </div>

      {/* My Credits */}
      {credits.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-600">My Credits</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {credits.map((credit) => (
              <div
                key={credit.id}
                className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50"
              >
                <div>
                  <p className="text-sm font-medium">{credit.servicePackage.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-700">
                    {credit.creditsRemaining}/{credit.creditsTotal}
                  </p>
                  <p className="text-xs text-gray-500">remaining</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Book Appointment Form */}
      {showBooking && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
          <h2 className="text-sm font-semibold">Book an Appointment</h2>

          {/* Step 1: Appointment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Appointment Type</label>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setSelectedCreditId("");
                setSelectedSlotIndex(null);
                setAvailableSlots([]);
                if (e.target.value && selectedDate) {
                  fetchSlots(e.target.value, selectedDate);
                }
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Select...</option>
              {appointmentTypes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} ({a.duration} min)
                  {a.priceCents ? ` — $${(a.priceCents / 100).toFixed(2)}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Date */}
          {selectedType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                value={selectedDate}
                min={today}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  fetchSlots(selectedType, e.target.value);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}

          {/* Step 3: Available Slots */}
          {selectedType && selectedDate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Available Times
              </label>
              {slotsLoading ? (
                <div className="text-center py-6 text-sm text-gray-500">
                  Loading available times...
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
                  No available times for this date. Try a different date.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                  {availableSlots.map((slot, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedSlotIndex(idx)}
                      className={`flex items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedSlotIndex === idx
                          ? "border-primary bg-primary/5 ring-2 ring-primary"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-medium text-gray-900">
                        {slot.startTime} – {slot.endTime}
                      </span>
                      <span className="text-xs text-gray-500">{slot.coachName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Credit selection */}
          {selectedType && applicableCredits.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Use Appointment Credit</label>
              <select
                value={selectedCreditId}
                onChange={(e) => setSelectedCreditId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">No credit (pay at appointment)</option>
                {applicableCredits.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.servicePackage.name} — {c.creditsRemaining}/{c.creditsTotal} remaining
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea
              value={bookingNotes}
              onChange={(e) => setBookingNotes(e.target.value)}
              rows={2}
              placeholder="Any special requests..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <button
            onClick={handleBook}
            disabled={submitting || selectedSlotIndex === null}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primaryDark transition-colors disabled:opacity-50"
          >
            {submitting ? "Booking..." : "Confirm Booking"}
          </button>
        </div>
      )}

      {/* Upcoming Appointments */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-600">Upcoming Appointments</h2>
        {myAppointments.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            No upcoming appointments.
          </div>
        ) : (
          <div className="space-y-2">
            {myAppointments.map((appt) => (
              <div
                key={appt.id}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white"
              >
                <div>
                  <p className="text-sm font-medium">{appt.appointment.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(appt.scheduledDate).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    &middot; {appt.startTime} – {appt.endTime}
                    {appt.coachName && ` &middot; ${appt.coachName}`}
                  </p>
                </div>
                <button
                  onClick={() => handleCancel(appt.id)}
                  disabled={cancellingId === appt.id}
                  className="rounded-md border border-gray-300 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  {cancellingId === appt.id ? "..." : "Cancel"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
