import AiAgentKnowledgeBase from "../../models/AiAgentKnowledgeBase";
import KnowledgeBase from "../../models/KnowledgeBase";

type KnowledgeBaseLinkInput = {
  knowledgeBaseId: number;
  priority?: number;
};

export const syncAgentKnowledgeBases = async ({
  companyId,
  aiAgentId,
  knowledgeBaseIds,
  knowledgeBaseLinks
}: {
  companyId: number;
  aiAgentId: number;
  knowledgeBaseIds?: number[];
  knowledgeBaseLinks?: KnowledgeBaseLinkInput[];
}): Promise<void> => {
  const links: KnowledgeBaseLinkInput[] = [];

  if (Array.isArray(knowledgeBaseLinks) && knowledgeBaseLinks.length) {
    links.push(...knowledgeBaseLinks);
  } else if (Array.isArray(knowledgeBaseIds)) {
    knowledgeBaseIds.forEach((knowledgeBaseId, index) => {
      links.push({
        knowledgeBaseId: Number(knowledgeBaseId),
        priority: 100 + index
      });
    });
  }

  await AiAgentKnowledgeBase.destroy({
    where: { companyId, aiAgentId }
  });

  if (!links.length) {
    return;
  }

  const uniqueIds = [...new Set(links.map(link => link.knowledgeBaseId))];
  const validBases = await KnowledgeBase.findAll({
    where: { companyId, id: uniqueIds },
    attributes: ["id"]
  });
  const validIds = new Set(validBases.map(base => base.id));

  const rows = links
    .filter(link => validIds.has(link.knowledgeBaseId))
    .map(link => ({
      companyId,
      aiAgentId,
      knowledgeBaseId: link.knowledgeBaseId,
      priority: link.priority ?? 100
    }));

  if (rows.length) {
    await AiAgentKnowledgeBase.bulkCreate(rows);
  }
};

export const listAgentKnowledgeBaseIds = async (
  companyId: number,
  aiAgentId: number
): Promise<number[]> => {
  const links = await AiAgentKnowledgeBase.findAll({
    where: { companyId, aiAgentId },
    order: [
      ["priority", "ASC"],
      ["id", "ASC"]
    ],
    attributes: ["knowledgeBaseId"]
  });

  return [...new Set(links.map(link => link.knowledgeBaseId))];
};

export const listAgentsByKnowledgeBase = async (
  companyId: number,
  knowledgeBaseId: number
): Promise<
  { id: number; name: string; specialty: string | null; role: string }[]
> => {
  const links = await AiAgentKnowledgeBase.findAll({
    where: { companyId, knowledgeBaseId },
    include: [
      {
        association: "aiAgent",
        attributes: ["id", "name", "specialty", "role", "active"]
      }
    ]
  });

  return links
    .map(link => link.aiAgent)
    .filter(agent => agent?.active)
    .map(agent => ({
      id: agent.id,
      name: agent.name,
      specialty: agent.specialty,
      role: agent.role
    }));
};
