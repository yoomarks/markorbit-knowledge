import { handleWorkerExecution } from "@/server/worker-execution-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  return handleWorkerExecution(request, id, "complete");
}
