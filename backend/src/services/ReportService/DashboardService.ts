import { Op, fn, col, WhereOptions, literal, QueryTypes } from "sequelize";
import Ticket from "../../models/Ticket";
import Queue from "../../models/Queue";
import { GetCompanySetting } from "../../helpers/CheckSettings";
import User from "../../models/User";
import TicketTraking from "../../models/TicketTraking";
import sequelize from "../../database";
import { getBrandAccessForUser } from "../BrandServices/BrandAccessService";
import {
  listCounterSerie,
  TicketCounterSeries
} from "../CounterServices/ListCounterSerie";

type TicketTrackingStatistics = {
  avgWaitTime: number;
  avgServiceTime: number;
  totalClosed: number;
  newContacts: number;
};

export type DashboardDateRange = {
  date_from?: string;
  date_to?: string;
  hour_from?: string;
  hour_to?: string;
  tz?: string;
};

type TicketsStatisticsData = {
  ticketCounters: {
    create: TicketCounterSeries;
    accept: TicketCounterSeries;
    transfer: TicketCounterSeries;
    close: TicketCounterSeries;
  };
  ticketStatistics: {
    avgWaitTime: number;
    avgServiceTime: number;
    totalClosed: number;
  };
};

type UserStatistics = {
  id: number;
  name: string;
  avgWaitTime: number;
  avgServiceTime: number;
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  averageRating: number;
  online: boolean;
};

type UserReportData = {
  start: string;
  end: string;
  userReport: UserStatistics[];
};

export async function calculateTicketStatistics(
  companyId: number,
  start: Date,
  end: Date,
  brandIds: number[] | null = null
): Promise<TicketTrackingStatistics> {
  const brandScopedTickets =
    brandIds === null
      ? []
      : [
          {
            model: Ticket,
            attributes: [],
            required: true,
            where: { brandId: { [Op.in]: brandIds } }
          }
        ];

  const ticketStatistics = (await TicketTraking.findOne({
    attributes: [
      [fn("AVG", col("waitTime")), "avgWaitTime"],
      [fn("AVG", col("serviceTime")), "avgServiceTime"],
      [fn("COUNT", col("TicketTraking.id")), "totalClosed"]
    ],
    include: brandScopedTickets,
    where: {
      companyId,
      createdAt: {
        [Op.between]: [start, end]
      },
      finishedAt: {
        [Op.between]: [start, end]
      }
    },
    raw: true
  })) as unknown as TicketTrackingStatistics;

  // force to numbers
  ticketStatistics.avgWaitTime = Number(ticketStatistics.avgWaitTime) || null;
  ticketStatistics.avgServiceTime =
    Number(ticketStatistics.avgServiceTime) || null;
  ticketStatistics.totalClosed = Number(ticketStatistics.totalClosed) || null;

  const countContactsQuery = `
  SELECT COUNT(*) AS count FROM (
    SELECT "contactId"
    FROM (
      SELECT
        t.id AS "ticketId",
        t."contactId",
        c."createdAt"
      FROM
        "TicketTraking" tt
      JOIN
        "Tickets" t ON tt."ticketId" = t.id
      JOIN
        "Contacts" c ON t."contactId" = c.id
      WHERE
        (tt."createdAt" BETWEEN :startDate AND :endDate)
        AND (tt."companyId" = :companyId)
        AND (tt."finishedAt" BETWEEN :startDate AND :endDate)
        AND (c."createdAt" BETWEEN :startDate AND :endDate)
    ) counters_list
    GROUP BY "contactId"
  ) counters_totals
  `;

  const newContacts = (await sequelize.query(countContactsQuery, {
    replacements: {
      companyId,
      startDate: start,
      endDate: end
    },
    type: QueryTypes.SELECT
  })) as unknown as [{ count: number }];

  ticketStatistics.newContacts = Number(newContacts[0]?.count) || null;

  return ticketStatistics;
}

/**
 * `brandIds = null` significa "sem restrição" (admin ou company sem marcas);
 * um array restringe. Array vazio devolve nada de propósito: é o usuário sem
 * nenhuma marca permitida com o isolamento ligado.
 */
