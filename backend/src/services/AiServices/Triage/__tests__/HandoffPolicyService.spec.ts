import Ticket from "../../../../models/Ticket";
import { AI_HANDOFF_REASONS } from "../../AiOperationalTypes";
import { evaluateHandoffPolicy } from "../HandoffPolicyService";

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

jest.mock("../../AiScheduleContextService", () => ({
  getAiScheduleContext: async () => ({
    inBusinessHours: false,
    humanAvailable: false
  })
}));

const buildTicket = (): Ticket =>
  ({
    id: 1,
    companyId: 1,
    aiInvestigationRound: 0
  }) as Ticket;

describe("HandoffPolicyService", () => {
  it("investigates vague customer statements instead of handoff", async () => {
    const decision = await evaluateHandoffPolicy({
      ticket: buildTicket(),
      userText: "Estou com um problema.",
      conversationText: "user: Estou com um problema."
    });

    expect(decision.action).toBe("investigate");
    expect(decision.handoffMode).toBe("none");
  });

  it("uses operational handoff outside hours for explicit human request", async () => {
    const decision = await evaluateHandoffPolicy({
      ticket: buildTicket(),
      userText: "Quero falar com um atendente humano agora.",
      conversationText: "user: Quero falar com um atendente humano agora."
    });

    expect(decision.action).toBe("operational");
    expect(decision.handoffReason).toBe(
      AI_HANDOFF_REASONS.customer_requested_human
    );
    expect(decision.skipLegacyOutOfHours).toBe(true);
  });

  it("blocks immediate handoff for transient provider errors", async () => {
    const decision = await evaluateHandoffPolicy({
      ticket: buildTicket(),
      userText: "Meu sistema não abre.",
      conversationText: "user: Meu sistema não abre.",
      providerError: { status: 429, message: "rate limit" }
    });

    expect(decision.action).toBe("none");
    expect(decision.blockReason).toBe("transient_provider_error");
  });

  it("investigates before no_knowledge handoff on vague messages", async () => {
    const decision = await evaluateHandoffPolicy({
      ticket: buildTicket(),
      userText: "Não consigo entrar.",
      conversationText: "user: Não consigo entrar.",
      proposedReason: AI_HANDOFF_REASONS.no_knowledge_found
    });

    expect(decision.action).toBe("investigate");
  });
});
