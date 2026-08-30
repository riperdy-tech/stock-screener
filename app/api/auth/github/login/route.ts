// app/api/auth/github/login/route.ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const state = crypto.randomBytes(16).toString("hex");
  const site = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.GH_OAUTH_CLIENT_ID || "",
    redirect_uri: `${site}/api/auth/github/callback`,
    state,
  });
  const res = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`
  );
  res.cookies.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