/**
 * Escopo de marca do dashboard, derivado da permissão do usuário.
 * Mesma regra do restante do sistema: "Todas" é todas as **permitidas**.
 */
export async function resolveDashboardBrandScope(
  userId?: number | string
): Promise<number[] | null> {
  if (!userId) {
    return null;
  }

  const access = await getBrandAccessForUser(userId);
  return access.isUnrestricted ? null : access.visibleBrandIds || [];
}

/**
 * Fragmento SQL de escopo de marca para as subqueries `literal()`.
 *
 * As contagens de aberto/fechado por atendente são SQL cru e não passam pelo
 * `where` do Sequelize; sem este pedaço, o relatório de um funcionário somaria
 * atendimentos de marcas que quem consulta não pode ver.
 *
 * Devolve string vazia quando não há restrição, e `AND FALSE` quando a lista
 * está vazia — usuário sem nenhuma marca permitida não conta nada.
 */
const brandSqlFilter = (
  brandIds: number[] | null,
  ticketAlias: string
): string => {
  if (brandIds === null) {
    return "";
  }
  if (!brandIds.length) {
    return " AND FALSE";
  }
  return ` AND ${ticketAlias}."brandId" IN (${brandIds
    .map(id => Number(id))
    .join(",")})`;
};

/** `where` de marca para includes de Ticket. */
const brandIncludeWhere = (
  brandIds: number[] | null
): Record<string, unknown> =>
  brandIds === null ? {} : { brandId: { [Op.in]: brandIds } };

export async function ticketsStatusSummary(
  companyId: number,
  brandIds: number[] | null = null
) {
  const where: WhereOptions<Ticket> = {
    companyId,
    status: {
      [Op.or]: ["open", "pending"]
    }
  };

  if (brandIds !== null) {
    (where as Record<string, unknown>).brandId = { [Op.in]: brandIds };
  }

  const groupsEnabled =
    (await GetCompanySetting(companyId, "groupsTab", "disabled")) === "enabled";

  if (groupsEnabled) {
    where.isGroup = false;
  }

  const ticketsSummary = await Ticket.findAll({
    attributes: ["status", "queueId", [fn("COUNT", "*"), "count"]],
    where,
    include: [
      {
        model: Queue,
        attributes: ["id", "name", "color"],
        required: false
      }
    ],
    group: ["status", "queueId", "queue.id", "queue.name", "queue.color"]
  });

  return ticketsSummary;
}

export async function usersStatusSummary(
  companyId,
  brandIds: number[] | null = null
) {
  const usersSummary = await User.findAll({
    attributes: [
      "id",
      "name",
      [
        literal(`(
          SELECT COUNT(*)
          FROM "UserSocketSessions"
          WHERE "UserSocketSessions"."userId" = "User"."id"
            AND "UserSocketSessions"."active" = true
        ) > 0`),
        "online"
      ],
      [fn("COUNT", col("tickets.id")), "openTicketsCount"]
    ],
    where: {
      companyId
    },
    include: [
      {
        model: Ticket,
        as: "tickets",
        attributes: [],
        where: {
          status: "open",
          ...brandIncludeWhere(brandIds)
        },
        required: false
      }
    ],
    group: ["User.id"]
  });

  return usersSummary;
}

