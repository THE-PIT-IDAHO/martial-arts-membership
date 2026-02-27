import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/tasks
export async function GET() {
  try {
    // Spawn next occurrences for completed recurring tasks whose reset time has arrived
    const completedRecurring = await prisma.task.findMany({
      where: {
        status: "COMPLETED",
        recurrence: { not: null },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const task of completedRecurring) {
      const baseDue = task.dueDate || task.completedAt || task.createdAt;
      const nextDue = new Date(baseDue);

      if (task.recurrence === "DAILY") nextDue.setDate(nextDue.getDate() + 1);
      else if (task.recurrence === "WEEKLY") nextDue.setDate(nextDue.getDate() + 7);
      else if (task.recurrence === "MONTHLY") nextDue.setMonth(nextDue.getMonth() + 1);

      nextDue.setHours(0, 0, 0, 0);

      if (nextDue <= today) {
        // Use nextDue or today, whichever is later (avoids stale past dates)
        const finalDue = nextDue < today ? new Date(today) : nextDue;

        await prisma.task.create({
          data: {
            title: task.title,
            description: task.description,
            dueDate: finalDue,
            priority: task.priority,
            recurrence: task.recurrence,
            assignedRole: task.assignedRole,
            clientId: task.clientId,
          },
        });

        // Clear recurrence on the completed task so it doesn't keep spawning
        await prisma.task.update({
          where: { id: task.id },
          data: { recurrence: null },
        });
      }
    }

    const tasks = await prisma.task.findMany({
      orderBy: [{ status: "asc" }, { priority: "asc" }, { dueDate: "asc" }],
    });
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return new NextResponse("Failed to fetch tasks", { status: 500 });
  }
}

// POST /api/tasks
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, description, dueDate, priority, recurrence, assignedRole } = body;

    if (!title || typeof title !== "string") {
      return new NextResponse("Title is required", { status: 400 });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority || "MEDIUM",
        recurrence: recurrence || null,
        assignedRole: assignedRole || null,
        clientId: "default-client",
      },
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return new NextResponse("Failed to create task", { status: 500 });
  }
}
