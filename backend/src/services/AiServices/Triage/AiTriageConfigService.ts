import { GetCompanySetting } from "../../../helpers/CheckSettings";
import { AiTriageConfig, DEFAULT_TRIAGE_CONFIG } from "./AiTriageTypes";

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const getAiTriageConfig = async (
  companyId: number
): Promise<AiTriageConfig> => {
  const [
    maxInvestigationRounds,
    minConfidenceForHandoff,
    allowOperationalHandoffOutsideHours,
    allowAiDuringOperationalHandoff,
    blockDefinitiveHandoffOutsideHours,
    transcribeOnlyWhenAiActive,
    allowManualTranscription,
    markReadWhenAiResponds
  ] = await Promise.all([
    GetCompanySetting(companyId, "aiTriageMaxInvestigationRounds", "4"),
    GetCompanySetting(companyId, "aiTriageMinConfidenceForHandoff", "0.45"),
    GetCompanySetting(
      companyId,
      "aiTriageAllowOperationalHandoffOutsideHours",
      "enabled"
    ),
    GetCompanySetting(
      companyId,
      "aiTriageAllowAiDuringOperationalHandoff",
      "enabled"
    ),
    GetCompanySetting(
      companyId,
      "aiTriageBlockDefinitiveHandoffOutsideHours",
      "enabled"
    ),
    GetCompanySetting(companyId, "aiTranscribeOnlyWhenAiActive", "enabled"),
    GetCompanySetting(companyId, "aiAllowManualTranscription", "enabled"),
    GetCompanySetting(companyId, "aiMarkReadWhenAiResponds", "enabled")
  ]);

  return {
    maxInvestigationRounds: parseNumber(
      maxInvestigationRounds,
      DEFAULT_TRIAGE_CONFIG.maxInvestigationRounds
    ),
    minConfidenceForHandoff: parseNumber(
      minConfidenceForHandoff,
      DEFAULT_TRIAGE_CONFIG.minConfidenceForHandoff
    ),
    allowOperationalHandoffOutsideHours:
      allowOperationalHandoffOutsideHours !== "disabled",
    allowAiDuringOperationalHandoff:
      allowAiDuringOperationalHandoff !== "disabled",
    blockDefinitiveHandoffOutsideHours:
      blockDefinitiveHandoffOutsideHours !== "disabled",
    transcribeOnlyWhenAiActive: transcribeOnlyWhenAiActive !== "disabled",
    allowManualTranscription: allowManualTranscription !== "disabled",
    markReadWhenAiResponds: markReadWhenAiResponds !== "disabled"
  };
};
