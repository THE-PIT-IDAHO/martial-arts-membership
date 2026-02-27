import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";
import { getClientId } from "@/lib/tenant";

// GET /api/portal/appointments/slots?date=YYYY-MM-DD&appointmentId=xxx&duration=60
// Returns available coach time slots for a given date (portal/member-facing)
export async function GET(req: Request) {
  // Verify member session
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("portal_session")?.value;
  if (!sessionToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const session = await prisma.memberSession.findUnique({
    where: { token: sessionToken },
  });

  if (!session || session.expiresAt < new Date()) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dateStr = searchParams.get("date");
    const appointmentId = searchParams.get("appointmentId");
    const duration = parseInt(searchParams.get("duration") || "60");

    if (!dateStr) {
      return new NextResponse("date parameter is required", { status: 400 });
    }

    const targetDate = new Date(dateStr + "T00:00:00");
    const targetDayOfWeek = targetDate.getDay();

    const clientId = await getClientId(req);

    // 1. Get all coach availability blocks
    const allAvailability = await prisma.coachAvailability.findMany({
      where: { clientId },
    });

    // 2. Filter to those that apply on the target date
    const applicableBlocks: typeof allAvailability = [];

    for (const block of allAvailability) {
      if (appointmentId && block.appointmentId && block.appointmentId !== appointmentId) {
        continue;
      }

      if (!block.isRecurring) {
        const blockDate = new Date(block.startsAt);
        if (
          blockDate.getFullYear() === targetDate.getFullYear() &&
          blockDate.getMonth() === targetDate.getMonth() &&
          blockDate.getDate() === targetDate.getDate()
        ) {
          applicableBlocks.push(block);
        }
      } else {
        const blockStartsAt = new Date(block.startsAt);
        const blockDayOfWeek = blockStartsAt.getDay();

        if (blockDayOfWeek !== targetDayOfWeek) continue;
        if (block.scheduleStartDate && targetDate < new Date(block.scheduleStartDate)) continue;
        if (block.scheduleEndDate && targetDate > new Date(block.scheduleEndDate)) continue;
        if (!block.isOngoing && block.scheduleEndDate && targetDate > new Date(block.scheduleEndDate)) continue;

        if (block.excludedDates) {
          try {
            const excluded: string[] = JSON.parse(block.excludedDates);
            if (excluded.includes(dateStr)) continue;
          } catch { /* ignore */ }
        }

        if (block.frequencyUnit === "Week" && block.frequencyNumber && block.frequencyNumber > 1) {
          const startRef = block.scheduleStartDate ? new Date(block.scheduleStartDate) : blockStartsAt;
          const diffMs = targetDate.getTime() - startRef.getTime();
          const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
          if (diffWeeks % block.frequencyNumber !== 0) continue;
        }

        applicableBlocks.push(block);
      }
    }

    // 3. Get existing scheduled appointments for this date
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

    // 4. Generate time slots
    const slots: {
      coachId: string;
      coachName: string;
      startTime: string;
      endTime: string;
    }[] = [];

    for (const block of applicableBlocks) {
      const blockStart = new Date(block.startsAt);
      const blockEnd = new Date(block.endsAt);
      const availStartMins = blockStart.getHours() * 60 + blockStart.getMinutes();
      const availEndMins = blockEnd.getHours() * 60 + blockEnd.getMinutes();

      for (let startMins = availStartMins; startMins + duration <= availEndMins; startMins += duration) {
        const slotStart = `${String(Math.floor(startMins / 60)).padStart(2, "0")}:${String(startMins % 60).padStart(2, "0")}`;
        const slotEnd = `${String(Math.floor((startMins + duration) / 60)).padStart(2, "0")}:${String((startMins + duration) % 60).padStart(2, "0")}`;

        const isBooked = existingAppointments.some((appt) => {
          if (appt.coachId !== block.coachId) return false;
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
          });
        }
      }
    }

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
