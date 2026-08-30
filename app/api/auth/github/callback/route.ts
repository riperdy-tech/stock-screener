// app/api/auth/github/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, signSession } from "../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = req.cookies.get("gh_oauth_state")?.value;
  if (!code || !state || !saved || state !== saved) {
    return new NextResponse("Bad OAuth state", { status: 400 });
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GH_OAUTH_CLIENT_ID,
      client_secret: process.env.GH_OAUTH_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token: accessToken } = await tokenRes.json();
  if (!accessToken) return new NextResponse("OAuth exchange failed", { status: 400 });

  const userRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "rs2-control-tower" },
  });
  const user = await userRes.json();
  const allowed = (process.env.ADMIN_GITHUB_LOGIN || "").toLowerCase();
  if (!user?.login || user.login.toLowerCase() !== allowed) {
    return new NextResponse("Not authorized for this control tower", { status: 403 });
  }

  const res = NextResponse.redirect(new URL("/admin", req.url));
  res.cookies.set(ADMIN_COOKIE, signSession(user.login), {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  res.cookies.delete("gh_oauth_state");
  return res;
}
