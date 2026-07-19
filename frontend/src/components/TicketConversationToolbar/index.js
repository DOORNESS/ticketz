import React from "react";
import { Box, IconButton, Tooltip, makeStyles } from "@material-ui/core";
import DashboardIcon from "@material-ui/icons/Dashboard";
import FolderSharedIcon from "@material-ui/icons/FolderShared";
import LocalOfferOutlinedIcon from "@material-ui/icons/LocalOfferOutlined";
import AndroidIcon from "@material-ui/icons/Android";
import {
  isAiHandlingTicket,
  isHandoffPendingTicket
} from "../../helpers/aiTicketStatus";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
    padding: theme.spacing(0, 0.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    minHeight: 32,
    flexShrink: 0
  },
  aiActive: {
    color: theme.palette.primary.main
  },
  handoffActive: {
    color: theme.palette.error.main
  }
}));

const TicketConversationToolbar = ({
  ticket,
  observationMode,
  tagsExpanded,
  onToggleTags,
  onOpenAdminPanel,
  onOpenRepository
}) => {
  const classes = useStyles();
  const aiActive = isAiHandlingTicket(ticket);
  const handoffActive = isHandoffPendingTicket(ticket);

  return (
    <Box className={classes.root}>
      {aiActive && (
        <Tooltip title="IA atendendo — abrir painel">
          <IconButton size="small" className={classes.aiActive} onClick={onOpenAdminPanel}>
            <AndroidIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}
      {handoffActive && (
        <Tooltip title="Aguardando humano — abrir painel">
          <IconButton size="small" className={classes.handoffActive} onClick={onOpenAdminPanel}>
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
          disabled={ticket?.status === "closed" || observationMode}
        >
          <FolderSharedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Tags">
        <IconButton size="small" onClick={onToggleTags}>
          <LocalOfferOutlinedIcon fontSize="small" color={tagsExpanded ? "primary" : "inherit"} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Painel do atendimento">
        <IconButton size="small" onClick={onOpenAdminPanel}>
          <DashboardIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export default TicketConversationToolbar;
