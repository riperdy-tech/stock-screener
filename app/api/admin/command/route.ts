// app/api/admin/command/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/adminAuth";
import { PC_COMMANDS } from "../../../../lib/controlTower";
import { supabaseAdmin } from "../../../../lib/supabase";

export const dynamic = "force-dynamic";
// requireAdmin -> verifySession uses crypto.createHmac: Node runtime only.
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return new NextResponse("Unauthorized", { status: 401 });
  const { command, args } = await req.json();
  if (!PC_COMMANDS.has(command)) {
    return NextResponse.json({ error: "unknown command" }, { status: 400 });
  }
  // Explicit runner REQUIRED: the agent defaults an absent runner to
  // self-hosted, which must never happen without the caller saying so
  // (same policy as the dispatch route's confirm gate on sdf-self).
  if (command === "sdf_dispatch" &&
      !["self-hosted", "ubuntu-latest"].includes(args?.runner)) {
    return NextResponse.json({ error: "bad runner" }, { status: 400 });
  }
  // supabaseAdmin is null when SUPABASE_SERVICE_KEY is unset: fail as JSON 500
  // rather than a TypeError-shaped HTML 500.
  if (!supabaseAdmin) {
    return NextResponse.json({ error: "supabase admin client unavailable" }, { status: 500 });
  }
  const { data, error } = await supabaseAdmin
    .from("control_commands")
    .insert({ command, args: args ?? {} })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