export async function userReport(
  companyId: number,
  start: Date,
  end: Date,
  brandIds: number[] | null = null
) {
  const brandScope = brandSqlFilter(brandIds, "t");
  const result = await User.findAll({
    attributes: [
      "id",
      "name",
      [fn("AVG", col("tickets.ticketTrakings.waitTime")), "avgWaitTime"],
      [fn("AVG", col("tickets.ticketTrakings.serviceTime")), "avgServiceTime"],
      [fn("COUNT", col("tickets.id")), "totalTickets"],
      [
        literal(`(
          SELECT COUNT(*)
          FROM "TicketTraking" AS tt
          JOIN "Tickets" AS t ON tt."ticketId" = t.id
          WHERE t."userId" = "User"."id"${brandScope}
            AND tt."startedAt" < :endDate
            AND (tt."finishedAt" > :endDate OR tt."finishedAt" IS NULL)
        )`),
        "openTickets"
      ],
      [
        literal(`(
          SELECT COUNT(*)
          FROM "TicketTraking" AS tt
          JOIN "Tickets" AS t ON tt."ticketId" = t.id
          WHERE t."userId" = "User"."id"${brandScope}
            AND tt."finishedAt" BETWEEN :startDate AND :endDate
        )`),
        "closedTickets"
      ],
      [
        literal(`(
          SELECT AVG("rate")
          FROM "UserRatings"
          WHERE "UserRatings"."userId" = "User"."id"
            AND "UserRatings"."createdAt" BETWEEN :startDate AND :endDate
        )`),
        "averageRating"
      ],
      [
        literal(`(
          SELECT COUNT(*)>0
          FROM "UserSocketSessions"
          WHERE "UserSocketSessions"."userId" = "User"."id"
            AND "UserSocketSessions"."active" = true
        )`),
        "online"
      ]
    ],
    where: {
      companyId
    },
    include: [
      {
        model: Ticket,
        as: "tickets",
        attributes: [],
        required: false,
        where: brandIncludeWhere(brandIds),
        include: [
          {
            model: TicketTraking,
            as: "ticketTrakings",
            attributes: [],
            where: {
              [Op.or]: [
                {
                  startedAt: { [Op.between]: [start, end] }
                },
                {
                  finishedAt: { [Op.between]: [start, end] }
                },
                {
                  startedAt: { [Op.lt]: end },
                  finishedAt: { [Op.gt]: end }
                },
                {
                  startedAt: { [Op.lt]: end },
                  finishedAt: null
                }
              ]
            }
          }
        ]
      }
    ],
    replacements: {
      startDate: start,
      endDate: end
    },
    group: ["User.id"]
  });

  return result as unknown[] as UserStatistics[];
}

export async function statusSummaryService(
  companyId: number,
  userId?: number | string
) {
  const brandIds = await resolveDashboardBrandScope(userId);

  const [ticketsSummary, usersSummary] = await Promise.all([
    ticketsStatusSummary(companyId, brandIds),
    usersStatusSummary(companyId, brandIds)
  ]);

  return {
    ticketsStatusSummary: ticketsSummary,
    usersStatusSummary: usersSummary
  };
}

export async function ticketsStatisticsService(
  companyId: number,
  params: DashboardDateRange,
  userId?: number | string
): Promise<TicketsStatisticsData> {
  let start: Date;
  let end = new Date();
  const tz = params.tz || "Z";

  if (params.date_from && params.date_to) {
    start = new Date(
      `${params.date_from}T${params?.hour_from || "00:00:00"}${tz}`
    );
    end = new Date(`${params.date_to}T${params?.hour_to || "23:59:59"}${tz}`);
  } else {
    throw new Error("Invalid date range");
  }

  const [create, accept, transfer, close] = await Promise.all([
    listCounterSerie(companyId, "ticket-create", start, end),
    listCounterSerie(companyId, "ticket-accept", start, end),
    listCounterSerie(companyId, "ticket-transfer", start, end),
    listCounterSerie(companyId, "ticket-close", start, end)
  ]);

  return {
    ticketCounters: {
      create,
      accept,
      transfer,
      close
    },
    ticketStatistics: await calculateTicketStatistics(
      companyId,
      start,
      end,
      await resolveDashboardBrandScope(userId)
    )
  };
}

export async function usersReportService(
  companyId: number,
  params: DashboardDateRange,
  userId?: number | string
): Promise<UserReportData> {
  let start: Date;
  let end = new Date();
  const tz = params.tz || "Z";

  if (params.date_from && params.date_to) {
    start = new Date(`${params.date_from}T00:00:00${tz}`);
    end = new Date(`${params.date_to}T23:59:59${tz}`);
  } else {
    throw new Error("Invalid date range");
  }

  return {
    start: params.date_from,
    end: params.date_to,
    userReport: await userReport(
      companyId,
      start,
      end,
      await resolveDashboardBrandScope(userId)
    )
  };
}
