import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// GET /api/coach-availability/slots?date=YYYY-MM-DD&appointmentId=xxx&duration=60
// Returns available time slots for a given date based on coach availability
export async function GET(req: Request) {
  try {
    const clientId = await getClientId(req);
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    const appointmentId = searchParams.get("appointmentId");
    const duration = parseInt(searchParams.get("duration") || "60");

    if (!dateStr) {
      return new NextResponse("date parameter is required", { status: 400 });
    }

    const targetDate = new Date(dateStr + "T00:00:00");
    const targetDayOfWeek = targetDate.getDay(); // 0=Sun, 1=Mon, ...

    // 1. Get all coach availability blocks
    const allAvailability = await prisma.coachAvailability.findMany({
      where: { clientId },
    });

    // 2. Filter to those that apply on the target date
    const applicableBlocks: typeof allAvailability = [];

    for (const block of allAvailability) {
      // If linked to a specific appointment type and doesn't match, skip
      if (appointmentId && block.appointmentId && block.appointmentId !== appointmentId) {
        continue;
      }

      if (!block.isRecurring) {
        // One-off: check if it's on the target date
        const blockDate = new Date(block.startsAt);
        if (
          blockDate.getFullYear() === targetDate.getFullYear() &&
          blockDate.getMonth() === targetDate.getMonth() &&
          blockDate.getDate() === targetDate.getDate()
        ) {
          applicableBlocks.push(block);
        }
      } else {
        // Recurring: check if it falls on this day
        const blockStartsAt = new Date(block.startsAt);
        const blockDayOfWeek = blockStartsAt.getDay();

        // Must be same day of week (for weekly recurrence)
        if (blockDayOfWeek !== targetDayOfWeek) continue;

        // Check schedule start/end dates
        if (block.scheduleStartDate && targetDate < new Date(block.scheduleStartDate)) continue;
        if (block.scheduleEndDate && targetDate > new Date(block.scheduleEndDate)) continue;
        if (!block.isOngoing && block.scheduleEndDate && targetDate > new Date(block.scheduleEndDate)) continue;

        // Check excluded dates
        if (block.excludedDates) {
          try {
            const excluded: string[] = JSON.parse(block.excludedDates);
            if (excluded.includes(dateStr)) continue;
          } catch { /* ignore */ }
        }

        // Check frequency (for non-weekly patterns)
        if (block.frequencyUnit === "Week" && block.frequencyNumber && block.frequencyNumber > 1) {
          const startRef = block.scheduleStartDate ? new Date(block.scheduleStartDate) : blockStartsAt;
          const diffMs = targetDate.getTime() - startRef.getTime();
          const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
          if (diffWeeks % block.frequencyNumber !== 0) continue;
        }

        applicableBlocks.push(block);
      }
    }

    // 3. Get existing scheduled appointments for this date (to subtract booked slots)
    const dayStart = new Date(dateStr + "T00:00:00");
    const dayEnd = new Date(dateStr + "T23:59:59");

    const existingAppointments = await prisma.scheduledAppointment.findMany({
      where: {
        scheduledDate: { gte: dayStart, lte: dayEnd },
        status: { notIn: ["CANCELLED"] },
        clientId,
      },
      select: {
        startTime: true,
        endTime: true,
        coachId: true,
      },
    });

    // 4. Generate time slots from availability blocks
    const slots: {
      coachId: string;
      coachName: string;
      startTime: string;
      endTime: string;
      locationId: string | null;
      spaceId: string | null;
    }[] = [];

    for (const block of applicableBlocks) {
      const blockStart = new Date(block.startsAt);
      const blockEnd = new Date(block.endsAt);
      const availStartMins = blockStart.getHours() * 60 + blockStart.getMinutes();
      const availEndMins = blockEnd.getHours() * 60 + blockEnd.getMinutes();

      // Generate slots in <duration>-minute increments
      for (let startMins = availStartMins; startMins + duration <= availEndMins; startMins += duration) {
        const slotStart = `${String(Math.floor(startMins / 60)).padStart(2, "0")}:${String(startMins % 60).padStart(2, "0")}`;
        const slotEnd = `${String(Math.floor((startMins + duration) / 60)).padStart(2, "0")}:${String((startMins + duration) % 60).padStart(2, "0")}`;

        // Check if this slot overlaps with any existing appointment for this coach
        const isBooked = existingAppointments.some((appt) => {
          if (appt.coachId !== block.coachId) return false;
          // Check time overlap
          const apptStartMins = timeToMins(appt.startTime);
          const apptEndMins = timeToMins(appt.endTime);
          return startMins < apptEndMins && (startMins + duration) > apptStartMins;
        });

        if (!isBooked) {
          slots.push({
            coachId: block.coachId,
            coachName: block.coachName || "Unknown Coach",
            startTime: slotStart,
            endTime: slotEnd,
            locationId: block.locationId,
            spaceId: block.spaceId,
          });
        }
      }
    }

    // Sort by start time, then coach name
    slots.sort((a, b) => {
      const timeCompare = a.startTime.localeCompare(b.startTime);
      if (timeCompare !== 0) return timeCompare;
      return a.coachName.localeCompare(b.coachName);
    });

    return NextResponse.json({ slots });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    return new NextResponse("Failed to load available slots", { status: 500 });
  }
}

function timeToMins(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
