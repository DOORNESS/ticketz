/**
 * Wire Fortmax (Web G3) and Nível Cashback WhatsApp lines to the correct
 * queues, agents and knowledge bases.
 *
 * Usage:
 *   COMPANY_ID=1 npm run wire:support-lines
 */
import "../src/bootstrap";
import { Op } from "sequelize";
import Company from "../src/models/Company";
import Queue from "../src/models/Queue";
import Whatsapp from "../src/models/Whatsapp";
import AiAgent from "../src/models/AiAgent";
import AiAgentQueue from "../src/models/AiAgentQueue";
import KnowledgeBase from "../src/models/KnowledgeBase";
import KnowledgeDomain from "../src/models/KnowledgeDomain";
import Ticket from "../src/models/Ticket";
import { syncAgentKnowledgeBases } from "../src/services/AiServices/AiAgentKnowledgeBaseService";
import { syncExclusiveAgentQueueLinks } from "../src/services/AiServices/syncExclusiveAgentQueueLinks";
import AssociateWhatsappQueue from "../src/services/WhatsappService/AssociateWhatsappQueue";
import { logger } from "../src/utils/logger";

const COMPANY_ID = Number(process.env.COMPANY_ID || 1);

const FORTMAX_PROMPT = `Você é o Webin, assistente virtual da Fortmax Sistemas.
Quando perguntarem seu nome, responda: "Me chamo Webin, Assistente Virtual da Fortmax."
Responda sobre produtos Fortmax (WebG3, FortControl etc.) usando apenas a base de conhecimento Fortmax.
Nunca fale como Nível Cashback. Se o assunto for Nível Cashback, informe que esse canal é da Fortmax.`;

const NIVEL_PROMPT = `Você é o Nivelton, assistente virtual da Nível Cashback.
Quando perguntarem seu nome, responda: "Me chamo Nivelton, assistente da Nível Cashback."
Responda apenas com base nas bases de conhecimento da Nível (clientes e empresas).
Nunca fale como Fortmax, WebG3 ou FortControl. Se o assunto for Fortmax/WebG3, informe que este canal é da Nível Cashback.`;

type NamedModel = {
  findOne: (options: object) => Promise<{
    id: number;
    name: string;
    knowledgeDomainId?: number;
    basePrompt?: string;
    fallbackQueueId?: number;
    update: (values: object) => Promise<unknown>;
  } | null>;
  create: (values: object) => Promise<{ id: number; name: string }>;
};

const findByNameLoose = async (
  model: NamedModel,
  companyId: number,
  patterns: string[],
  extraWhere: Record<string, unknown> = {}
) => {
  const matches = await Promise.all(
    patterns.map(pattern =>
      model.findOne({
        where: {
          companyId,
          name: { [Op.iLike]: `%${pattern}%` },
          ...extraWhere
        },
        order: [["id", "ASC"]]
      })
    )
  );

  return matches.find(Boolean) || null;
};

const removeAgentFromQueue = async (
  companyId: number,
  queueId: number,
  keepAgentId: number
): Promise<void> => {
  await AiAgentQueue.destroy({
    where: {
      companyId,
      queueId,
      aiAgentId: { [Op.ne]: keepAgentId }
    }
  });
};

const repairOpenTickets = async (
  whatsappId: number,
  queueId: number
): Promise<number> => {
  const [updated] = await Ticket.update(
    { queueId },
    {
      where: {
        whatsappId,
        status: { [Op.in]: ["open", "pending"] }
      }
    }
  );
  return updated;
};

