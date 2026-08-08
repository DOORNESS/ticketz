import { Op } from "sequelize";
import sequelize from "../../database";
import Brand from "../../models/Brand";
import Whatsapp from "../../models/Whatsapp";
import Queue from "../../models/Queue";
import AiAgent from "../../models/AiAgent";
import KnowledgeDomain from "../../models/KnowledgeDomain";
import KnowledgeBase from "../../models/KnowledgeBase";
import Ticket from "../../models/Ticket";
import { legacyMatchBrandSlugByName } from "./BrandResolutionService";
import { logger } from "../../utils/logger";

/**
 * Backfill das marcas que já operam.
 *
 * Este é o **único** lugar onde o casamento por nome ainda é usado de
 * propósito: para descobrir, uma única vez, quais conexões pertencem a quais
 * marcas e gravar isso em FK. Depois disso o runtime não olha mais para nome.
 *
 * É idempotente: rodar de novo não duplica marca nem sobrescreve vínculo já
 * definido manualmente pelo admin.
 */

type BrandSeed = {
  slug: string;
  name: string;
  shortLabel: string;
  primaryColor: string;
  sortOrder: number;
  identityName?: string;
  identityReply?: string;
  escalationUrl?: string;
  informationalFallback?: string;
  supportContacts?: { name: string; role?: string; whatsapp?: string }[];
  vocabulary?: string[];
  /** Padrões usados só aqui, para localizar os registros existentes. */
  queuePatterns: string[];
  agentPatterns: string[];
  domainPatterns: string[];
};

/**
 * Conteúdo migrado de `AgentPersonaService` e `CaseCompletenessEngine`.
 * A partir daqui ele é dado editável, não código.
 *
 * A ORDEM IMPORTA: o laço percorre os seeds em sequência e `linkRecords` só
 * grava onde ainda está nulo, então quem vem antes reivindica primeiro.
 *
 * Só existem aqui as operações que de fato atendem hoje. FortControl NÃO é
 * uma delas: é produto da suíte Fortmax (PCP, estoque, financeiro) e seu
 * conhecimento pertence à marca Fortmax. Criar marca vazia "para deixar
 * preparado" só produziria uma linha inútil no painel — marca nova se cria
 * pela tela de Administração → Marcas, sem passar por este arquivo.
 */
const SEEDS: BrandSeed[] = [
  {
    slug: "nivel",
    name: "Nível Cashback",
    shortLabel: "Nível",
    primaryColor: "#2196F3",
    sortOrder: 10,
    identityName: "Nivelton",
    identityReply: "Me chamo Nivelton, assistente da Nível Cashback.",
    escalationUrl: "https://nivelvelo.com/chamado",
    informationalFallback:
      "Não encontrei uma orientação segura para esse caso nos materiais disponíveis. Para que a equipe analise sua solicitação sem eu arriscar uma informação incorreta, abra um chamado em https://nivelvelo.com/chamado e descreva o que aconteceu.",
    supportContacts: [],
    vocabulary: ["nivel", "nível", "cashback", "fidelização", "fidelizacao"],
    queuePatterns: ["suporte nivel", "suporte nível"],
    agentPatterns: ["nivelton", "agente nivel cashback"],
    domainPatterns: ["nivel cashback", "nível cashback"]
  },
  {
    slug: "fortmax",
    name: "Fortmax / WebG3",
    shortLabel: "Fortmax",
    primaryColor: "#D32F2F",
    sortOrder: 20,
    identityName: "Webin",
    identityReply: "Me chamo Webin, Assistente Virtual da Fortmax.",
    informationalFallback:
      "Não encontrei esse procedimento com segurança na base.",
    supportContacts: [
      { name: "Thiago", role: "suporte", whatsapp: "17 98833-8760" },
      {
        name: "Cristiane",
        role: "gerência e financeiro",
        whatsapp: "17 99605-8041"
      }
    ],
    vocabulary: ["fortmax", "webg3", "web g3", "fortcontrol"],
    queuePatterns: ["suporte fortmax", "suporte webg3", "suporte web g3"],
    agentPatterns: ["webin", "atendente virtual webg3"],
    domainPatterns: ["fortmax", "suporte fortmax"]
  }
];

export type BackfillBrandsSummary = {
  companyId: number;
  brands: {
    slug: string;
    brandId: number;
    created: boolean;
    whatsapps: number;
    queues: number;
    agents: number;
    domains: number;
    knowledgeBases: number;
    tickets: number;
  }[];
  ticketsWithoutBrand: number;
  whatsappsWithoutBrand: { id: number; name: string }[];
};

const findAllByNameLoose = async (
  // Segue a convenção de `WireSupportLinesService.findByNameLoose`: os models
  // Sequelize não compartilham um tipo estrutural com `name`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  companyId: number,
  patterns: string[]
): Promise<{ id: number; name: string }[]> => {
  if (!patterns.length) {
    return [];
  }

  return model.findAll({
    where: {
      companyId,
      [Op.or]: patterns.map(pattern => ({
        name: { [Op.iLike]: `%${pattern}%` }
      }))
    }
  });
};

