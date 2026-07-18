import AiAgent from "../../models/AiAgent";
import AiRoutingLog from "../../models/AiRoutingLog";
import { chatCompletion } from "./ModelGateway";
import { assertOrchestratorConfigReady } from "./AiOrchestratorConfig";
import { logger } from "../../utils/logger";

export type OrchestratorCandidate = {
  agentId: number;
  name: string;
  specialty: string;
  description: string;
  priority: number;
  keywordScore?: number;
};

export type OrchestratorResult = {
  agent: AiAgent;
  confidence: number;
  reason: string;
  fallbackUsed: boolean;
  rerouted: boolean;
  routingLogId: number;
  candidates: OrchestratorCandidate[];
  model: string;
};

export type RunOrchestratorInput = {
  companyId: number;
  ticketId?: number;
  messageId?: string;
  userText: string;
  conversationSummary?: string;
  rerouted?: boolean;
};

const DEFAULT_SPECIALTY_KEYWORDS: Record<string, string[]> = {
  financeiro: [
    "pix",
    "boleto",
    "pagamento",
    "pagar",
    "cobranca",
    "cobrança",
    "extrato",
    "fatura",
    "carteira",
    "cashback",
    "saldo",
    "recebimento",
    "transferencia",
    "transferência"
  ],
  suporte: [
    "erro",
    "bug",
    "nao funciona",
    "não funciona",
    "travou",
    "login",
    "acesso",
    "cloudflare",
    "turnstile",
    "site",
    "app",
    "android",
    "iphone",
    "webview",
    "log",
    "instalacao",
    "instalação",
    "configurar"
  ],
  faq: [
    "horario",
    "horário",
    "funciona",
    "como funciona",
    "telefone",
    "endereco",
    "endereço",
    "contato",
    "o que e",
    "o que é",
    "quem sao",
    "quem são"
  ],
  geral: ["oi", "ola", "olá", "bom dia", "boa tarde", "boa noite", "ajuda"]
};

const TOPIC_SHIFT_MARKERS = [
  "outra coisa",
  "mudando de assunto",
  "agora sobre",
  "diferente disso",
  "falando de outra",
  "esquece isso",
  "novo assunto"
];

export const sanitizeRoutingMessage = (text: string, maxLen = 240): string =>
  text
    .replace(/sk-[a-zA-Z0-9]+/g, "[MASKED_KEY]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[MASKED_CPF]")
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[MASKED_CNPJ]")
    .trim()
    .slice(0, maxLen);

const normalizeText = (text: string): string =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const parseKeywords = (agent: AiAgent): string[] => {
  const custom = Array.isArray(agent.routingKeywords)
    ? agent.routingKeywords
    : [];
  const specialtyDefaults =
    DEFAULT_SPECIALTY_KEYWORDS[String(agent.specialty || "").toLowerCase()] ||
    [];

  return [
    ...new Set([...custom, ...specialtyDefaults].map(k => normalizeText(k)))
  ];
};

export const detectTopicShift = (message: string): boolean => {
  const lower = normalizeText(message);
  return TOPIC_SHIFT_MARKERS.some(marker => lower.includes(marker));
};