const wireFortmaxLine = async (companyId: number) => {
  const fortmaxDomain =
    (await findByNameLoose(KnowledgeDomain, companyId, ["fortmax"])) ||
    (await KnowledgeDomain.create({
      companyId,
      name: "Fortmax",
      slug: "fortmax",
      active: true,
      sortOrder: 10
    }));

  const fortmaxBase =
    (await findByNameLoose(KnowledgeBase, companyId, [
      "fortmax site",
      "suporte webg3",
      "webg3"
    ])) ||
    (await KnowledgeBase.create({
      companyId,
      name: "Fortmax Site",
      description: "Conteúdo institucional e suporte Fortmax/WebG3",
      knowledgeDomainId: fortmaxDomain.id,
      active: true
    }));

  if (!fortmaxBase.knowledgeDomainId) {
    await fortmaxBase.update({ knowledgeDomainId: fortmaxDomain.id });
  }

  const queue =
    (await findByNameLoose(Queue, companyId, [
      "suporte fortmax",
      "suporte webg3",
      "central de atendimento"
    ])) ||
    (await Queue.create({
      companyId,
      name: "Suporte Fortmax",
      color: "#4CAF50",
      greetingMessage: ""
    }));

  let agent =
    (await findByNameLoose(AiAgent, companyId, [
      "atendimento geral fortmax",
      "webin",
      "atendente inicial fortmax"
    ])) ||
    (await AiAgent.create({
      companyId,
      name: "Webin Fortmax",
      active: true,
      role: "legacy",
      provider: "openai",
      textModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
      basePrompt: FORTMAX_PROMPT,
      temperature: 0.3,
      maxTokens: 1024,
      fallbackQueueId: queue.id,
      handoffMessage:
        "Vou transferir você para um atendente humano da Fortmax. Por favor, aguarde.",
      ackEnabled: false
    }));

  await agent.update({
    active: true,
    basePrompt: agent.basePrompt?.includes("Nivelton")
      ? FORTMAX_PROMPT
      : agent.basePrompt || FORTMAX_PROMPT,
    fallbackQueueId: queue.id
  });

  await syncAgentKnowledgeBases({
    companyId,
    aiAgentId: agent.id,
    knowledgeBaseIds: [fortmaxBase.id]
  });

  await syncExclusiveAgentQueueLinks({
    companyId,
    aiAgentId: agent.id,
    queueLinks: [{ queueId: queue.id, knowledgeBaseId: fortmaxBase.id }]
  });

  const whatsapp =
    (await findByNameLoose(
      Whatsapp,
      companyId,
      ["web g3", "webg3", "fortmax"],
      { channel: "whatsapp" }
    )) ||
    (await Whatsapp.findOne({
      where: { companyId, channel: "whatsapp", isDefault: true }
    }));

  if (!whatsapp) {
    throw new Error("Fortmax WhatsApp connection not found");
  }

  await AssociateWhatsappQueue(whatsapp, [queue.id]);
  await removeAgentFromQueue(companyId, queue.id, agent.id);
  const ticketsFixed = await repairOpenTickets(whatsapp.id, queue.id);

  return {
    domain: fortmaxDomain,
    base: fortmaxBase,
    queue,
    agent,
    whatsapp,
    ticketsFixed
  };
};

