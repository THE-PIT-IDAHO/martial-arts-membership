import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientId } from "@/lib/tenant";

// POST /api/tasks/seed — populate default tasks if none exist
export async function POST(req: Request) {
  try {
    const clientId = await getClientId(req);
    const count = await prisma.task.count({ where: { clientId } });
    if (count > 0) {
      return NextResponse.json({ seeded: false, message: "Tasks already exist" });
    }

    const now = new Date();
    const addDays = (days: number) => {
      const d = new Date(now);
      d.setDate(d.getDate() + days);
      return d;
    };

    const defaults = [
      { title: "Follow up with trial members", priority: "HIGH", dueDate: addDays(3) },
      { title: "Review membership renewals", priority: "HIGH", dueDate: addDays(7) },
      { title: "Review and follow up on unpaid invoices", priority: "HIGH", dueDate: addDays(7) },
      { title: "Clean and inspect training mats", priority: "LOW", dueDate: addDays(3) },
      { title: "Order new belts and equipment", priority: "MEDIUM", dueDate: addDays(14) },
      { title: "Plan next belt testing event", priority: "MEDIUM", dueDate: addDays(14) },
      { title: "Update class schedule for next month", priority: "MEDIUM", dueDate: addDays(21) },
      { title: "Update waiver forms for new members", priority: "LOW", dueDate: addDays(30) },
    ];

    for (const task of defaults) {
      await prisma.task.create({
        data: {
          ...task,
          clientId,
        },
      });
    }

    return NextResponse.json({ seeded: true, count: defaults.length });
  } catch (error) {
    console.error("Error seeding tasks:", error);
    return new NextResponse("Failed to seed tasks", { status: 500 });
  }
}
