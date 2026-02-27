export const ALL_PERMISSION_KEYS = [
  "dashboard",
  "members",
  "memberships",
  "styles",
  "classes",
  "calendar",
  "testing",
  "curriculum",
  "promotions",
  "pos",
  "waivers",
  "reports",
  "tasks",
  "communication",
  "kiosk",
  "account",
  "audit-log",
] as const;

export type PermissionKey = (typeof ALL_PERMISSION_KEYS)[number];

export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [...ALL_PERMISSION_KEYS],
  ADMIN: ALL_PERMISSION_KEYS.filter((k) => k !== "account"),
  COACH: [
    "dashboard",
    "members",
    "classes",
    "calendar",
    "testing",
    "curriculum",
    "promotions",
    "tasks",
    "communication",
    "kiosk",
  ],
  FRONT_DESK: [
    "dashboard",
    "members",
    "memberships",
    "classes",
    "calendar",
    "pos",
    "waivers",
    "tasks",
    "kiosk",
  ],
};

// Map route prefixes to permission keys
const ROUTE_PERMISSION_MAP: [string, string][] = [
  ["/dashboard", "dashboard"],
  ["/members", "members"],
  ["/memberships", "memberships"],
  ["/styles", "styles"],
  ["/classes", "classes"],
  ["/calendar", "calendar"],
  ["/testing", "testing"],
  ["/curriculum", "curriculum"],
  ["/promotions", "promotions"],
  ["/pos", "pos"],
  ["/waivers", "waivers"],
  ["/reports", "reports"],
  ["/tasks", "tasks"],
  ["/communication", "communication"],
  ["/kiosk", "kiosk"],
  ["/account", "account"],
  ["/settings", "account"],
  ["/audit-log", "audit-log"],
];

export function getPermissionForRoute(pathname: string): string | null {
  for (const [route, perm] of ROUTE_PERMISSION_MAP) {
    if (pathname === route || pathname.startsWith(route + "/")) return perm;
  }
  return null;
}

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required);
}

export async function getRolePermissions(role: string): Promise<string[]> {
  if (role === "OWNER") return [...ALL_PERMISSION_KEYS];
  try {
    const { prisma } = await import("@/lib/prisma");
    const setting = await prisma.settings.findFirst({
      where: { key: "role_permissions" },
    });
    if (setting?.value) {
      const custom = JSON.parse(setting.value);
      if (custom[role]) return custom[role];
    }
  } catch {}
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
}
