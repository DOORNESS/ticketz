import React, { useEffect, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Paper,
  Typography,
  makeStyles
} from "@material-ui/core";
import api from "../../../services/api";
import toastError from "../../../errors/toastError";

const useStyles = makeStyles(theme => ({
  root: {
    margin: theme.spacing(1),
    padding: theme.spacing(1.5)
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1)
  },
  item: {
    padding: theme.spacing(1),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default
  },
  itemHeader: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing(0.75),
    marginBottom: theme.spacing(0.5)
  },
  meta: {
    color: theme.palette.text.secondary,
    fontSize: "0.75rem"
  }
}));

const RISK_COLORS = {
  read: "default",
  handoff: "primary",
  write: "secondary",
  destructive: "secondary"
};

const formatDate = value =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const TicketAiTimeline = ({ ticketId }) => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!ticketId) {
        setLogs([]);
        return;
      }

      try {
        setLoading(true);
        const { data } = await api.get("/ai/tool-executions", {
          params: { ticketId }
        });
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        toastError(err);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ticketId]);

  if (!ticketId) {
    return null;
  }

  return (
    <Paper elevation={0} className={classes.root}>
      <Typography variant="subtitle2">Timeline de ferramentas IA</Typography>
      <Typography variant="caption" color="textSecondary">
        Execuções registradas para o ticket #{ticketId}
      </Typography>

      {loading ? (
        <Box display="flex" justifyContent="center" py={2}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <div className={classes.list}>
          {logs.length ? (
            logs.map(log => (
              <div key={log.id} className={classes.item}>
                <div className={classes.itemHeader}>
                  <Typography variant="body2">
                    <strong>{log.toolId}</strong>
                  </Typography>
                  <Chip
                    size="small"
                    label={log.success ? "Sucesso" : "Falha"}
                    color={log.success ? "primary" : "secondary"}
                  />
                  {log.riskLevel && (
                    <Chip
                      size="small"
                      label={log.riskLevel}
                      color={RISK_COLORS[log.riskLevel] || "default"}
                      variant={
                        log.riskLevel === "write" ||
                        log.riskLevel === "destructive"
                          ? "default"
                          : "outlined"
                      }
                    />
                  )}
                  {log.latencyMs != null && (
                    <Typography className={classes.meta}>
                      {log.latencyMs}ms
                    </Typography>
                  )}
                </div>
                <Typography className={classes.meta}>
                  {formatDate(log.createdAt)}
                  {log.errorCode ? ` · ${log.errorCode}` : ""}
                </Typography>
                {log.outputSanitized && (
                  <Typography
                    variant="caption"
                    display="block"
                    style={{ marginTop: 4, whiteSpace: "pre-wrap" }}
                  >
                    {log.outputSanitized}
                  </Typography>
                )}
              </div>
            ))
          ) : (
            <Typography variant="body2" color="textSecondary">
              Nenhuma execução de ferramenta registrada.
            </Typography>
          )}
        </div>
      )}
    </Paper>
  );
};

export default TicketAiTimeline;
