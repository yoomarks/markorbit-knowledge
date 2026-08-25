import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { ExpertQaOperatorService } from "@/server/expert-qa-operator-service";
import { getExpertSourceRepository } from "@/server/expert-source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringField(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value;
}

function service(): ExpertQaOperatorService {
  return new ExpertQaOperatorService(getExpertSourceRepository());
}

export async function GET() {
  try {
    return NextResponse.json({
      items: service().listViews(),
      communication: {
        connected: false,
        reason:
          "Shared Communication bridge is intentionally fail-closed until K-CAP-COMM-005 is implemented.",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const created = service().createDraft({
      topic: stringField(body, "topic"),
      jurisdiction: stringField(body, "jurisdiction"),
      question: stringField(body, "question"),
      expertRef: stringField(body, "expertRef"),
      ...(typeof body.organizationRef === "string" && body.organizationRef.trim()
        ? { organizationRef: body.organizationRef }
        : {}),
      requestedBy: stringField(body, "requestedBy"),
      accessClassification:
        body.accessClassification === "INTERNAL" ||
        body.accessClassification === "RESTRICTED" ||
        body.accessClassification === "CONFIDENTIAL"
          ? body.accessClassification
          : "CONFIDENTIAL",
    });
    return NextResponse.json({ task: created }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