export const scoreSpecialtyKeywords = (
  message: string,
  agents: AiAgent[]
): OrchestratorCandidate[] => {
  const lower = normalizeText(message);

  return agents
    .map(agent => {
      const keywords = parseKeywords(agent);
      let keywordScore = 0;

      keywords.forEach(keyword => {
        if (keyword && lower.includes(keyword)) {
          keywordScore += keyword.length >= 6 ? 2 : 1;
        }
      });

      if (/\berro\b/.test(lower) && agent.specialty === "suporte") {
        keywordScore += 2;
      }

      if (/\bpix\b/.test(lower) && agent.specialty === "financeiro") {
        keywordScore += 2;
      }

      return {
        agentId: agent.id,
        name: agent.name,
        specialty: agent.specialty || "geral",
        description: agent.routingDescription || "",
        priority: agent.priority ?? 100,
        keywordScore
      };
    })
    .sort((a, b) => {
      const scoreDiff = (b.keywordScore || 0) - (a.keywordScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return a.priority - b.priority;
    });
};

const resolveGeneralAgent = async (
  companyId: number,
  specialists: AiAgent[]
): Promise<AiAgent | null> => {
  const general =
    specialists.find(agent => agent.specialty === "geral") ||
    specialists.find(agent => /geral/i.test(agent.name));

  if (general) return general;

  return specialists.sort((a, b) => a.priority - b.priority)[0] || null;
};

const parseOrchestratorJson = (
  content: string
): {
  agentId?: number;
  specialty?: string;
  confidence?: number;
  reason?: string;
} | null => {
  try {
    const trimmed = content.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;
    return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
};

export const runDeterministicRouting = async (
  companyId: number,
  userText: string,
  specialists: AiAgent[]
): Promise<{
  agent: AiAgent;
  confidence: number;
  reason: string;
  candidates: OrchestratorCandidate[];
}> => {
  const candidates = scoreSpecialtyKeywords(userText, specialists);
  const top = candidates[0];
  const second = candidates[1];

  const generalAgent = await resolveGeneralAgent(companyId, specialists);

  if (!top || (top.keywordScore || 0) === 0) {
    if (!generalAgent) {
      throw new Error(
        "No specialist agents configured for orchestrator routing"
      );
    }
    return {
      agent: generalAgent,
      confidence: 0.35,
      reason:
        "Nenhuma palavra-chave identificada; encaminhado para Atendimento Geral",
      candidates
    };
  }

  if (
    second &&
    (top.keywordScore || 0) > 0 &&
    top.keywordScore === second.keywordScore
  ) {
    if (!generalAgent) {
      const selected = specialists.find(agent => agent.id === top.agentId);
      if (!selected) throw new Error("Top candidate agent not found");
      return {
        agent: selected,
        confidence: 0.45,
        reason: `Empate entre ${top.specialty} e ${second.specialty}; prioridade aplicada`,
        candidates
      };
    }
    return {
      agent: generalAgent,
      confidence: 0.4,
      reason: `Empate entre especialidades (${top.specialty}/${second.specialty}); Atendimento Geral`,
      candidates
    };
  }

  const selected = specialists.find(agent => agent.id === top.agentId);
  if (!selected) {
    if (!generalAgent) {
      throw new Error("Selected specialist not found");
    }
    return {
      agent: generalAgent,
      confidence: 0.35,
      reason: "Candidato inválido; fallback para Atendimento Geral",
      candidates
    };
  }

  const confidence = Math.min(0.95, 0.55 + (top.keywordScore || 0) * 0.08);
  return {
    agent: selected,
    confidence,
    reason: `Palavras-chave indicam ${selected.specialty || selected.name}`,
    candidates
  };
};

export const runOrchestrator = async (
  input: RunOrchestratorInput
): Promise<OrchestratorResult> => {
  const config = assertOrchestratorConfigReady();
  const startedAt = Date.now();

  const specialists = await AiAgent.findAll({
    where: { companyId: input.companyId, active: true, role: "specialist" },
    order: [
      ["priority", "ASC"],
      ["id", "ASC"]
    ]
  });

  if (!specialists.length) {
    throw new Error("No active specialist agents configured");
  }

  const candidatePayload = specialists.map(agent => ({
    agentId: agent.id,
    name: agent.name,
    specialty: agent.specialty || "geral",
    description: agent.routingDescription || "",
    priority: agent.priority ?? 100
  }));

  let selectedAgent: AiAgent | null = null;
  let confidence = 0;
  let reason = "";
  let fallbackUsed = false;
  let candidates = candidatePayload;

  try {
    const systemPrompt = `Você é o roteador de atendimento. Escolha EXATAMENTE UM agente especialista.
Responda SOMENTE JSON válido:
{"agentId": number, "specialty": string, "confidence": number, "reason": string}
Agentes disponíveis:
${JSON.stringify(candidatePayload)}
Se houver dúvida, escolha o agente de specialty "geral".
Nunca escolha role orchestrator.`;

    const userPrompt = [
      input.conversationSummary
        ? `Resumo da conversa:\n${input.conversationSummary}`
        : "",
      `Mensagem atual:\n${input.userText}`
    ]
      .filter(Boolean)
      .join("\n\n");

    const completionPromise = chatCompletion(input.companyId, {
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      providerId: config.provider,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("ORCHESTRATOR_TIMEOUT")),
        config.timeoutMs
      );
    });

    const completion = await Promise.race([completionPromise, timeoutPromise]);
    const parsed = parseOrchestratorJson(completion.content || "");

    if (parsed?.agentId) {
      selectedAgent =
        specialists.find(agent => agent.id === Number(parsed.agentId)) || null;
      confidence = Number(parsed.confidence);
      reason = String(parsed.reason || "Classificação via orquestrador");
    }

    if (
      !selectedAgent ||
      !Number.isFinite(confidence) ||
      confidence < config.confidenceThreshold ||
      selectedAgent.role !== "specialist"
    ) {
      fallbackUsed = true;
      const deterministic = await runDeterministicRouting(
        input.companyId,
        input.userText,
        specialists
      );
      selectedAgent = deterministic.agent;
      confidence = deterministic.confidence;
      reason = `Fallback determinístico: ${deterministic.reason}`;
      candidates = deterministic.candidates;
    }
  } catch (error) {
    fallbackUsed = true;
    logger.warn(
      { error, companyId: input.companyId },
      "Orchestrator LLM failed"
    );
    const deterministic = await runDeterministicRouting(
      input.companyId,
      input.userText,
      specialists
    );
    selectedAgent = deterministic.agent;
    confidence = deterministic.confidence;
    reason = `Fallback determinístico após erro: ${deterministic.reason}`;
    candidates = deterministic.candidates;
  }

  if (!selectedAgent) {
    selectedAgent = await resolveGeneralAgent(input.companyId, specialists);
    confidence = 0.3;
    reason = "Fallback final para Atendimento Geral";
    fallbackUsed = true;
  }

  const latencyMs = Date.now() - startedAt;

  const routingLog = await AiRoutingLog.create({
    companyId: input.companyId,
    ticketId: input.ticketId || null,
    messageId: input.messageId || null,
    userMessageSummary: sanitizeRoutingMessage(input.userText),
    orchestratorModel: config.model,
    selectedAgentId: selectedAgent.id,
    selectedSpecialty: selectedAgent.specialty,
    confidence,
    reason,
    candidates,
    fallbackUsed,
    rerouted: input.rerouted === true,
    latencyMs
  });

  return {
    agent: selectedAgent,
    confidence,
    reason,
    fallbackUsed,
    rerouted: input.rerouted === true,
    routingLogId: routingLog.id,
    candidates,
    model: config.model
  };
};

export const findOrchestratorAgent = async (
  companyId: number
): Promise<AiAgent | null> =>
  AiAgent.findOne({
    where: { companyId, active: true, role: "orchestrator" }
  });

export const findSpecialistAgents = async (
  companyId: number
): Promise<AiAgent[]> =>
  AiAgent.findAll({
    where: { companyId, active: true, role: "specialist" },
    order: [
      ["priority", "ASC"],
      ["id", "ASC"]
    ]
  });

export const previewOrchestratorRouting = async (
  companyId: number,
  message: string,
  conversationSummary?: string
): Promise<OrchestratorResult> =>
  runOrchestrator({
    companyId,
    userText: message,
    conversationSummary
  });
