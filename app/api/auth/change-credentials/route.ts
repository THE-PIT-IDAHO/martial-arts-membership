import { NextRequest, NextResponse } from "next/server";
import { getAdminSessionFromRequest, hashPassword } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAdminSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { currentPassword, newEmail, newPassword, newName } = await request.json();

    if (!currentPassword) {
      return NextResponse.json(
        { error: "Current password is required to make changes" },
        { status: 400 }
      );
    }

    // Verify current password
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { compare } = await import("bcryptjs");
    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Build update data
    const updateData: Record<string, string | boolean> = {};

    if (newName && newName.trim()) {
      updateData.name = newName.trim();
    }

    if (newEmail && newEmail.trim()) {
      const email = newEmail.toLowerCase().trim();
      // Check if email is already taken by another user
      const existing = await prisma.user.findFirst({ where: { email, clientId: user.clientId } });
      if (existing && existing.id !== user.id) {
        return NextResponse.json(
          { error: "That email is already in use" },
          { status: 400 }
        );
      }
      updateData.email = email;
    }

    if (newPassword) {
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: "New password must be at least 8 characters" },
          { status: 400 }
        );
      }
      updateData.passwordHash = await hashPassword(newPassword);
      // Clear forced password change flag
      updateData.mustChangePassword = false;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No changes provided" },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error changing credentials:", error);
    return NextResponse.json(
      { error: "Failed to update credentials" },
      { status: 500 }
    );
  }
}
