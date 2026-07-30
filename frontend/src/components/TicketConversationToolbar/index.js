import React from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Tooltip,
  makeStyles
} from "@material-ui/core";
import DashboardIcon from "@material-ui/icons/Dashboard";
import FolderSharedIcon from "@material-ui/icons/FolderShared";
import LocalOfferOutlinedIcon from "@material-ui/icons/LocalOfferOutlined";
import AndroidIcon from "@material-ui/icons/Android";
import EditIcon from "@material-ui/icons/Edit";
import EmojiObjectsIcon from "@material-ui/icons/EmojiObjects";
import MailOutlineIcon from "@material-ui/icons/MailOutline";
import {
  getOperationalLabel,
  isAiHandlingTicket,
  isAiPausedTicket,
  isHandoffPendingTicket
} from "../../helpers/aiTicketStatus";
import {
  canUserOperateTicket,
  isAiSupervisionTicket
} from "../../helpers/ticketListVisibility";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: theme.spacing(0.5, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    minHeight: 36,
    flexShrink: 0,
    flexWrap: "wrap"
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flexWrap: "wrap"
  },
  aiActive: {
    color: theme.palette.primary.main
  },
  handoffActive: {
    color: theme.palette.error.main
  },
  stateChip: {
    maxWidth: "100%"
  },
  supervisionButton: {
    textTransform: "none",
    marginLeft: theme.spacing(0.5)
  }
}));

const TicketConversationToolbar = ({
  ticket,
  observationMode,
  supervisionParticipating,
  onParticipate,
  onStopParticipating,
  onEscalateEmail,
  onSuggestResponse,
  onResumeAi,
  resumeLoading,
  tagsExpanded,
  onToggleTags,
  onOpenAdminPanel,
  onOpenRepository,
  user
}) => {
  const classes = useStyles();
  const aiActive = isAiHandlingTicket(ticket);
  const aiPaused = isAiPausedTicket(ticket);
  const handoffActive = isHandoffPendingTicket(ticket);
  const canSupervise =
    observationMode &&
    isAiSupervisionTicket(ticket) &&
    !ticket?.userId &&
    (user?.profile === "admin" || user?.super);
  const canUseRepository =
    ticket?.status !== "closed" &&
    (canUserOperateTicket(ticket, user) || isAiHandlingTicket(ticket));
  const canTeachAi = canSupervise || canUserOperateTicket(ticket, user);
  const canEscalateEmail =
    ticket?.status !== "closed" &&
    (canSupervise || canUserOperateTicket(ticket, user));

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
        {canSupervise && !supervisionParticipating && (
          <Button
            size="small"
            variant="outlined"
            color="primary"
            className={classes.supervisionButton}
            startIcon={<EditIcon fontSize="small" />}
            onClick={onParticipate}
          >
            Participar
          </Button>
        )}
        {canEscalateEmail && (
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            className={classes.supervisionButton}
            startIcon={<MailOutlineIcon fontSize="small" />}
            onClick={onEscalateEmail}
          >
            Enviar Email
          </Button>
        )}
        {canSupervise && supervisionParticipating && (
          <Button
            size="small"
            variant="contained"
            color="primary"
            className={classes.supervisionButton}
            onClick={onStopParticipating}
          >
            Sair da conversa
          </Button>
        )}
        {canSupervise && aiPaused && (
          <Button
            size="small"
            variant="outlined"
            color="secondary"
            className={classes.supervisionButton}
            disabled={resumeLoading}
            onClick={onResumeAi}
          >
            {resumeLoading ? "Retomando…" : "Retomar IA"}
          </Button>
        )}
        {canTeachAi && (
          <Button
            size="small"
            variant="outlined"
            className={classes.supervisionButton}
            startIcon={<EmojiObjectsIcon fontSize="small" />}
            onClick={onSuggestResponse}
          >
            Ensinar IA
          </Button>
        )}
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
