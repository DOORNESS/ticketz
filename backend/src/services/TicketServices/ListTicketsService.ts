import { Op, fn, where, col, Includeable, WhereOptions } from "sequelize";
import { startOfDay, endOfDay, parseISO } from "date-fns";

import { intersection } from "lodash";
import AppError from "../../errors/AppError";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Queue from "../../models/Queue";
import User from "../../models/User";
import ShowUserService from "../UserServices/ShowUserService";
import Tag from "../../models/Tag";
import TicketTag from "../../models/TicketTag";
import Whatsapp from "../../models/Whatsapp";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import ContactTag from "../../models/ContactTag";
import Brand from "../../models/Brand";
import {
  getBrandAccessForUser,
  resolveBrandFilterForQuery
} from "../BrandServices/BrandAccessService";
import {
  AI_TICKET_FILTERS,
  AiTicketFilter
} from "../AiServices/AiOperationalTypes";

interface Request {
  isSearch?: boolean;
  searchParam?: string;
  nextUpdatedAt?: string;
  status?: string;
  groups?: string;
  date?: string;
  updatedAt?: string;
  minUpdatedAt?: string;
  showAll?: string;
  userId: string;
  withUnreadMessages?: string;
  notClosed?: boolean;
  all?: boolean;
  queueIds: number[];
  whatsappIds?: number[];
  brandIds?: number[];
  contactId?: number;
  tags: number[];
  users: number[];
  companyId: number;
  aiFilter?: string;
  supervision?: boolean | string;
}

interface Response {
  tickets: Ticket[];
  count: number | null;
}

