import { prisma } from "@/lib/prisma";

export async function logAudit(params: {
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  changes?: Record<string, { from: any; to: any }>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        summary: params.summary,
        changes: params.changes ? JSON.stringify(params.changes) : null,
      },
    });
  } catch (err) {
    // Fire-and-forget — don't break the main operation
    console.error("Audit log error:", err);
  }
}

// Helper to compute field diffs between old and new objects
export function computeChanges(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  fields: string[]
): Record<string, { from: any; to: any }> | undefined {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const field of fields) {
    const oldVal = oldObj[field] ?? null;
    const newVal = newObj[field] ?? null;
    if (String(oldVal) !== String(newVal)) {
      changes[field] = { from: oldVal, to: newVal };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}
