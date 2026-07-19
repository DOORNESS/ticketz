import React, { useCallback, useContext, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import { toast } from "react-toastify";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { SocketContext } from "../../context/Socket/SocketContext";
import { formatConfidencePercent } from "../../helpers/aiTicketStatus";

const useStyles = makeStyles(theme => ({
  root: {
    margin: theme.spacing(1),
    padding: theme.spacing(1.5),
    borderLeft: `4px solid ${theme.palette.primary.main}`,
    backgroundColor: theme.palette.type === "dark" ? "#1b2a41" : "#f3f8ff"
  },
  title: {
    fontWeight: 700,
    marginBottom: theme.spacing(1)
  },
  actions: {
    display: "flex",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
    flexWrap: "wrap"
  },
  rationale: {
    marginTop: theme.spacing(1),
    color: theme.palette.text.secondary,
    fontSize: "0.875rem"
  },
  docs: {
    marginTop: theme.spacing(1),
    display: "flex",
    flexWrap: "wrap",
    gap: 6
  }
}));

const AiCopilotPanel = ({
  ticket,
  compact = false,
  externalInstruction,
  onApplySuggestion
}) => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [instruction, setInstruction] = useState("");
  const socketManager = useContext(SocketContext);

  const quickActions = [
    "Resumir atendimento",
    "Sugerir resposta",
    "Procurar solução",
    "Buscar documento",
    "Analisar imagem",
    "Transcrever áudio",
    "Preparar handoff"
  ];

  const requestCopilot = useCallback(
    async (payload = {}) => {
      if (!ticket?.id || !ticket?.userId || ticket.status !== "open") {
        return;
      }

      try {
        setLoading(true);
        const { data } = await api.post(
          `/tickets/${ticket.id}/ai/copilot`,
          payload
        );
        setSuggestion(data?.suggestion || null);
      } catch (err) {
        if (err?.response?.status !== 403) {
          toastError(err);
        }
      } finally {
        setLoading(false);
      }
    },
    [ticket?.id, ticket?.userId, ticket?.status]
  );

  const loadSuggestion = useCallback(async () => {
    if (!ticket?.id || !ticket?.userId || ticket.status !== "open") {
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.get(`/tickets/${ticket.id}/ai/copilot`);
      setSuggestion(data?.suggestion || null);
    } catch {
      setSuggestion(null);
    } finally {
      setLoading(false);
    }
  }, [ticket?.id, ticket?.userId, ticket?.status]);

  useEffect(() => {
    loadSuggestion();
  }, [loadSuggestion]);

  useEffect(() => {
    const companyId = localStorage.getItem("companyId");
    const socket = socketManager.GetSocket(companyId);

    const onCopilotUpdate = data => {
      if (data.ticketId === ticket?.id) {
        setSuggestion(data.suggestion);
      }
    };

    socket.on(`company-${companyId}-ai-copilot`, onCopilotUpdate);

    return () => {
      socket.off(`company-${companyId}-ai-copilot`, onCopilotUpdate);
    };
  }, [ticket?.id, socketManager]);

  useEffect(() => {
    if (!externalInstruction) return;
    const instruction = externalInstruction.replace(/-\d+$/, "");
    requestCopilot({ instruction, refresh: true });
  }, [externalInstruction, requestCopilot]);

  const runAction = async action => {
    if (!suggestion?.id) return;

    try {
      if (action === "copy") {
        await navigator.clipboard.writeText(suggestion.suggestedResponse);
        toast.success(i18n.t("aiCopilot.copied"));
      }

      await api.post(`/tickets/${ticket.id}/ai/copilot/action`, {
        suggestionId: suggestion.id,
        action
      });

      if (action === "send") {
        toast.success(i18n.t("aiCopilot.sent"));
      }

      if (action !== "copy") {
        setSuggestion(null);
      }
    } catch (err) {
      toastError(err);
    }
  };

  if (!ticket?.userId || ticket.status !== "open") {
    return null;
  }

  return (
    <Paper elevation={0} className={classes.root}>
      {!compact && (
        <Typography className={classes.title}>
          {i18n.t("aiCopilot.title")}
        </Typography>
      )}

      {!compact && (
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          label="Perguntar à IA"
          value={instruction}
          onChange={event => setInstruction(event.target.value)}
          disabled={loading}
        />
      )}

      {!compact && (
        <Box className={classes.actions}>
          {quickActions.map(action => (
            <Button
              key={action}
              size="small"
              variant="outlined"
              disabled={loading}
              onClick={() =>
                requestCopilot({ instruction: action, refresh: true })
              }
            >
              {action}
            </Button>
          ))}
          <Button
            size="small"
            color="primary"
            variant="contained"
            disabled={loading}
            onClick={() =>
              requestCopilot({
                instruction:
                  instruction.trim() ||
                  "Analise a conversa e sugira a melhor resposta agora.",
                refresh: true
              })
            }
          >
            Chamar IA
          </Button>
        </Box>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={1}>
          <CircularProgress size={22} />
        </Box>
      ) : suggestion ? (
        <>
          <Typography variant="body2">
            {suggestion.suggestedResponse}
          </Typography>
          {suggestion.rationale && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.rationale")}: {suggestion.rationale}
            </Typography>
          )}
          {suggestion.improvedResponse && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.improved")}: {suggestion.improvedResponse}
            </Typography>
          )}
          {suggestion.relatedDocument && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.relatedDocument")}:{" "}
              {suggestion.relatedDocument}
            </Typography>
          )}
          {suggestion.nextSteps && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.nextSteps")}: {suggestion.nextSteps}
            </Typography>
          )}
          {suggestion.riskAssessment && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.risk")}: {suggestion.riskAssessment}
            </Typography>
          )}
          {suggestion.customerSentiment && (
            <Typography className={classes.rationale}>
              {i18n.t("aiCopilot.sentiment")}: {suggestion.customerSentiment}
            </Typography>
          )}
          {suggestion.confidence !== null &&
            suggestion.confidence !== undefined && (
              <Typography className={classes.rationale}>
                {i18n.t("aiCopilot.confidence")}:{" "}
                {formatConfidencePercent(suggestion.confidence)}
              </Typography>
            )}
          {Array.isArray(suggestion.usedChunks) &&
            suggestion.usedChunks.length > 0 && (
              <Box className={classes.docs}>
                {suggestion.usedChunks.slice(0, 3).map((chunk, index) => (
                  <Chip
                    key={`${chunk.documentTitle || "doc"}-${index}`}
                    size="small"
                    label={chunk.documentTitle || chunk.topic || "Documento"}
                  />
                ))}
              </Box>
            )}
          <Box className={classes.actions}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => runAction("copy")}
            >
              {i18n.t("aiCopilot.copy")}
            </Button>
            {onApplySuggestion && (
              <Button
                size="small"
                variant="contained"
                color="secondary"
                onClick={() => {
                  onApplySuggestion(suggestion.suggestedResponse);
                  toast.success("Sugestão aplicada no campo de mensagem");
                }}
              >
                Usar no campo
              </Button>
            )}
            <Button
              size="small"
              variant="contained"
              color="primary"
              onClick={() => runAction("send")}
            >
              {i18n.t("aiCopilot.send")}
            </Button>
            <Button size="small" onClick={() => runAction("ignore")}>
              {i18n.t("aiCopilot.ignore")}
            </Button>
          </Box>
        </>
      ) : (
        <Typography variant="body2" color="textSecondary">
          {i18n.t("aiCopilot.empty")}
        </Typography>
      )}
    </Paper>
  );
};

export default AiCopilotPanel;