const ListTicketsService = async ({
  isSearch = false,
  searchParam = "",
  nextUpdatedAt,
  queueIds,
  whatsappIds,
  brandIds,
  contactId,
  tags,
  users,
  status,
  groups,
  date,
  updatedAt,
  minUpdatedAt,
  showAll,
  userId,
  withUnreadMessages,
  notClosed,
  all,
  companyId,
  aiFilter,
  supervision
}: Request): Promise<Response> => {
  let ticketId: number;

  if (/^\d{8}-\d+$/.test(searchParam)) {
    const parts = searchParam.split("-");
    ticketId = parseInt(parts[1], 10);
  }

  if (Number(searchParam)) {
    ticketId = Number(searchParam);
  }

  if (ticketId) {
    searchParam = "";
  }

  if (
    (searchParam.trim().startsWith('"') && searchParam.trim().endsWith('"')) ||
    (searchParam.trim().startsWith("'") && searchParam.trim().endsWith("'"))
  ) {
    searchParam = searchParam.trim().slice(1, -1);
  }

  const groupsTab =
    !isSearch &&
    (await GetCompanySetting(companyId, "groupsTab", "disabled")) === "enabled";

  const user = await ShowUserService(userId);

  const isSupervision =
    supervision === true ||
    supervision === "true" ||
    user.super === true ||
    (aiFilter && aiFilter !== AI_TICKET_FILTERS.all);

  const isAiHandlingList =
    aiFilter === AI_TICKET_FILTERS.ai_handling ||
    aiFilter === AI_TICKET_FILTERS.ai_supervision;

  const canSupervise = user.profile === "admin" || user.super === true;

  const andedOrs: WhereOptions<Ticket>[] = [];

  if (isAiHandlingList) {
    andedOrs.push({});
  } else if (isSupervision && canSupervise) {
    andedOrs.push({});
  } else {
    andedOrs.push({
      [Op.or]: [{ userId }, { status: "pending" }]
    });
  }

  // "Aguardando" is a human queue. An administrator may supervise every
  // queue, but active AI tickets must still remain exclusively in the IA tab.
  if (!isAiHandlingList && status === "pending") {
    andedOrs.push({
      [Op.or]: [
        { aiAgentId: { [Op.is]: null } },
        { aiPaused: true },
        { userId: { [Op.ne]: null } },
        {
          aiHandoff: true,
          [Op.or]: [
            { aiHandoffMode: { [Op.ne]: "operational" } },
            { aiHandoffMode: { [Op.is]: null } }
          ]
        }
      ]
    });
  }

  const includeHandoffPendingWithoutQueue =
    status === "pending" && !isSupervision && !isAiHandlingList;

  const skipQueueFilter =
    canSupervise && (isAiHandlingList || isSupervision);

  const queueFilter = skipQueueFilter
    ? undefined
    : (isAiHandlingList || (isSupervision && canSupervise)) && queueIds.length
      ? { [Op.or]: [queueIds, null] }
      : queueIds.length
        ? includeHandoffPendingWithoutQueue
          ? {
              [Op.or]: [
                { [Op.in]: queueIds },
                {
                  aiHandoff: true,
                  status: "pending",
                  userId: { [Op.is]: null }
                }
              ]
            }
          : { [Op.in]: queueIds }
        : { [Op.ne]: null };

  let whereCondition: WhereOptions<Ticket> = {
    [Op.and]: andedOrs,
    ...(queueFilter !== undefined ? { queueId: queueFilter } : {}),
    ...(groupsTab ? { isGroup: groups === "true" } : {})
  };
  let includeCondition: Includeable[];

  includeCondition = [
    {
      model: Contact,
      as: "contact",
      include: ["tags", "extraInfo"],
      attributes: ["id", "name", "number", "email", "profilePicUrl", "presence"]
    },
    {
      model: Queue,
      as: "queue",
      attributes: ["id", "name", "color"]
    },
    {
      model: User,
      as: "user",
      attributes: ["id", "name"]
    },
    {
      model: Tag,
      as: "tags",
      attributes: ["id", "name", "color"]
    },
    {
      model: Whatsapp,
      as: "whatsapp",
      attributes: ["id", "name"]
    },
    {
      model: Brand,
      as: "brand",
      attributes: ["id", "slug", "name", "shortLabel", "primaryColor", "logoUrl"]
    }
  ];

  if (
    showAll === "true" &&
    (user.profile === "admin" || user.super === true) &&
    status === "open"
  ) {
    andedOrs.length = 0;
    andedOrs.push({ status: "open" });
  }

  if (status) {
    whereCondition = {
      ...whereCondition,
      status
    };
  }

  const applyAiFilter = (filter?: string) => {
    if (!filter || filter === AI_TICKET_FILTERS.all) {
      return;
    }

    const aiConditions: WhereOptions<Ticket> = {};

    switch (filter as AiTicketFilter) {
      case AI_TICKET_FILTERS.ai_supervision:
        Object.assign(aiConditions, {
          aiAgentId: { [Op.ne]: null },
          status: { [Op.ne]: "closed" }
        });
        break;
      case AI_TICKET_FILTERS.ai_handling:
        Object.assign(aiConditions, {
          aiAgentId: { [Op.ne]: null },
          aiPaused: false,
          userId: null,
          status: { [Op.ne]: "closed" },
          [Op.or]: [{ aiHandoff: false }, { aiHandoffMode: "operational" }]
        });
        break;
      case AI_TICKET_FILTERS.ai_resolved:
        Object.assign(aiConditions, {
          aiResolvedByAi: true,
          status: "closed"
        });
        break;
      case AI_TICKET_FILTERS.ai_transferred:
        Object.assign(aiConditions, {
          aiHandoff: true,
          status: "pending",
          userId: null
        });
        break;
      case AI_TICKET_FILTERS.handoff_pending:
        Object.assign(aiConditions, {
          aiHandoff: true,
          aiHandoffMode: {
            [Op.or]: [{ [Op.ne]: "operational" }, { [Op.is]: null }]
          },
          status: "pending",
          userId: null
        });
        break;
      case AI_TICKET_FILTERS.human_handling:
        Object.assign(aiConditions, {
          userId: { [Op.ne]: null },
          status: "open"
        });
        break;
      case AI_TICKET_FILTERS.ai_paused:
        Object.assign(aiConditions, {
          aiPaused: true,
          status: { [Op.ne]: "closed" }
        });
        break;
      case AI_TICKET_FILTERS.closed:
        Object.assign(aiConditions, {
          status: "closed"
        });
        break;
      default:
        break;
    }

    whereCondition = {
      ...whereCondition,
      ...aiConditions
    };
  };

  applyAiFilter(aiFilter);

  if (!isSupervision && !aiFilter && status === "pending") {
    andedOrs.push({
      [Op.or]: [{ aiHandoff: true }, { aiAgentId: null }, { aiPaused: true }]
    });
  }

  if (searchParam) {
    const sanitizedSearchParam = searchParam.toLocaleLowerCase().trim();

    includeCondition = [
      ...includeCondition,
      {
        model: Message,
        as: "messages",
        attributes: ["id", "body"],
        where: {
          body: where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        required: false,
        duplicating: false
      }
    ];

    andedOrs.push({
      [Op.or]: [
        {
          "$contact.name$": where(
            fn("LOWER", col("contact.name")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        },
        { "$contact.number$": { [Op.like]: `%${sanitizedSearchParam}%` } },
        {
          "$message.body$": where(
            fn("LOWER", col("body")),
            "LIKE",
            `%${sanitizedSearchParam}%`
          )
        }
      ]
    });
  }

  if (date) {
    whereCondition = {
      [Op.and]: andedOrs,
      createdAt: {
        [Op.between]: [+startOfDay(parseISO(date)), +endOfDay(parseISO(date))]
      }
    };
  }

  if (updatedAt) {
    whereCondition = {
      [Op.and]: andedOrs,
      updatedAt: {
        [Op.between]: [
          +startOfDay(parseISO(updatedAt)),
          +endOfDay(parseISO(updatedAt))
        ]
      }
    };
  }

  if (withUnreadMessages === "true") {
    whereCondition = {
      ...whereCondition,
      unreadMessages: { [Op.gt]: 0 }
    };
  }

  if (Array.isArray(tags) && tags.length > 0) {
    const ticketsTagFilter: number[][] = [];
    const contactsTagFilter: number[][] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const tag of tags) {
      const ticketTags = await TicketTag.findAll({
        where: { tagId: tag }
      });
      if (ticketTags) {
        ticketsTagFilter.push(ticketTags.map(t => t.ticketId));
      }

      const contactTags = await ContactTag.findAll({
        where: { tagId: tag }
      });

      if (contactTags) {
        contactsTagFilter.push(contactTags.map(c => c.contactId));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsTagFilter);
    const contactsIntersection: number[] = intersection(...contactsTagFilter);

    andedOrs.push({
      [Op.or]: [
        {
          id: { [Op.in]: ticketsIntersection }
        },
        {
          contactId: { [Op.in]: contactsIntersection }
        }
      ]
    });
  }

  if (contactId) {
    whereCondition = {
      ...whereCondition,
      contactId
    };
  }

  if (ticketId) {
    whereCondition = {
      ...whereCondition,
      id: ticketId
    };
  }

  // Escopo de marca. `resolveBrandFilterForQuery` cruza o que a UI pediu com
  // o que o usuário pode ver, então um atendente restrito nunca amplia o
  // próprio alcance mandando brandIds na querystring.
  const brandAccess = await getBrandAccessForUser(userId);
  const effectiveBrandIds = resolveBrandFilterForQuery(brandAccess, brandIds);

  if (effectiveBrandIds !== null) {
    whereCondition = {
      ...whereCondition,
      brandId: { [Op.in]: effectiveBrandIds }
    };
  }

  if (Array.isArray(whatsappIds) && whatsappIds.length > 0) {
    // A conexão precisa pertencer à marca em escopo.
    //
    // Os dois filtros eram independentes: pedir marca Fortmax junto de uma
    // conexão da Nível montava `brandId IN (2) AND whatsappId IN (3)`, que
    // não vaza nada mas devolve lista vazia sem explicar por quê — e deixava
    // a combinação incoerente existir na URL. Aqui ela deixa de existir: a
    // conexão de outra marca é descartada do filtro, não silenciosamente
    // cruzada. Se sobrar nenhuma, `Op.in: []` não traz nada, que é o
    // resultado correto para "conexão que não é desta marca".
    let scopedWhatsappIds = whatsappIds.map(Number);

    if (effectiveBrandIds !== null) {
      const owned = await Whatsapp.findAll({
        where: {
          companyId,
          id: { [Op.in]: scopedWhatsappIds },
          brandId: { [Op.in]: effectiveBrandIds }
        },
        attributes: ["id"]
      });
      scopedWhatsappIds = owned.map(item => Number(item.id));
    }

    whereCondition = {
      ...whereCondition,
      whatsappId: { [Op.in]: scopedWhatsappIds }
    };
  }

  if (Array.isArray(users) && users.length > 0) {
    const ticketsUserFilter: number[][] = [];
    // eslint-disable-next-line no-restricted-syntax
    for await (const u of users) {
      const ticketUsers = await Ticket.findAll({
        where: { userId: u }
      });
      if (ticketUsers) {
        ticketsUserFilter.push(ticketUsers.map(t => t.id));
      }
    }

    const ticketsIntersection: number[] = intersection(...ticketsUserFilter);

    whereCondition = {
      ...whereCondition,
      id: {
        [Op.in]: ticketsIntersection
      }
    };
  }

  const limit = all ? undefined : 40;

  if (!all && nextUpdatedAt) {
    const parsedNextUpdatedAt = new Date(nextUpdatedAt);

    if (Number.isNaN(parsedNextUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_NEXT_UPDATED_AT", 400);
    }

    andedOrs.push({
      updatedAt: { [Op.lt]: parsedNextUpdatedAt }
    });
  }

  if (minUpdatedAt) {
    const parsedMinUpdatedAt = new Date(minUpdatedAt);

    if (Number.isNaN(parsedMinUpdatedAt.getTime())) {
      throw new AppError("ERR_INVALID_MIN_UPDATED_AT", 400);
    }

    andedOrs.push({
      updatedAt: { [Op.gte]: parsedMinUpdatedAt }
    });
  }

  if (notClosed) {
    whereCondition = {
      ...whereCondition,
      status: { [Op.ne]: "closed" }
    };
  }

  whereCondition = {
    ...whereCondition,
    companyId
  };

  const tickets = await Ticket.findAll({
    where: whereCondition,
    include: includeCondition,
    limit,
    order: [
      ["updatedAt", "DESC"],
      ["id", "DESC"]
    ],
    subQuery: false
  });

  return {
    tickets,
    count: null
  };
};

export default ListTicketsService;
