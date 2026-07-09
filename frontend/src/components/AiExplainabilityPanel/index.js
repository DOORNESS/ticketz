import React, { useEffect, useState } from "react";
import {
  Box,
  Chip,
  Collapse,
  IconButton,
  Paper,
  Typography,
  makeStyles
} from "@material-ui/core";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import { formatConfidencePercent } from "../../helpers/aiTicketStatus";

const useStyles = makeStyles(theme => ({
  root: {
    margin: theme.spacing(1),
    padding: theme.spacing(1)
  },
  sources: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    marginTop: theme.spacing(1)
  }
}));

const AiExplainabilityPanel = ({ ticket }) => {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = async () => {
      if (!ticket?.id || !ticket?.aiStartedAt) return;
      try {
        const { data: response } = await api.get(
          `/tickets/${ticket.id}/ai/explainability`
        );
        setData(response);
      } catch {
        setData(null);
      }
    };
    load();
  }, [ticket?.id, ticket?.aiStartedAt, ticket?.aiLastConfidence]);

  if (!ticket?.aiStartedAt || (!data?.confidence && !data?.explainability)) {
    return null;
  }

  const sources = data?.explainability?.sources || [];

  return (
    <Paper elevation={0} className={classes.root}>
      <Box display="flex" alignItems="center" justifyContent="space-between">
        <Typography variant="body2">
          {i18n.t("aiExplainability.title")}
          {data?.confidence !== null && data?.confidence !== undefined && (
            <> — {formatConfidencePercent(data.confidence)}</>
          )}
        </Typography>
        <IconButton size="small" onClick={() => setOpen(prev => !prev)}>
          <HelpOutlineIcon fontSize="small" />
        </IconButton>
      </Box>
      <Collapse in={open}>
        <Typography variant="caption" color="textSecondary">
          {i18n.t("aiExplainability.basedOn")}
        </Typography>
        <Box className={classes.sources}>
          {sources.map((source, index) => (
            <Chip
              key={`${source.label}-${index}`}
              size="small"
              label={
                source.similarity
                  ? `${source.label} (${Math.round(source.similarity * 100)}%)`
                  : source.label
              }
            />
          ))}
          {!sources.length && (
            <Typography variant="caption" color="textSecondary">
              {i18n.t("aiExplainability.empty")}
            </Typography>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default AiExplainabilityPanel;
