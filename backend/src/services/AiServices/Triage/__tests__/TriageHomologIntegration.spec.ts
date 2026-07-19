import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { evaluateHandoffPolicy } from "../HandoffPolicyService";
import { evaluateAudioTranscriptionPolicy } from "../AudioTranscriptionPolicyService";
import { canAiEngageTicket } from "../../AiHelpers";
import Ticket from "../../../../models/Ticket";

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

jest.mock("../AiTriageFeatureFlag", () => ({
  isTriageV2EnabledForCompany: async () => true
}));

jest.mock("../../AiScheduleContextService", () => ({
  getAiScheduleContext: async () => ({
    inBusinessHours: false,
    humanAvailable: false
  })
}));

const buildTicket = (overrides: Partial<Ticket> = {}): Ticket =>
  ({
    id: 100,
    companyId: 1,
    userId: null,
    aiHandoff: false,
    aiHandoffMode: null,
    aiPaused: false,
    aiAgentId: 7,
    status: "pending",
    ...overrides
  }) as Ticket;

describe("Triage homolog scenarios", () => {
  it("scenario A/B: vague messages investigate instead of handoff", async () => {
    for (const text of ["Olá", "Estou com um problema.", "Não consigo entrar."]) {
      const decision = await evaluateHandoffPolicy({
        ticket: buildTicket(),
        userText: text,
        conversationText: `user: ${text}`
      });
      expect(decision.action).toBe("investigate");
      expect(decision.handoffMode).toBe("none");
    }
  });

  it("scenario E: no_knowledge on vague case still investigates first", async () => {
    const decision = await evaluateHandoffPolicy({
      ticket: buildTicket({ aiInvestigationRound: 0 } as any),
      userText: "Não consigo entrar.",
      conversationText: "user: Não consigo entrar.",
      proposedReason: "no_knowledge_found"
    });
    expect(decision.action).toBe("investigate");
  });

  it("operational handoff keeps AI engaged outside hours", () => {
    const ticket = buildTicket({
      aiHandoff: true,
      aiHandoffMode: "operational",
      aiPaused: false,
      status: "pending"
    });
    expect(canAiEngageTicket(ticket)).toBe(true);
  });

  it("human-owned ticket skips automatic transcription", async () => {
    const ticket = buildTicket({
      userId: 42,
      status: "open",
      aiHandoff: true,
      aiHandoffMode: "definitive"
    });
    const decision = await evaluateAudioTranscriptionPolicy({ ticket });
    expect(decision.shouldTranscribe).toBe(false);
    expect(decision.reason).toBe("human_mode");
  });

  it("manual transcription allowed for human ticket when forced", async () => {
    const ticket = buildTicket({ userId: 42, status: "open" });
    const decision = await evaluateAudioTranscriptionPolicy({
      ticket,
      requestedByUserId: 42,
      force: true
    });
    expect(decision.shouldTranscribe).toBe(true);
    expect(decision.reason).toBe("manual_request");
  });
});

describe("Outbound audio codec validation", () => {
  it("converts panel mp3 to valid ogg/opus with audible duration", () => {
    const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ticketz-audio-"));
    const input = path.join(tmpDir, "audio-record-site-test.mp3");
    const output = path.join(tmpDir, "converted.ogg");

    execSync(
      `"${ffmpeg}" -y -f lavfi -i sine=frequency=440:duration=3 -ac 1 -ar 16000 "${input}"`,
      { stdio: "ignore" }
    );

    const stats = fs.statSync(input);
    expect(stats.size).toBeGreaterThan(256);

    execSync(
      `"${ffmpeg}" -y -i "${input}" -vn -ar 16000 -ac 1 -c:a libopus -b:a 24k "${output}"`,
      { stdio: "ignore" }
    );

    const probe = execSync(`"${ffmpeg}" -hide_banner -i "${output}" 2>&1 || true`, {
      encoding: "utf8"
    });
    expect(probe).toMatch(/Duration:/);
    expect(probe.toLowerCase()).toMatch(/ogg|opus/);
    expect(fs.statSync(output).size).toBeGreaterThan(256);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
