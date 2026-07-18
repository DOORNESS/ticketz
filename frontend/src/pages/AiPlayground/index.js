import React, { useEffect, useState } from "react";
import {
  Button,
  Box,
  CircularProgress,
  Grid,
  Typography,
  List,
  ListItem,
  ListItemText
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { useAiPageStyles } from "../../components/Ai/shared";
import {
  AiFormSelect,
  AiFormTextField,
  AiMetricCard,
  AiSectionPaper
} from "../../components/Ai/forms";

const AiPlayground = () => {
  const classes = useAiPageStyles();
  const [agents, setAgents] = useState([]);
  const [bases, setBases] = useState([]);
  const [agentId, setAgentId] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingResult, setRoutingResult] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: agentsData }, { data: basesData }] = await Promise.all([
          api.get("/ai/agents"),
          api.get("/ai/knowledge-bases")
        ]);
        setAgents((agentsData || []).filter(agent => agent.active));
        setBases((basesData || []).filter(base => base.active));
      } catch (err) {
        toastError(err);
      }
    };
    load();
  }, []);

  const handleRoutingPreview = async () => {
    if (!message.trim()) return;
    try {
      setRoutingLoading(true);
      const { data } = await api.post("/ai/orchestrator/preview", {
        message: message.trim()
      });
      setRoutingResult(data);
      if (data?.selectedAgent?.id) {
        setAgentId(String(data.selectedAgent.id));
      }
    } catch (err) {
      toastError(err);
      setRoutingResult(null);
    } finally {
      setRoutingLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!agentId || !message.trim()) return;
    try {
      setLoading(true);
      const { data } = await api.post("/ai/playground", {
        agentId: Number(agentId),
        knowledgeBaseId: knowledgeBaseId ? Number(knowledgeBaseId) : undefined,
        message: message.trim()
      });
      setResult(data);
    } catch (err) {
      toastError(err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Playground</Title>
      </MainHeader>

      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Roteamento (Orquestrador)"
          subtitle="Teste qual especialista seria escolhido antes de gerar a resposta."
        >
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <AiFormTextField
                label="Mensagem para classificar"
                multiline
                rows={3}
                value={message}
                onChange={e => setMessage(e.target.value)}
              />
            </Grid>
          </Grid>
          <div className={classes.actionsRow}>
            <Button
              variant="outlined"
              color="primary"
              disabled={routingLoading || !message.trim()}
              onClick={handleRoutingPreview}
            >
              {routingLoading ? "Classificando..." : "Testar roteamento"}
            </Button>
          </div>
          {routingResult && (
            <Box mt={2} p={2} bgcolor="#f5f5f5" borderRadius={4}>
              <Typography variant="body2">
                Agente: <strong>{routingResult.selectedAgent?.name}</strong> (
                {routingResult.selectedAgent?.specialty}) · Confiança:{" "}
                {(Number(routingResult.confidence || 0) * 100).toFixed(0)}%
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {routingResult.reason}
                {routingResult.fallbackUsed ? " · fallback determinístico" : ""}
              </Typography>
            </Box>
          )}
        </AiSectionPaper>

        <AiSectionPaper
          title="Testar agente"
          subtitle="Simule perguntas e valide respostas antes de colocar em produção."
        >
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <AiFormSelect
                label="Agente"
                value={agentId}
                onChange={e => setAgentId(String(e.target.value))}
                options={agents.map(agent => ({
                  value: agent.id,
                  label: agent.name
                }))}
                helperText="Selecione o agente que responderá à pergunta."
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <AiFormSelect
                label="Base de conhecimento (opcional)"
                value={knowledgeBaseId}
                onChange={e => setKnowledgeBaseId(String(e.target.value))}
                emptyLabel="Todas vinculadas ao agente"
                options={bases.map(base => ({
                  value: base.id,
                  label: base.name
                }))}
                helperText="Deixe vazio para usar todas as bases vinculadas ao agente."
              />
            </Grid>
            <Grid item xs={12}>
              <AiFormTextField
                label="Pergunta"
                multiline
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                helperText="Descreva a pergunta do cliente como no WhatsApp."
              />
            </Grid>
          </Grid>

          <div className={classes.actionsRow}>
            <Button
              variant="contained"
              color="primary"
              disabled={loading || !agentId || !message.trim()}
              onClick={handleSubmit}
            >
              {loading ? "Processando..." : "Enviar pergunta"}
            </Button>
          </div>
        </AiSectionPaper>

        {loading && (
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress size={28} />
          </Box>
        )}

        {result && (
          <>
            <AiSectionPaper title="Resposta da IA">
              <div className={classes.resultCard}>
                <Typography variant="body1" style={{ whiteSpace: "pre-wrap" }}>
                  {result.response}
                </Typography>
              </div>

              <Box mt={2}>
                <div className={classes.metricsGrid}>
                  <AiMetricCard label="Modelo" value={result.model} />
                  <AiMetricCard
                    label="Tokens entrada"
                    value={result.tokensInput}
                  />
                  <AiMetricCard
                    label="Tokens saída"
                    value={result.tokensOutput}
                  />
                  <AiMetricCard
                    label="Custo estimado"
                    value={`$${Number(result.estimatedCostUsd || 0).toFixed(6)}`}
                  />
                  <AiMetricCard
                    label="Tempo de resposta"
                    value={`${result.latencyMs}ms`}
                  />
                </div>
              </Box>
            </AiSectionPaper>

            <AiSectionPaper
              title={`Chunks utilizados (${result.chunks?.length || 0})`}
              subtitle="Trechos da base de conhecimento usados para compor a resposta."
            >
              <List dense>
                {(result.chunks || []).map(chunk => (
                  <ListItem key={chunk.id} className={classes.chunkItem}>
                    <ListItemText
                      primary={`${(chunk.similarity * 100).toFixed(1)}% — ${chunk.documentTitle || "Documento"}`}
                      secondary={chunk.content}
                    />
                  </ListItem>
                ))}
                {!result.chunks?.length && (
                  <Typography variant="body2" color="textSecondary">
                    Nenhum chunk relevante foi utilizado.
                  </Typography>
                )}
              </List>
            </AiSectionPaper>
          </>
        )}
      </div>
    </MainContainer>
  );
};

export default AiPlayground;
