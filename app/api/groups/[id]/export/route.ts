import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AppError } from "@/lib/server/errors";
import { exportGroupCsv } from "@/lib/server/export-csv";

export const dynamic = "force-dynamic";

/** Download a group's expenses and payments as a CSV spreadsheet (members only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to export." }, { status: 401 });
  const { id } = await params;
  try {
    const { csv, filename } = await exportGroupCsv(user.id, id);
    // BOM so Excel opens UTF-8 names and currency symbols correctly.
    return new NextResponse("﻿" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
