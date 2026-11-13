import { NextResponse, type NextRequest } from "next/server";
import { unsubscribe } from "@/lib/server/notifications";

export const dynamic = "force-dynamic";

/**
 * RFC 8058 one-click unsubscribe: mail providers POST here (List-Unsubscribe-Post). The signed
 * u/t/s query identifies the user and notification type; no login needed.
 * People clicking the link in an email land on the /unsubscribe page instead (GET), which asks first.
 */
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const ok = await unsubscribe(q.get("u") ?? "", q.get("t") ?? "", q.get("s") ?? "");
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
