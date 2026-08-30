// lib/adminAuth.ts
import crypto from "crypto";
import type { NextRequest } from "next/server";

export const ADMIN_COOKIE = "rs2_admin";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s) throw new Error("ADMIN_SESSION_SECRET not set");
  return s;
}

export function signSession(login: string): string {
  const payload = Buffer.from(
    JSON.stringify({ login, exp: Date.now() + THIRTY_DAYS_MS })
  ).toString("base64url");
  const mac = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifySession(token: string | undefined): { login: string } | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expect = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof data.login !== "string" || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return { login: data.login };
  } catch {
    return null;
  }
}

export function requireAdmin(req: NextRequest): { login: string } | null {
  return verifySession(req.cookies.get(ADMIN_COOKIE)?.value);
}
