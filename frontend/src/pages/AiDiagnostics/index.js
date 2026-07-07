import React, { useEffect, useState } from "react";
import {
  Button,
  Paper,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Box,
  CircularProgress
} from "@material-ui/core";
import {
  CheckCircle,
  Error as ErrorIcon,
  Warning,
  HelpOutline
} from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const statusIcon = status => {
  if (status === "ok") return <CheckCircle style={{ color: "#4caf50" }} />;
  if (status === "warning") return <Warning style={{ color: "#ff9800" }} />;
  if (status === "error") return <ErrorIcon style={{ color: "#f44336" }} />;
  return <HelpOutline style={{ color: "#9e9e9e" }} />;
};

const statusColor = status => {
  if (status === "ok") return "primary";
  if (status === "warning") return "default";
  if (status === "error") return "secondary";
  return "default";
};

const AiDiagnostics = () => {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [data, setData] = useState(null);

  const load = async (live = false) => {
    try {
      if (live) setRunning(true);
      else setLoading(true);

      const { data: response } = live
        ? await api.post("/ai/diagnostics/run")
        : await api.get("/ai/diagnostics");

      setData(live ? response.company : response);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
      setRunning(false);
    }
  };

  useEffect(() => {
    load(false);
  }, []);

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Diagnóstico</Title>
        <Button
          variant="contained"
          color="primary"
          disabled={running}
          onClick={() => load(true)}
        >
          {running ? "Executando..." : "Executar diagnóstico novamente"}
        </Button>
      </MainHeader>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper style={{ padding: 16, marginBottom: 16 }}>
            <Typography variant="h6" gutterBottom>
              Status geral:{" "}
              <Chip
                label={data?.overall || "unknown"}
                color={statusColor(data?.overall)}
              />
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Verificado em: {data?.checkedAt || "-"}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              IA habilitada: {data?.aiFeaturesEnabled ? "Sim" : "Não"}
            </Typography>
            {data?.pendingMigrations?.length > 0 && (
              <Typography
                variant="body2"
                color="error"
                style={{ marginTop: 8 }}
              >
                Migrations pendentes: {data.pendingMigrations.join(", ")}
              </Typography>
            )}
          </Paper>

          {data?.errors?.length > 0 && (
            <Paper style={{ padding: 16, marginBottom: 16 }}>
              <Typography variant="subtitle1" color="error">
                Erros
              </Typography>
              <List dense>
                {data.errors.map(msg => (
                  <ListItem key={msg}>
                    <ListItemText primary={msg} />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          {data?.warnings?.length > 0 && (
            <Paper style={{ padding: 16, marginBottom: 16 }}>
              <Typography variant="subtitle1" style={{ color: "#ff9800" }}>
                Avisos
              </Typography>
              <List dense>
                {data.warnings.map(msg => (
                  <ListItem key={msg}>
                    <ListItemText primary={msg} />
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          <Paper>
            <List>
              {(data?.items || []).map(item => (
                <ListItem key={item.key}>
                  <ListItemIcon>{statusIcon(item.status)}</ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    secondary={
                      item.key === "ai_queue" && item.details
                        ? `${item.message} | média: ${item.details.avgDurationMs || 0}ms | máx: ${item.details.maxDurationMs || 0}ms | retries: ${item.details.retries || 0}`
                        : item.message
                    }
                  />
                  <Chip size="small" label={item.status} />
                </ListItem>
              ))}
            </List>
          </Paper>
        </>
      )}
    </MainContainer>
  );
};

export default AiDiagnostics;
