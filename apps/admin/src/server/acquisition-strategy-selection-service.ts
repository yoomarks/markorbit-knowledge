import type { DatabaseSync } from "node:sqlite";
import {
  ACQUISITION_SEED_PLAYBOOKS,
  selectAcquisitionPlaybook,
  type AcquisitionPlaybookHistory,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteAcquisitionIntelligenceRepository,
  type PersistedAcquisitionStrategySelection,
} from "@markorbit/persistence/acquisition-intelligence";

export const ACQUISITION_STRATEGY_AUTO_SELECTION_VERSION =
  "ACQUISITION_STRATEGY_AUTO_SELECTION_V1" as const;

export type AcquisitionStrategyAutoSelectionResult = {
  version: typeof ACQUISITION_STRATEGY_AUTO_SELECTION_VERSION;
  sourceId: string;
  fingerprintObservedAt: string;
  historiesApplied: Record<string, AcquisitionPlaybookHistory>;
  persisted: PersistedAcquisitionStrategySelection;
};

/**
 * Selects an ACTIVE reusable playbook from the latest measured SourceFingerprint
 * plus durable cross-run playbook outcomes. This records a recommendation only:
 * selector boundaries explicitly prevent collection authorization or promotion.
 */
export class AcquisitionStrategySelectionService {
  private readonly repository: SqliteAcquisitionIntelligenceRepository;

  constructor(database: DatabaseSync) {
    this.repository = new SqliteAcquisitionIntelligenceRepository(database);
  }

  selectAndRecord(input: {
    sourceId: string;
    selectedAt?: string;
  }): AcquisitionStrategyAutoSelectionResult {
    const sourceId = input.sourceId.trim();
    if (!sourceId) throw new RegistryValidationError("sourceId is required");

    const fingerprint = this.repository.latestFingerprintForSource(sourceId);
    if (!fingerprint) {
      throw new RegistryValidationError(
        `Source ${sourceId} has no SourceFingerprint; strategy selection requires measured structural evidence`,
      );
    }

    const historiesApplied = Object.fromEntries(
      ACQUISITION_SEED_PLAYBOOKS.map((playbook) => [
        `${playbook.id}@${playbook.revision}`,
        this.repository.playbookHistory(playbook.id, playbook.revision),
      ]),
    );
    const selection = selectAcquisitionPlaybook({
      fingerprint,
      playbooks: ACQUISITION_SEED_PLAYBOOKS,
      history: historiesApplied,
    });
    const persisted = this.repository.recordStrategySelection(selection, input.selectedAt);

    return {
      version: ACQUISITION_STRATEGY_AUTO_SELECTION_VERSION,
      sourceId,
      fingerprintObservedAt: fingerprint.observedAt,
      historiesApplied,
      persisted,
    };
  }
}
