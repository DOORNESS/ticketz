import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDomain from "../../models/KnowledgeDomain";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import KnowledgeChunk from "../../models/KnowledgeChunk";
import AiAgentKnowledgeBase from "../../models/AiAgentKnowledgeBase";
import {
  findWhatsappByBrand,
  normalizeSupportLineName
} from "./WireSupportLinesService";
import { detectQueueGreetingMismatches } from "./QueueGreetingConsistency";

export type SupportLineBrand = "fortmax" | "nivel";

export type SupportLineAuditIssue = {
  severity: "error" | "warn";
  line: SupportLineBrand | "unknown";
  code: string;
  message: string;
};

export type SupportLineAuditRow = {
  line: SupportLineBrand;
  ok: boolean;
  whatsapp: { id: number; name: string } | null;
  queue: { id: number; name: string } | null;
  agent: { id: number; name: string } | null;
  domain: { id: number; name: string } | null;
  knowledgeBases: Array<{
    id: number;
    name: string;
    domainId: number | null;
    readyDocuments: number;
  }>;
  issues: SupportLineAuditIssue[];
};

export type AuditSupportLinesSummary = {
  ok: boolean;
  companyId: number;
  lines: SupportLineAuditRow[];
};

const FORTMAX_QUEUE_HINTS = ["suporte fortmax", "suporte webg3"];
const NIVEL_QUEUE_HINTS = [
  "suporte consumidor nivel",
  "suporte consumidor nível",
  "suporte nivel",
  "suporte nível"
];
const FORTMAX_DEPARTMENT_HINTS = ["fortmax", "webg3", "web g3"];
const NIVEL_DEPARTMENT_HINTS = ["nivel", "nível"];
const FORTMAX_DOMAIN_HINTS = ["fortmax"];
const NIVEL_DOMAIN_HINTS = ["nivel cashback", "nível cashback", "nivel"];
const FORTMAX_AGENT_HINTS = ["webin", "fortmax"];
const NIVEL_AGENT_HINTS = ["nivelton", "nivel cashback"];

const matchesAnyHint = (value: string, hints: string[]): boolean => {
  const normalized = normalizeSupportLineName(value);
  return hints.some(hint =>
    normalized.includes(normalizeSupportLineName(hint))
  );
};

const countReadyDocuments = async (
  companyId: number,
  knowledgeBaseId: number
): Promise<number> => {
  const [legacyDocuments, cmsAssets] = await Promise.all([
    KnowledgeDocument.count({
      where: {
        companyId,
        knowledgeBaseId,
        status: "ready"
      }
    }),
    KnowledgeChunk.count({
      where: {
        companyId,
        knowledgeBaseId,
        lifecycleStatus: "published"
      },
      distinct: true,
      col: "knowledgeAssetId"
    })
  ]);

  return legacyDocuments + cmsAssets;
};

