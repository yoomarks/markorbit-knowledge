import { apiError } from "../../../../server/api-errors";
import {
  rejectOperatorServiceAcquisitionGovernanceAccess,
  resolveOperatorServiceReadAccess,
} from "../../../../server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    resolveOperatorServiceReadAccess(request);
    rejectOperatorServiceAcquisitionGovernanceAccess();
  } catch (error) {
    return apiError(error);
  }
}
