import React, { useState } from "react";
import {
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Typography,
  makeStyles
} from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import DashboardIcon from "@material-ui/icons/Dashboard";
import AiExplainabilityPanel from "../AiExplainabilityPanel";
import TicketAiTimeline from "../Ai/TicketAiTimeline";
import AiCopilotPanel from "../AiCopilotPanel";
import { canUserOperateTicket } from "../../helpers/ticketListVisibility";

const useStyles = makeStyles(theme => ({
  drawer: {
    width: 380,
    maxWidth: "92vw"
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(1.5, 2),
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  section: {
    padding: theme.spacing(1, 2)
  },
  sectionTitle: {
    fontWeight: 700,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1)
  },
  actionRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.75)
  }
}));

const COPILOT_STYLES = [
  { key: "default", label: "Padrão" },
  { key: "short", label: "Curta" },
  { key: "technical", label: "Técnica" },
  { key: "cordial", label: "Cordial" },
  { key: "objective", label: "Objetiva" }
];

const TicketAdminPanel = ({
  open,
  onClose,
  ticket,
  observationMode,
  onOpenRepository,
  actionButtons
}) => {
  const classes = useStyles();
  const [copilotInstruction, setCopilotInstruction] = useState("");
  const [copilotStyle, setCopilotStyle] = useState("default");

  const runCopilotQuick = (instruction, style = copilotStyle) => {
    setCopilotStyle(style);
    setCopilotInstruction(`${instruction}|${style}|${Date.now()}`);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box className={classes.drawer}>
        <Box className={classes.header}>
          <Box display="flex" alignItems="center" gridGap={8}>
            <DashboardIcon color="primary" />
            <Typography variant="subtitle1">Painel do atendimento</Typography>
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box className={classes.section}>
          <Typography className={classes.sectionTitle}>Atendimento</Typography>
          <Box className={classes.actionRow}>{actionButtons}</Box>
        </Box>

        <Divider />

        <Box className={classes.section}>
          <Typography className={classes.sectionTitle}>
            IA e Copiloto
          </Typography>
          <Box className={classes.actionRow} mb={1}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => runCopilotQuick("Sugerir resposta")}
            >
              Sugerir resposta
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => runCopilotQuick("Resumir conversa")}
            >
              Resumir
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() =>
                runCopilotQuick(
                  "Sugerir material do Repositório para este atendimento"
                )
              }
            >
              Material Repositório
            </Button>
          </Box>
          <Box className={classes.actionRow} mb={1}>
            {COPILOT_STYLES.map(style => (
              <Button
                key={style.key}
                size="small"
                variant={copilotStyle === style.key ? "contained" : "outlined"}
                color={copilotStyle === style.key ? "primary" : "default"}
                onClick={() => runCopilotQuick("Sugerir resposta", style.key)}
              >
                {style.label}
              </Button>
            ))}
            <Button
              size="small"
              onClick={() =>
                runCopilotQuick("Regenerar sugestão com novo enfoque")
              }
            >
              Regenerar
            </Button>
          </Box>
          <AiCopilotPanel
            ticket={ticket}
            compact
            externalInstruction={copilotInstruction}
            copilotStyle={copilotStyle}
            onApplySuggestion={text => {
              if (typeof window.__ticketzApplySuggestedReply === "function") {
                window.__ticketzApplySuggestedReply(text);
              }
            }}
          />
        </Box>

        <Divider />

        <Box className={classes.section}>
          <Typography className={classes.sectionTitle}>Conteúdos</Typography>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={onOpenRepository}
            disabled={
              ticket?.status === "closed" || !canUserOperateTicket(ticket, user)
            }
          >
            Abrir Repositório
          </Button>
        </Box>

        <Divider />

        <Box className={classes.section}>
          <Typography className={classes.sectionTitle}>Diagnóstico</Typography>
          <AiExplainabilityPanel ticket={ticket} />
          <TicketAiTimeline ticketId={ticket?.id} />
        </Box>
      </Box>
    </Drawer>
  );
};

export default TicketAdminPanel;
