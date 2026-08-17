import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  return NextResponse.json(
    {
      error: {
        code: "SOURCE_COMPATIBILITY_AUTHENTICATED_WORKER_REQUIRED",
        message:
          "Unauthenticated source compatibility intake is disabled. Record representative live-canary observations through the authenticated /api/worker/v1/source-compatibility-observations endpoint.",
      },
    },
    { status: 410 },
  );
}
