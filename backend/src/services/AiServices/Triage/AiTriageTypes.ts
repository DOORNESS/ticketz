import { AiHandoffReason } from "../AiOperationalTypes";

export type AiHandoffMode = "none" | "operational" | "definitive";

export type AiProcessingState =
  | "idle"
  | "processing"
  | "awaiting_customer"
  | "awaiting_human"
  | "resolved_by_ai"
  | "failed";

export type CaseCompletenessSnapshot = {
  intentIdentified: boolean;
  productIdentified: boolean;
  affectedModule: boolean;
  problemDescription: boolean;
  attemptedAction: boolean;
  expectedBehavior: boolean;
  actualBehavior: boolean;
  errorMessage: boolean;
  reproductionSteps: boolean;
  environmentInformation: boolean;
  evidenceAvailable: boolean;
  troubleshootingAttempts: boolean;
  confidence: number;
  missingInformation: string[];
  caseReadyForResolution: boolean;
  caseReadyForHandoff: boolean;
  isVagueStatement: boolean;
  investigationRound: number;
};

export type HandoffPolicyDecision = {
  action: "none" | "investigate" | "operational" | "definitive";
  handoffMode: AiHandoffMode;
  handoffReason?: AiHandoffReason;
  investigationQuestion?: string;
  blockReason?: string;
  skipLegacyOutOfHours?: boolean;
};

export type AiTriageConfig = {
  maxInvestigationRounds: number;
  minConfidenceForHandoff: number;
  allowOperationalHandoffOutsideHours: boolean;
  allowAiDuringOperationalHandoff: boolean;
  blockDefinitiveHandoffOutsideHours: boolean;
  transcribeOnlyWhenAiActive: boolean;
  allowManualTranscription: boolean;
  markReadWhenAiResponds: boolean;
};

export const DEFAULT_TRIAGE_CONFIG: AiTriageConfig = {
  maxInvestigationRounds: 4,
  minConfidenceForHandoff: 0.45,
  allowOperationalHandoffOutsideHours: true,
  allowAiDuringOperationalHandoff: true,
  blockDefinitiveHandoffOutsideHours: true,
  transcribeOnlyWhenAiActive: true,
  allowManualTranscription: true,
  markReadWhenAiResponds: true
};