const wireNivelLine = async (companyId: number) => {
  const nivelDomain =
    (await findByNameLoose(KnowledgeDomain, companyId, [
      "nivel cashback",
      "nível cashback"
    ])) ||
    (await KnowledgeDomain.create({
      companyId,
      name: "Nível Cashback",
      slug: "nivel-cashback",
      active: true,
      sortOrder: 20
    }));

  const clientBase =
    (await findByNameLoose(KnowledgeBase, companyId, [
      "nivel site clientes",
      "nível site clientes"
    ])) ||
    (await KnowledgeBase.create({
      companyId,
      name: "Nivel site clientes",
      description: "FAQ clientes Nível Cashback",
      knowledgeDomainId: nivelDomain.id,
      active: true
    }));

  const empresaBase =
    (await findByNameLoose(KnowledgeBase, companyId, [
      "nivel empresa",
      "nível empresa"
    ])) ||
    (await KnowledgeBase.create({
      companyId,
      name: "Nivel empresa",
      description: "FAQ empresas Nível Cashback",
      knowledgeDomainId: nivelDomain.id,
      active: true
    }));

  for (const base of [clientBase, empresaBase]) {
    if (!base.knowledgeDomainId) {
      await base.update({ knowledgeDomainId: nivelDomain.id });
    }
  }

  const queue =
    (await findByNameLoose(Queue, companyId, ["suporte nivel", "suporte nível"])) ||
    (await Queue.create({
      companyId,
      name: "Suporte Nível",
      color: "#2196F3",
      greetingMessage: ""
    }));

  let agent =
    (await findByNameLoose(AiAgent, companyId, [
      "agente nivel cashback",
      "nivelton"
    ])) ||
    (await AiAgent.create({
      companyId,
      name: "Nivelton",
      active: true,
      role: "legacy",
      provider: "openai",
      textModel: "gpt-4o-mini",
      visionModel: "gpt-4o-mini",
      transcriptionModel: "gpt-4o-mini-transcribe",
      basePrompt: NIVEL_PROMPT,
      temperature: 0.3,
      maxTokens: 1024,
      fallbackQueueId: queue.id,
      handoffMessage:
        "Vou transferir você para um atendente humano da Nível. Por favor, aguarde.",
      ackEnabled: false
    }));

  await agent.update({
    active: true,
    basePrompt: NIVEL_PROMPT,
    fallbackQueueId: queue.id
  });

  await syncAgentKnowledgeBases({
    companyId,
    aiAgentId: agent.id,
    knowledgeBaseIds: [clientBase.id, empresaBase.id]
  });

  await syncExclusiveAgentQueueLinks({
    companyId,
    aiAgentId: agent.id,
    queueLinks: [{ queueId: queue.id, knowledgeBaseId: clientBase.id }]
  });

  const whatsapp =
    (await findByNameLoose(
      Whatsapp,
      companyId,
      ["nivel velo", "nível velo", "nivel cashback"],
      { channel: "whatsapp" }
    )) ||
    (await Whatsapp.create({
      companyId,
      name: "Nível Velo",
      status: "OPENING",
      channel: "whatsapp",
      provider: "beta",
      token: "",
      isDefault: false,
      language: "pt"
    }));

  await AssociateWhatsappQueue(whatsapp, [queue.id]);
  await removeAgentFromQueue(companyId, queue.id, agent.id);
  const ticketsFixed = await repairOpenTickets(whatsapp.id, queue.id);

  return {
    domain: nivelDomain,
    bases: [clientBase, empresaBase],
    queue,
    agent,
    whatsapp,
    ticketsFixed
  };
};

const run = async (): Promise<void> => {
  const company = await Company.findByPk(COMPANY_ID);
  if (!company) {
    throw new Error(`Company ${COMPANY_ID} not found`);
  }

  const fortmax = await wireFortmaxLine(COMPANY_ID);
  const nivel = await wireNivelLine(COMPANY_ID);

  const summary = {
    ok: true,
    companyId: COMPANY_ID,
    fortmax: {
      whatsapp: { id: fortmax.whatsapp.id, name: fortmax.whatsapp.name },
      queue: { id: fortmax.queue.id, name: fortmax.queue.name },
      agent: { id: fortmax.agent.id, name: fortmax.agent.name },
      domain: fortmax.domain.name,
      base: fortmax.base.name,
      ticketsFixed: fortmax.ticketsFixed
    },
    nivel: {
      whatsapp: { id: nivel.whatsapp.id, name: nivel.whatsapp.name },
      queue: { id: nivel.queue.id, name: nivel.queue.name },
      agent: { id: nivel.agent.id, name: nivel.agent.name },
      domain: nivel.domain.name,
      bases: nivel.bases.map(base => base.name),
      ticketsFixed: nivel.ticketsFixed
    }
  };

  logger.info(summary, "Support lines wired");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
};

run()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error({ error }, "Failed to wire support lines");
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
