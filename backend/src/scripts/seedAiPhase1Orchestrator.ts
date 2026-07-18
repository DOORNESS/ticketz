/**
 * Idempotent seed for AI Phase 1 orchestrator structure.
 *
 * Usage:
 *   COMPANY_ID=<companyId> npx ts-node --transpile-only src/scripts/seedAiPhase1Orchestrator.ts
 *
 * Optional model env vars (or copied from an existing legacy agent):
 *   AI_SEED_TEXT_MODEL, AI_SEED_VISION_MODEL, AI_SEED_TRANSCRIPTION_MODEL, AI_SEED_PROVIDER
 *
 * Does NOT create fake documents or knowledge bases.
 * Links existing knowledge bases by name when found.
 */
import "../bootstrap";
import sequelize from "../database";
import AiAgent from "../models/AiAgent";
import KnowledgeBase from "../models/KnowledgeBase";
import { syncAgentKnowledgeBases } from "../services/AiServices/AiAgentKnowledgeBaseService";

const companyId = Number(process.env.COMPANY_ID);
if (!Number.isFinite(companyId) || companyId <= 0) {
  console.error("COMPANY_ID env var is required (positive integer)");
  process.exit(1);
}

type SpecialistSeed = {
  name: string;
  specialty: string;
  routingDescription: string;
  routingKeywords: string[];
  priority: number;
  baseNameHints: string[];
  basePrompt: string;
};

const SPECIALISTS: SpecialistSeed[] = [
  {
    name: "FAQ",
    specialty: "faq",
    routingDescription:
      "Perguntas frequentes, horários, contatos e informações gerais.",
    routingKeywords: ["horario", "telefone", "como funciona", "faq"],
    priority: 20,
    baseNameHints: ["faq"],
    basePrompt: "Responda com base na FAQ oficial, de forma objetiva."
  },
  {
    name: "Financeiro",
    specialty: "financeiro",
    routingDescription:
      "Pagamentos, PIX, boletos, cobranças, extratos e saldo.",
    routingKeywords: ["pix", "boleto", "pagamento", "cobranca", "extrato"],
    priority: 30,
    baseNameHints: ["financeiro", "finance", "pagamento"],
    basePrompt: "Você é especialista financeiro da Fortmax."
  },
  {
    name: "Suporte Técnico",
    specialty: "suporte",
    routingDescription:
      "Erros, login, integrações, apps, sites e configurações técnicas.",
    routingKeywords: ["erro", "login", "site", "app", "cloudflare", "bug"],
    priority: 40,
    baseNameHints: ["suporte", "tecnico", "técnico", "support"],
    basePrompt: "Vocé é suporte técnico da Fortmax."
  },
  {
    name: "Atendimento Geral",
    specialty: "geral",
    routingDescription:
      "Primeiro atendimento e assuntos gerais sem especialidade clara.",
    routingKeywords: ["oi", "ola", "ajuda", "informacao"],
    priority: 100,
    baseNameHints: ["geral", "atendimento"],
    basePrompt:
      "Você faz atendimento inicial cordial e pede detalhes quando necessário."
  }
];

const findKnowledgeBaseByHints = async (hints: string[]): Promise<number[]> => {
  const bases = await KnowledgeBase.findAll({
    where: { companyId, active: true }
  });

  const matches = bases.filter(base => {
    const name = base.name.toLowerCase();
    return hints.some(hint => name.includes(hint.toLowerCase()));
  });

  return matches.map(base => base.id);
};

const resolveSeedModelDefaults = async (): Promise<{
  provider: string;
  textModel: string;
  visionModel: string;
  transcriptionModel: string;
}> => {
  const legacyAgent = await AiAgent.findOne({
    where: { companyId, role: "legacy", active: true },
    order: [["id", "ASC"]]
  });

  const provider =
    process.env.AI_SEED_PROVIDER?.trim() || legacyAgent?.provider || "";
  const textModel =
    process.env.AI_SEED_TEXT_MODEL?.trim() || legacyAgent?.textModel || "";
  const visionModel =
    process.env.AI_SEED_VISION_MODEL?.trim() ||
    legacyAgent?.visionModel ||
    textModel;
  const transcriptionModel =
    process.env.AI_SEED_TRANSCRIPTION_MODEL?.trim() ||
    legacyAgent?.transcriptionModel ||
    textModel;

  if (!provider || !textModel) {
    throw new Error(
      "Configure AI_SEED_PROVIDER and AI_SEED_TEXT_MODEL, or seed after a legacy agent exists"
    );
  }

  return { provider, textModel, visionModel, transcriptionModel };
};

const upsertAgent = async (
  payload: Partial<AiAgent> & { name: string; role: string },
  modelDefaults: Awaited<ReturnType<typeof resolveSeedModelDefaults>>
): Promise<AiAgent> => {
  const existing = await AiAgent.findOne({
    where: { companyId, name: payload.name, role: payload.role }
  });

  if (existing) {
    await existing.update(payload);
    return existing;
  }

  return AiAgent.create({
    companyId,
    active: true,
    provider: modelDefaults.provider,
    textModel: modelDefaults.textModel,
    visionModel: modelDefaults.visionModel,
    transcriptionModel: modelDefaults.transcriptionModel,
    temperature: 0.3,
    maxTokens: 1024,
    ...payload
  } as AiAgent);
};

(async () => {
  await sequelize.authenticate();

  const modelDefaults = await resolveSeedModelDefaults();

  const orchestrator = await upsertAgent(
    {
      name: "Orquestrador Fortmax",
      role: "orchestrator",
      specialty: null,
      routingDescription:
        "Classifica intenção e encaminha para o especialista correto.",
      routingKeywords: null,
      priority: 1,
      basePrompt:
        "Você é o roteador interno. Nunca responda ao cliente final diretamente."
    },
    modelDefaults
  );

  console.log(`Orchestrator ready: id=${orchestrator.id}`);

  for (const spec of SPECIALISTS) {
    const agent = await upsertAgent(
      {
        name: spec.name,
        role: "specialist",
        specialty: spec.specialty,
        routingDescription: spec.routingDescription,
        routingKeywords: spec.routingKeywords,
        priority: spec.priority,
        basePrompt: spec.basePrompt
      },
      modelDefaults
    );

    const kbIds = await findKnowledgeBaseByHints(spec.baseNameHints);
    await syncAgentKnowledgeBases({
      companyId,
      aiAgentId: agent.id,
      knowledgeBaseIds: kbIds
    });

    console.log(
      `Specialist ${spec.name}: id=${agent.id}, linkedKBs=${kbIds.join(",") || "none"}`
    );
  }

  console.log("Seed completed (idempotent). Enable per company:");
  console.log("  AI_ORCHESTRATOR_ENABLED=true");
  console.log("  Setting aiOrchestratorEnabled=enabled for company", companyId);
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
