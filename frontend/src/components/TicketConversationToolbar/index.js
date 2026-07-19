import React from "react";
import { Box, Chip, IconButton, Tooltip, makeStyles } from "@material-ui/core";
import DashboardIcon from "@material-ui/icons/Dashboard";
import FolderSharedIcon from "@material-ui/icons/FolderShared";
import LocalOfferOutlinedIcon from "@material-ui/icons/LocalOfferOutlined";
import AndroidIcon from "@material-ui/icons/Android";
import {
  getOperationalLabel,
  isAiHandlingTicket,
  isHandoffPendingTicket
} from "../../helpers/aiTicketStatus";
import { canUserOperateTicket } from "../../helpers/ticketListVisibility";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: theme.spacing(0.5, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    minHeight: 36,
    flexShrink: 0
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 2
  },
  aiActive: {
    color: theme.palette.primary.main
  },
  handoffActive: {
    color: theme.palette.error.main
  },
  stateChip: {
    maxWidth: "100%"
  }
}));

const TicketConversationToolbar = ({
  ticket,
  observationMode,
  tagsExpanded,
  onToggleTags,
  onOpenAdminPanel,
  onOpenRepository,
  user
}) => {
  const classes = useStyles();
  const aiActive = isAiHandlingTicket(ticket);
  const handoffActive = isHandoffPendingTicket(ticket);
  const canUseRepository =
    ticket?.status !== "closed" &&
    (canUserOperateTicket(ticket, user) || isAiHandlingTicket(ticket));

  return (
    <Box className={classes.root}>
      <Chip
        size="small"
        className={classes.stateChip}
        color={aiActive ? "primary" : handoffActive ? "secondary" : "default"}
        label={getOperationalLabel(ticket)}
        title={
          ticket?.operationalState?.blockReason ||
          ticket?.operationalState?.label ||
          ""
        }
      />
      <Box className={classes.actions}>
        {aiActive && (
          <Tooltip title="IA atendendo — abrir painel">
            <IconButton
              size="small"
              className={classes.aiActive}
              onClick={onOpenAdminPanel}
            >
              <AndroidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {handoffActive && (
          <Tooltip title="Aguardando humano — abrir painel">
            <IconButton
              size="small"
              className={classes.handoffActive}
              onClick={onOpenAdminPanel}
            >
              <AndroidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {observationMode && !aiActive && !handoffActive && (
          <Tooltip title="Modo observação">
            <IconButton size="small" onClick={onOpenAdminPanel}>
              <AndroidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Repositório">
          <IconButton
            size="small"
            onClick={onOpenRepository}
            disabled={!canUseRepository}
          >
            <FolderSharedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Tags">
          <IconButton size="small" onClick={onToggleTags}>
            <LocalOfferOutlinedIcon
              fontSize="small"
              color={tagsExpanded ? "primary" : "inherit"}
            />
          </IconButton>
        </Tooltip>
        <Tooltip title="Painel do atendimento">
          <IconButton size="small" onClick={onOpenAdminPanel}>
            <DashboardIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};

export default TicketConversationToolbar;
