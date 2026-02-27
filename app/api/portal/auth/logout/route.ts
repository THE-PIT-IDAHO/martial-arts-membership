import { NextRequest, NextResponse } from "next/server";
import {
  getSessionTokenFromRequest,
  destroyMemberSession,
  clearSessionCookie,
} from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const token = getSessionTokenFromRequest(req);
  if (token) {
    await destroyMemberSession(token);
  }

  const response = NextResponse.json({ success: true });
  clearSessionCookie(response);
  return response;
}
