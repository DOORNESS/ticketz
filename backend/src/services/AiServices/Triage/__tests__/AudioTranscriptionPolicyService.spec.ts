import Ticket from "../../../../models/Ticket";
import { evaluateAudioTranscriptionPolicy } from "../AudioTranscriptionPolicyService";

jest.mock("../AiTriageFeatureFlag", () => ({
  isTriageV2EnabledForCompany: async () => true
}));

jest.mock("../AiTriageConfigService", () => ({
  getAiTriageConfig: async () => ({
    maxInvestigationRounds: 4,
    minConfidenceForHandoff: 0.45,
    allowOperationalHandoffOutsideHours: true,
    allowAiDuringOperationalHandoff: true,
    blockDefinitiveHandoffOutsideHours: true,
    transcribeOnlyWhenAiActive: true,
    allowManualTranscription: true,
    markReadWhenAiResponds: true
  })
}));

describe("AudioTranscriptionPolicyService", () => {
  it("skips automatic transcription when a human owns the ticket", async () => {
    const ticket = {
      id: 1,
      companyId: 1,
      userId: 42,
      aiHandoff: true,
      aiHandoffMode: "definitive"
    } as Ticket;

    const decision = await evaluateAudioTranscriptionPolicy({ ticket });

    expect(decision.shouldTranscribe).toBe(false);
    expect(decision.reason).toBe("human_mode");
  });

  it("allows transcription for AI-exclusive tickets", async () => {
    const ticket = {
      id: 2,
      companyId: 1,
      userId: null,
      aiAgentId: 7,
      aiHandoff: false
    } as Ticket;

    const decision = await evaluateAudioTranscriptionPolicy({ ticket });

    expect(decision.shouldTranscribe).toBe(true);
    expect(decision.reason).toBe("ai_exclusive");
  });
});