const auditBrandLine = async (
  companyId: number,
  line: SupportLineBrand
): Promise<SupportLineAuditRow> => {
  const issues: SupportLineAuditIssue[] = [];
  const queueHints =
    line === "fortmax" ? FORTMAX_QUEUE_HINTS : NIVEL_QUEUE_HINTS;
  const domainHints =
    line === "fortmax" ? FORTMAX_DOMAIN_HINTS : NIVEL_DOMAIN_HINTS;
  const agentHints =
    line === "fortmax" ? FORTMAX_AGENT_HINTS : NIVEL_AGENT_HINTS;
  const forbiddenAgentHints =
    line === "fortmax" ? NIVEL_AGENT_HINTS : FORTMAX_AGENT_HINTS;
  const forbiddenQueueHints =
    line === "fortmax" ? NIVEL_QUEUE_HINTS : FORTMAX_QUEUE_HINTS;

  const whatsapp = await findWhatsappByBrand(companyId, line);
  if (!whatsapp) {
    issues.push({
      severity: "error",
      line,
      code: "whatsapp_missing",
      message: `Conexão WhatsApp da linha ${line} não encontrada`
    });

    return {
      line,
      ok: false,
      whatsapp: null,
      queue: null,
      agent: null,
      domain: null,
      knowledgeBases: [],
      issues
    };
  }

  const whatsappWithQueues = await Whatsapp.findByPk(whatsapp.id, {
    include: [{ model: Queue, as: "queues", attributes: ["id", "name"] }]
  });

  const queues = whatsappWithQueues?.queues || [];

  if (queues.length === 0) {
    issues.push({
      severity: "error",
      line,
      code: "whatsapp_without_queue",
      message: `WhatsApp "${whatsapp.name}" não tem fila vinculada`
    });
  }

  const departmentHints =
    line === "fortmax" ? FORTMAX_DEPARTMENT_HINTS : NIVEL_DEPARTMENT_HINTS;
  queues.forEach(linkedQueue => {
    if (!matchesAnyHint(linkedQueue.name, departmentHints)) {
      issues.push({
        severity: "error",
        line,
        code: "queue_brand_mismatch",
        message: `Fila "${linkedQueue.name}" não corresponde à linha ${line}`
      });
    }
  });

  const queue =
    queues.find(linkedQueue => matchesAnyHint(linkedQueue.name, queueHints)) ||
    (queues.length === 1 ? queues[0] : null);

  if (queues.length > 0 && !queue) {
    issues.push({
      severity: "error",
      line,
      code: "support_queue_missing",
      message: `WhatsApp "${whatsapp.name}" não tem a fila principal de suporte ${line}`
    });
  }

  if (queue && !matchesAnyHint(queue.name, queueHints)) {
    issues.push({
      severity: "error",
      line,
      code: "queue_brand_mismatch",
      message: `Fila "${queue.name}" não corresponde à linha ${line}`
    });
  }

  if (queue && matchesAnyHint(queue.name, forbiddenQueueHints)) {
    issues.push({
      severity: "error",
      line,
      code: "queue_cross_brand",
      message: `Fila "${queue.name}" pertence à outra marca`
    });
  }

  // Saudação copiada de outra fila faz o cliente escolher "Recuperar Conta" e
  // ler "Você foi direcionado ao Suporte Empresa". O ticket vai para a fila
  // certa — só o texto mente —, então o sintoma parece bug de roteamento e não
  // aparece em nenhuma outra checagem. É `warn`: o atendimento funciona.
  detectQueueGreetingMismatches(
    queues.map(item => ({
      id: item.id,
      name: item.name,
      greetingMessage: item.greetingMessage
    }))
  ).forEach(mismatch => {
    issues.push({
      severity: "warn",
      line,
      code: "queue_greeting_announces_other_queue",
      message: `Fila "${mismatch.queueName}" tem saudação anunciando "${mismatch.announcedQueueName}". Corrija o texto em Administração → Filas.`
    });
  });

  const secondaryQueues = queues.filter(
    linkedQueue => linkedQueue.id !== queue?.id
  );
  for (let index = 0; index < secondaryQueues.length; index += 1) {
    const linkedQueue = secondaryQueues[index];
    const links = await AiAgentQueue.findAll({
      where: { companyId, queueId: linkedQueue.id },
      include: [
        {
          model: AiAgent,
          as: "aiAgent",
          required: true
        }
      ]
    });

    if (links.length !== 1) {
      issues.push({
        severity: "error",
        line,
        code: links.length ? "queue_multiple_agents" : "queue_without_agent",
        message: `Fila "${linkedQueue.name}" deve ter exatamente 1 agente IA; encontrado(s): ${links.length}`
      });
      continue;
    }

    const linkedAgent = links[0].aiAgent;
    if (
      !linkedAgent?.active ||
      !matchesAnyHint(linkedAgent.name, agentHints) ||
      matchesAnyHint(linkedAgent.name, forbiddenAgentHints)
    ) {
      issues.push({
        severity: "error",
        line,
        code: "agent_cross_brand",
        message: `Fila "${linkedQueue.name}" está vinculada ao agente incompatível "${linkedAgent?.name || "desconhecido"}"`
      });
    }
  }

  let agent: AiAgent | null = null;
  let domain: KnowledgeDomain | null = null;
  const knowledgeBases: SupportLineAuditRow["knowledgeBases"] = [];

  if (queue) {
    const agentQueues = await AiAgentQueue.findAll({
      where: { companyId, queueId: queue.id },
      include: [
        {
          model: AiAgent,
          as: "aiAgent",
          required: true
        }
      ]
    });

    if (agentQueues.length === 0) {
      issues.push({
        severity: "error",
        line,
        code: "queue_without_agent",
        message: `Fila "${queue.name}" não tem agente IA vinculado`
      });
    } else if (agentQueues.length > 1) {
      issues.push({
        severity: "error",
        line,
        code: "queue_multiple_agents",
        message: `Fila "${queue.name}" tem ${agentQueues.length} agentes — deve ter 1`
      });
    }

    agent = agentQueues[0]?.aiAgent || null;

    if (agent && !agent.active) {
      issues.push({
        severity: "error",
        line,
        code: "agent_inactive",
        message: `Agente "${agent.name}" está inativo`
      });
    }

    if (agent && !matchesAnyHint(agent.name, agentHints)) {
      issues.push({
        severity: "error",
        line,
        code: "agent_brand_mismatch",
        message: `Agente "${agent.name}" não corresponde à linha ${line}`
      });
    }

    if (agent && matchesAnyHint(agent.name, forbiddenAgentHints)) {
      issues.push({
        severity: "error",
        line,
        code: "agent_cross_brand",
        message: `Agente "${agent.name}" pertence à outra marca`
      });
    }

    if (agent) {
      const kbLinks = await AiAgentKnowledgeBase.findAll({
        where: { companyId, aiAgentId: agent.id },
        include: [
          {
            model: KnowledgeBase,
            as: "knowledgeBase",
            required: true,
            include: [
              {
                model: KnowledgeDomain,
                as: "knowledgeDomain",
                required: false
              }
            ]
          }
        ],
        order: [
          ["priority", "ASC"],
          ["id", "ASC"]
        ]
      });

      if (!kbLinks.length) {
        issues.push({
          severity: "error",
          line,
          code: "agent_without_knowledge_bases",
          message: `Agente "${agent.name}" não tem bases de conhecimento vinculadas`
        });
      }

      for (let index = 0; index < kbLinks.length; index += 1) {
        const link = kbLinks[index];
        const base = link.knowledgeBase;
        if (!base) {
          continue;
        }

        domain = base.knowledgeDomain || domain;

        if (!base.knowledgeDomainId) {
          issues.push({
            severity: "error",
            line,
            code: "knowledge_base_without_domain",
            message: `Base "${base.name}" não tem domínio CMS`
          });
        } else if (
          base.knowledgeDomain &&
          !matchesAnyHint(base.knowledgeDomain.name, domainHints)
        ) {
          issues.push({
            severity: "error",
            line,
            code: "knowledge_base_domain_mismatch",
            message: `Base "${base.name}" está no domínio "${base.knowledgeDomain.name}" (esperado ${line})`
          });
        }

        const readyDocuments = await countReadyDocuments(companyId, base.id);
        knowledgeBases.push({
          id: base.id,
          name: base.name,
          domainId: base.knowledgeDomainId,
          readyDocuments
        });

        if (readyDocuments === 0) {
          issues.push({
            severity: "warn",
            line,
            code: "knowledge_base_empty",
            message: `Base "${base.name}" não tem documentos prontos para RAG`
          });
        }
      }
    }
  }

  if (!domain) {
    const fallbackDomain = await KnowledgeDomain.findOne({
      where: {
        companyId,
        name: {
          [Op.or]: domainHints.map(hint => ({ [Op.iLike]: `%${hint}%` }))
        }
      },
      order: [["id", "ASC"]]
    });

    domain = fallbackDomain;

    if (!domain) {
      issues.push({
        severity: "error",
        line,
        code: "domain_missing",
        message: `Domínio CMS da linha ${line} não encontrado`
      });
    }
  }

  const hasErrors = issues.some(issue => issue.severity === "error");

  return {
    line,
    ok: !hasErrors,
    whatsapp: whatsapp ? { id: whatsapp.id, name: whatsapp.name } : null,
    queue: queue ? { id: queue.id, name: queue.name } : null,
    agent: agent ? { id: agent.id, name: agent.name } : null,
    domain: domain ? { id: domain.id, name: domain.name } : null,
    knowledgeBases,
    issues
  };
};

export const auditSupportLinesForCompany = async (
  companyId: number
): Promise<AuditSupportLinesSummary> => {
  const lines = await Promise.all([
    auditBrandLine(companyId, "fortmax"),
    auditBrandLine(companyId, "nivel")
  ]);

  return {
    ok: lines.every(row => row.ok),
    companyId,
    lines
  };
};
