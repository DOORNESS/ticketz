import { Op } from "sequelize";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import MediaDeletionAudit from "../../models/MediaDeletionAudit";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import { getIO } from "../../libs/socket";
import {
  assertPermanentDeletePermission,
  resolveStorageKeyFromMessage
} from "./MediaAuthorizationService";
import {
  deleteStoredMediaBatch,
  findTicketMediaForDeletion
} from "./MediaDeleteObjectService";
import MessageMediaFile from "../../models/MessageMediaFile";
import { logger } from "../../utils/logger";

export type PermanentDeleteTicketInput = {
  ticketId: number;
  companyId: number;
  user: User;
  reason?: string;
};

export const requestPermanentTicketDeletion = async ({
  ticketId,
  companyId,
  user,
  reason
}: PermanentDeleteTicketInput): Promise<MediaDeletionAudit> => {
  assertPermanentDeletePermission(user);

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId }
  });

  if (!ticket) {
    throw new AppError("ERR_NO_TICKET_FOUND", 404);
  }

  if (ticket.permanentDeleteRequestedAt && !ticket.permanentDeletedAt) {
    const existing = await MediaDeletionAudit.findOne({
      where: {
        companyId,
        ticketId,
        status: { [Op.in]: ["pending", "processing"] }
      },
      order: [["createdAt", "DESC"]]
    });

    if (existing) {
      return existing;
    }
  }

  const mediaRows = await findTicketMediaForDeletion(ticketId, companyId);
  const messageCount = await Message.count({ where: { ticketId } });

  const audit = await MediaDeletionAudit.create({
    companyId,
    ticketId,
    requestedByUserId: user.id,
    operation: "ticket_permanent_delete",
    reason: reason || null,
    messageCount,
    mediaCount: mediaRows.length,
    bytesRemoved: 0,
    status: "pending",
    details: {
      queuedAt: new Date().toISOString()
    }
  });

  await ticket.update({
    permanentDeleteRequestedAt: new Date(),
    permanentDeleteRequestedBy: user.id
  });

  await MessageMediaFile.update(
    {
      status: "delete_pending",
      deleteRequestedAt: new Date()
    },
    {
      where: {
        ticketId,
        companyId,
        deletedAt: null
      }
    }
  );

  const { enqueuePermanentTicketDeletion } =
    await import("./MediaCleanupQueueService");
  await enqueuePermanentTicketDeletion({
    companyId,
    ticketId,
    auditId: audit.id,
    requestedByUserId: user.id
  });

  return audit;
};

export const processPermanentTicketDeletion = async ({
  companyId,
  ticketId,
  auditId
}: {
  companyId: number;
  ticketId: number;
  auditId: number;
}): Promise<void> => {
  const audit = await MediaDeletionAudit.findOne({
    where: { id: auditId, companyId, ticketId }
  });

  if (!audit || audit.status === "completed") {
    return;
  }

  await audit.update({ status: "processing" });

  const ticket = await Ticket.findOne({
    where: { id: ticketId, companyId }
  });

  if (!ticket) {
    await audit.update({
      status: "failed",
      details: { ...(audit.details || {}), error: "ticket_not_found" }
    });
    return;
  }

  const mediaRows = await findTicketMediaForDeletion(ticketId, companyId);
  const deleteResult = await deleteStoredMediaBatch(mediaRows);

  const messages = await Message.findAll({
    where: { ticketId },
    attributes: ["id", "mediaUrl", "thumbnailUrl"]
  });

  await Promise.all(
    messages.map(async message => {
      const keys = [
        resolveStorageKeyFromMessage(message.getDataValue("mediaUrl")),
        resolveStorageKeyFromMessage(message.getDataValue("thumbnailUrl"))
      ].filter(Boolean) as string[];

      await Promise.all(
        keys.map(async key => {
          const orphan = await MessageMediaFile.findOne({
            where: { companyId, storageKey: key, ticketId }
          });
          if (orphan && orphan.status !== "deleted") {
            await deleteStoredMediaBatch([orphan]);
          }
        })
      );
    })
  );

  await Message.destroy({ where: { ticketId } });
  await ticket.update({ permanentDeletedAt: new Date() });
  await ticket.destroy();

  await audit.update({
    status: "completed",
    bytesRemoved: deleteResult.bytesRemoved,
    mediaCount: mediaRows.length,
    messageCount: messages.length,
    details: {
      ...(audit.details || {}),
      deletedMedia: deleteResult.deletedCount,
      failedMedia: deleteResult.failedCount,
      completedAt: new Date().toISOString()
    }
  });

  const io = getIO();
  io.to(`company-${companyId}-notification`)
    .to(String(ticketId))
    .emit(`company-${companyId}-ticket`, {
      action: "delete",
      ticketId
    });

  logger.info(
    {
      companyId,
      ticketId,
      auditId,
      deletedMedia: deleteResult.deletedCount,
      failedMedia: deleteResult.failedCount
    },
    "Permanent ticket deletion completed"
  );
};
