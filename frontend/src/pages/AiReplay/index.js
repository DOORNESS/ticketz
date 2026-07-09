import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  makeStyles,
  Divider,
  Chip
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { formatConfidencePercent } from "../../helpers/aiTicketStatus";

const useStyles = makeStyles(theme => ({
  card: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2)
  },
  section: {
    marginTop: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5)
  },
  label: {
    fontWeight: 700,
    marginBottom: 4
  },
  mono: {
    whiteSpace: "pre-wrap",
    fontFamily: "monospace",
    fontSize: "0.85rem",
    background: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: 4,
    maxHeight: 220,
    overflow: "auto"
  },
  arrow: {
    textAlign: "center",
    color: theme.palette.text.secondary,
    margin: theme.spacing(1, 0)
  }
}));

const ReplaySection = ({ label, children }) => {
  const classes = useStyles();
  return (
    <Box className={classes.section}>
      <Typography className={classes.label}>{label}</Typography>
      {children}
    </Box>
  );
};

const AiReplay = () => {
  const classes = useStyles();
  const [replays, setReplays] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get("/ai/replay");
        setReplays(data.replays || []);
      } catch (err) {
        toastError(err);
      }
    };
    load();
  }, []);

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("aiReplay.title")}</Title>
      </MainHeader>

      {replays.map(replay => (
        <Paper key={replay.id} className={classes.card}>
          <Box display="flex" justifyContent="space-between" flexWrap="wrap">
            <Typography variant="subtitle1">
              Ticket #{replay.ticketId} —{" "}
              {new Date(replay.createdAt).toLocaleString()}
            </Typography>
            <Box display="flex" gap={8}>
              {replay.model && <Chip size="small" label={replay.model} />}
              {replay.confidence !== null &&
                replay.confidence !== undefined && (
                  <Chip
                    size="small"
                    color="primary"
                    label={`${formatConfidencePercent(replay.confidence)} confiança`}
                  />
                )}
            </Box>
          </Box>

          <ReplaySection label={i18n.t("aiReplay.userQuestion")}>
            <Typography variant="body2">
              {replay.userQuestion || "-"}
            </Typography>
          </ReplaySection>
          <Typography className={classes.arrow}>↓</Typography>

          <ReplaySection label={i18n.t("aiReplay.history")}>
            <Box className={classes.mono}>
              {JSON.stringify(replay.conversationHistory || [], null, 2)}
            </Box>
          </ReplaySection>
          <Typography className={classes.arrow}>↓</Typography>

          <ReplaySection label={i18n.t("aiReplay.prompt")}>
            <Box className={classes.mono}>{replay.systemPrompt || "-"}</Box>
          </ReplaySection>
          <Typography className={classes.arrow}>↓</Typography>

          <ReplaySection label={i18n.t("aiReplay.documents")}>
            <Box className={classes.mono}>
              {JSON.stringify(replay.usedChunks || [], null, 2)}
            </Box>
          </ReplaySection>
          <Typography className={classes.arrow}>↓</Typography>

          <ReplaySection label={i18n.t("aiReplay.response")}>
            <Typography variant="body2">{replay.aiResponse || "-"}</Typography>
          </ReplaySection>

          <Divider style={{ margin: "12px 0" }} />

          <Box display="flex" flexWrap="wrap" gridGap={8}>
            <Chip
              size="small"
              label={`${i18n.t("aiReplay.tokensIn")}: ${replay.tokensInput || 0}`}
            />
            <Chip
              size="small"
              label={`${i18n.t("aiReplay.tokensOut")}: ${replay.tokensOutput || 0}`}
            />
            <Chip
              size="small"
              label={`${i18n.t("aiReplay.latency")}: ${replay.latencyMs || 0}ms`}
            />
            <Chip
              size="small"
              label={`${i18n.t("aiReplay.cost")}: $${Number(replay.costUsd || 0).toFixed(6)}`}
            />
            {replay.visionSummary && (
              <Chip size="small" label={i18n.t("aiReplay.vision")} />
            )}
            {replay.ocrText && (
              <Chip size="small" label={i18n.t("aiReplay.ocr")} />
            )}
          </Box>
        </Paper>
      ))}

      {!replays.length && (
        <Typography color="textSecondary">
          {i18n.t("aiReplay.empty")}
        </Typography>
      )}
    </MainContainer>
  );
};

export default AiReplay;
