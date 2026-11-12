import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { exportAccountData } from "@/lib/server/account";

export const dynamic = "force-dynamic";

/** Download everything we hold about the signed-in user as JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to export your data." }, { status: 401 });
  const data = await exportAccountData(user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="billsplit-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
