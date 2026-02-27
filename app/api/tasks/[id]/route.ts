import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// PATCH /api/tasks/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, description, dueDate, priority, recurrence, assignedRole, status } = body;

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) data.priority = priority;
    if (recurrence !== undefined) data.recurrence = recurrence || null;
    if (assignedRole !== undefined) data.assignedRole = assignedRole || null;
    if (status !== undefined) {
      data.status = status;
      if (status === "COMPLETED") {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data,
    });

    // Recurring task spawning is handled by GET /api/tasks on page load,
    // so the next occurrence only appears when the reset day arrives.

    return NextResponse.json({ task });
  } catch (error) {
    console.error("Error updating task:", error);
    return new NextResponse("Failed to update task", { status: 500 });
  }
}

// DELETE /api/tasks/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.task.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting task:", error);
    return new NextResponse("Failed to delete task", { status: 500 });
  }
}
