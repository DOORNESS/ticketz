import { Op } from "sequelize";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import AiAgentQueue from "../../models/AiAgentQueue";
import KnowledgeBase from "../../models/KnowledgeBase";
import KnowledgeDomain from "../../models/KnowledgeDomain";
import KnowledgeDocument from "../../models/KnowledgeDocument";
import AiAgentKnowledgeBase from "../../models/AiAgentKnowledgeBase";
import {
  findWhatsappByBrand,
  normalizeSupportLineName
} from "./WireSupportLinesService";

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

const FORTMAX_QUEUE_HINTS = ["suporte fortmax", "suporte webg3", "webg3"];
const NIVEL_QUEUE_HINTS = ["suporte nivel", "suporte nível"];
const FORTMAX_DOMAIN_HINTS = ["fortmax"];
const NIVEL_DOMAIN_HINTS = ["nivel cashback", "nível cashback", "nivel"];
const FORTMAX_AGENT_HINTS = ["webin", "fortmax"];
const NIVEL_AGENT_HINTS = ["nivelton", "nivel cashback"];

const matchesAnyHint = (value: string, hints: string[]): boolean => {
  const normalized = normalizeSupportLineName(value);
  return hints.some(hint => normalized.includes(normalizeSupportLineName(hint)));
};

const countReadyDocuments = async (
  companyId: number,
  knowledgeBaseId: number
): Promise<number> =>
  KnowledgeDocument.count({
    where: {
      companyId,
      knowledgeBaseId,
      status: "ready"
    }
  });

const auditBrandLine = async (
  companyId: number,
  line: SupportLineBrand
): Promise<SupportLineAuditRow> => {
  const issues: SupportLineAuditIssue[] = [];
  const queueHints = line === "fortmax" ? FORTMAX_QUEUE_HINTS : NIVEL_QUEUE_HINTS;
  const domainHints = line === "fortmax" ? FORTMAX_DOMAIN_HINTS : NIVEL_DOMAIN_HINTS;
  const agentHints = line === "fortmax" ? FORTMAX_AGENT_HINTS : NIVEL_AGENT_HINTS;
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
  } else if (queues.length > 1) {
    issues.push({
      severity: "error",
      line,
      code: "whatsapp_multiple_queues",
      message: `WhatsApp "${whatsapp.name}" tem ${queues.length} filas — deve ter apenas 1`
    });
  }

  const queue = queues[0] || null;

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