/** Só grava onde ainda está nulo — respeita vínculo definido pelo admin. */
const linkRecords = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any,
  ids: number[],
  brandId: number
): Promise<number> => {
  if (!ids.length) {
    return 0;
  }

  await model.update(
    { brandId },
    { where: { id: { [Op.in]: ids }, brandId: { [Op.is]: null } } }
  );

  return ids.length;
};

export const backfillBrandsForCompany = async (
  companyId: number
): Promise<BackfillBrandsSummary> => {
  const summary: BackfillBrandsSummary = {
    companyId,
    brands: [],
    ticketsWithoutBrand: 0,
    whatsappsWithoutBrand: []
  };

  // eslint-disable-next-line no-restricted-syntax
  for (const seed of SEEDS) {
    const [brand, created] = await Brand.findOrCreate({
      where: { companyId, slug: seed.slug },
      defaults: {
        companyId,
        slug: seed.slug,
        name: seed.name,
        shortLabel: seed.shortLabel,
        primaryColor: seed.primaryColor,
        sortOrder: seed.sortOrder,
        identityName: seed.identityName,
        identityReply: seed.identityReply,
        escalationUrl: seed.escalationUrl,
        informationalFallback: seed.informationalFallback,
        supportContacts: seed.supportContacts || [],
        vocabulary: seed.vocabulary || [],
        settings: {},
        active: true
      } as never
    });

    // Conexões: usa o casamento legado uma única vez.
    const allWhatsapps = await Whatsapp.findAll({
      where: { companyId },
      attributes: ["id", "name", "brandId"]
    });
    const brandWhatsappIds = allWhatsapps
      .filter(w => legacyMatchBrandSlugByName(w.name) === seed.slug)
      .map(w => w.id);

    const queues = await findAllByNameLoose(
      Queue,
      companyId,
      seed.queuePatterns
    );
    const agents = await findAllByNameLoose(
      AiAgent,
      companyId,
      seed.agentPatterns
    );
    const domains = await findAllByNameLoose(
      KnowledgeDomain,
      companyId,
      seed.domainPatterns
    );

    await linkRecords(Whatsapp, brandWhatsappIds, brand.id);
    await linkRecords(
      Queue,
      queues.map(q => q.id),
      brand.id
    );
    await linkRecords(
      AiAgent,
      agents.map(a => a.id),
      brand.id
    );
    await linkRecords(
      KnowledgeDomain,
      domains.map(d => d.id),
      brand.id
    );

    // Bases seguem o domínio — é o vínculo que já existe no CMS.
    const bases = domains.length
      ? await KnowledgeBase.findAll({
          where: {
            companyId,
            knowledgeDomainId: { [Op.in]: domains.map(d => d.id) }
          },
          attributes: ["id"]
        })
      : [];
    await linkRecords(
      KnowledgeBase,
      bases.map(b => b.id),
      brand.id
    );

    // Tickets herdam a marca da conexão de origem.
    let ticketCount = 0;
    if (brandWhatsappIds.length) {
      // `Model.update` devolve `[affectedCount]`; o segundo elemento só existe
      // com `returning: true`. Ler o índice 1 fazia o relatório dizer 0 mesmo
      // com o UPDATE tendo funcionado — e é esse número que autoriza concluir
      // a migração, então precisa ser confiável.
      const [affected] = (await Ticket.update(
        { brandId: brand.id },
        {
          where: {
            companyId,
            whatsappId: { [Op.in]: brandWhatsappIds },
            brandId: { [Op.is]: null }
          }
        }
      )) as unknown as [number];
      ticketCount = Number(affected || 0);
    }

    summary.brands.push({
      slug: seed.slug,
      brandId: brand.id,
      created,
      whatsapps: brandWhatsappIds.length,
      queues: queues.length,
      agents: agents.length,
      domains: domains.length,
      knowledgeBases: bases.length,
      tickets: ticketCount
    });
  }

  summary.ticketsWithoutBrand = await Ticket.count({
    where: { companyId, brandId: { [Op.is]: null } }
  });

  const orphanWhatsapps = await Whatsapp.findAll({
    where: { companyId, brandId: { [Op.is]: null } },
    attributes: ["id", "name"]
  });
  summary.whatsappsWithoutBrand = orphanWhatsapps.map(w => ({
    id: w.id,
    name: w.name
  }));

  logger.info(summary, "Brand backfill concluído");
  return summary;
};

export const backfillBrandsForConfiguredCompanies = async (): Promise<
  BackfillBrandsSummary[]
> => {
  const raw = process.env.BRAND_BACKFILL_COMPANY_IDS?.trim();
  const companyIds = raw
    ? raw
        .split(",")
        .map(id => Number(id.trim()))
        .filter(id => Number.isFinite(id) && id > 0)
    : [Number(process.env.BRAND_BACKFILL_COMPANY_ID || 1)];

  const results: BackfillBrandsSummary[] = [];

  // eslint-disable-next-line no-restricted-syntax
  for (const companyId of companyIds) {
    try {
      results.push(await backfillBrandsForCompany(companyId));
    } catch (error) {
      logger.error({ error, companyId }, "Brand backfill falhou");
    }
  }

  return results;
};

export const __testing = { SEEDS, sequelize };
