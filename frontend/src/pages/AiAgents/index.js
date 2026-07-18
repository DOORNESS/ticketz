import React, { useCallback, useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Switch,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Link,
  CircularProgress,
  Box,
  Grid,
  Chip
} from "@material-ui/core";
import { Alert } from "@material-ui/lab";
import { DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError, { resolveErrorMessage } from "../../errors/toastError";
import { toast } from "react-toastify";
import AiSetupWizard from "../../components/AiSetupWizard";
import { useAiPageStyles } from "../../components/Ai/shared";
import { AiFormTextField } from "../../components/Ai/forms";

const defaultAgent = {
  name: "",
  active: true,
  role: "legacy",
  specialty: "geral",
  routingDescription: "",
  routingKeywordsText: "",
  priority: 100,
  knowledgeBaseIds: [],
  provider: "openai",
  textModel: "gpt-4o-mini",
  visionModel: "gpt-4o-mini",
  transcriptionModel: "gpt-4o-mini-transcribe",
  basePrompt: "",
  temperature: 0.3,
  maxTokens: 1024,
  fallbackQueueId: "",
  handoffMessage:
    "Vou transferir você para um atendente humano. Por favor, aguarde.",
  ackEnabled: false,
  ackMessage: ""
};

const normalizeQueues = data => {
  if (Array.isArray(data)) {
    return data;
  }

  if (Array.isArray(data?.queues)) {
    return data.queues;
  }

  return [];
};

const RISK_LABELS = {
  read: "Leitura",
  write: "Escrita",
  handoff: "Handoff",
  destructive: "Destrutiva"
};

const isWriteRisk = riskLevel =>
  riskLevel === "write" || riskLevel === "destructive";

const groupToolsByRisk = tools => {
  const readTools = [];
  const writeTools = [];

  tools.forEach(tool => {
    if (isWriteRisk(tool.riskLevel)) {
      writeTools.push(tool);
    } else {
      readTools.push(tool);
    }
  });

  return { readTools, writeTools };
};

const renderRiskBadge = riskLevel => (
  <Chip
    size="small"
    label={RISK_LABELS[riskLevel] || riskLevel || "—"}
    color={isWriteRisk(riskLevel) ? "secondary" : "default"}
    style={{ marginLeft: 8 }}
  />
);

const renderToolToggle = (tool, agentTools, setAgentTools) => (
  <FormControlLabel
    key={tool.id}
    control={
      <Switch
        checked={agentTools[tool.id] !== false}
        onChange={e =>
          setAgentTools(prev => ({
            ...prev,
            [tool.id]: e.target.checked
          }))
        }
        color="primary"
      />
    }
    label={
      <span>
        {tool.name} — {tool.description}
        {renderRiskBadge(tool.riskLevel)}
      </span>
    }
  />
);

const SectionBlock = ({ title, subtitle, children }) => {
  const classes = useAiPageStyles();

  return (
    <Box mb={2}>
      <Typography variant="subtitle1" className={classes.sectionTitle}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" className={classes.sectionSubtitle}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
};

const AiAgents = () => {
  const classes = useAiPageStyles();
  const [agents, setAgents] = useState([]);
  const [queues, setQueues] = useState([]);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [publishedAssetsByBase, setPublishedAssetsByBase] = useState({});
  const [orchestratorStatus, setOrchestratorStatus] = useState(null);
  const [registeredTools, setRegisteredTools] = useState([]);
  const [agentTools, setAgentTools] = useState({});
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultAgent);
  const [editingId, setEditingId] = useState(null);
  const [saveError, setSaveError] = useState("");

  const loadAgents = async () => {
    try {
      const { data } = await api.get("/ai/agents");
      setAgents(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    }
  };

  const loadQueues = useCallback(async () => {
    setQueuesLoading(true);
    try {
      const { data } = await api.get("/queue");
      const activeQueues = normalizeQueues(data);
      setQueues(activeQueues);
      return activeQueues;
    } catch (err) {
      toastError(err);
      setQueues([]);
      return [];
    } finally {
      setQueuesLoading(false);
    }
  }, []);

  const loadKnowledgeBases = useCallback(async () => {
    try {
      const [{ data: kbData }, { data: assetsData }] = await Promise.all([
        api.get("/ai/knowledge-bases"),
        api.get("/ai/assets", { params: { lifecycleStatus: "published" } })
      ]);
      setKnowledgeBases(Array.isArray(kbData) ? kbData : []);

      const counts = {};
      (Array.isArray(assetsData) ? assetsData : []).forEach(asset => {
        const baseId = asset.knowledgeBaseId;
        if (baseId) {
          counts[baseId] = (counts[baseId] || 0) + 1;
        }
      });
      setPublishedAssetsByBase(counts);
    } catch (err) {
      toastError(err);
      setKnowledgeBases([]);
      setPublishedAssetsByBase({});
    }
  }, []);

  const loadOrchestratorStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/orchestrator/status");
      setOrchestratorStatus(data);
    } catch (err) {
      setOrchestratorStatus(null);
    }
  }, []);

  const loadRegisteredTools = useCallback(async () => {
    try {
      const { data } = await api.get("/ai/tools");
      setRegisteredTools(Array.isArray(data) ? data : []);
    } catch (err) {
      setRegisteredTools([]);
    }
  }, []);

  const loadAgentTools = useCallback(async agentId => {
    if (!agentId) {
      setAgentTools({});
      return;
    }
    try {
      const { data } = await api.get(`/ai/agents/${agentId}/tools`);
      const map = {};
      (data?.tools || []).forEach(item => {
        map[item.toolId] = item.enabled !== false;
      });
      setAgentTools(map);
    } catch (err) {
      setAgentTools({});
    }
  }, []);

  useEffect(() => {
    loadAgents();
    loadQueues();
    loadKnowledgeBases();
    loadOrchestratorStatus();
    loadRegisteredTools();
  }, [
    loadQueues,
    loadKnowledgeBases,
    loadOrchestratorStatus,
    loadRegisteredTools
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    loadQueues().then(activeQueues => {
      if (!editingId && activeQueues.length === 1) {
        setForm(prev => ({
          ...prev,
          fallbackQueueId: String(activeQueues[0].id)
        }));
      }
    });
  }, [open, editingId, loadQueues]);

  const handleSave = async () => {
    setSaveError("");
    try {
      const routingKeywords = form.routingKeywordsText
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

      const payload = {
        ...form,
        routingKeywords,
        fallbackQueueId: form.fallbackQueueId
          ? Number(form.fallbackQueueId)
          : null,
        temperature: Number(form.temperature),
        maxTokens: Number(form.maxTokens),
        priority: Number(form.priority),
        knowledgeBaseIds: (form.knowledgeBaseIds || []).map(Number)
      };

      delete payload.routingKeywordsText;

      if (editingId) {
        await api.put(`/ai/agents/${editingId}`, payload);
        if (form.role !== "orchestrator") {
          await api.put(`/ai/agents/${editingId}/tools`, {
            tools: registeredTools.map(tool => ({
              toolId: tool.id,
              enabled: agentTools[tool.id] !== false
            }))
          });
        }
      } else {
        const { data: created } = await api.post("/ai/agents", payload);
        if (created?.id && form.role !== "orchestrator") {
          await api.put(`/ai/agents/${created.id}/tools`, {
            tools: registeredTools.map(tool => ({
              toolId: tool.id,
              enabled: agentTools[tool.id] !== false
            }))
          });
        }
      }

      toast.success("Agente salvo com sucesso");
      setOpen(false);
      setEditingId(null);
      setForm(defaultAgent);
      loadAgents();
    } catch (err) {
      setSaveError(
        resolveErrorMessage(err) || "Não foi possível salvar o agente."
      );
      toastError(err);
    }
  };

  const handleEdit = agent => {
    setEditingId(agent.id);
    setSaveError("");
    setForm({
      name: agent.name,
      active: agent.active,
      role: agent.role || "legacy",
      specialty: agent.specialty || "geral",
      routingDescription: agent.routingDescription || "",
      routingKeywordsText: Array.isArray(agent.routingKeywords)
        ? agent.routingKeywords.join(", ")
        : "",
      priority: agent.priority ?? 100,
      knowledgeBaseIds: agent.knowledgeBaseIds || [],
      provider: agent.provider,
      textModel: agent.textModel,
      visionModel: agent.visionModel,
      transcriptionModel: agent.transcriptionModel,
      basePrompt: agent.basePrompt || "",
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      fallbackQueueId: agent.fallbackQueueId
        ? String(agent.fallbackQueueId)
        : "",
      handoffMessage: agent.handoffMessage || defaultAgent.handoffMessage,
      ackEnabled: !!agent.ackEnabled,
      ackMessage: agent.ackMessage || ""
    });
    loadAgentTools(agent.id);
    setOpen(true);
  };

  const handleDelete = async id => {
    try {
      await api.delete(`/ai/agents/${id}`);
      toast.success("Agente removido");
      loadAgents();
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenNewAgent = () => {
    setEditingId(null);
    setForm(defaultAgent);
    setAgentTools(
      registeredTools.reduce((acc, tool) => {
        acc[tool.id] = true;
        return acc;
      }, {})
    );
    setSaveError("");
    setOpen(true);
  };

  const emptyPublishedBases = (form.knowledgeBaseIds || [])
    .map(Number)
    .filter(baseId => !publishedAssetsByBase[baseId])
    .map(baseId => knowledgeBases.find(base => base.id === baseId)?.name)
    .filter(Boolean);

  const renderQueueField = () => {
    if (queuesLoading) {
      return (
        <Box display="flex" alignItems="center" py={1}>
          <CircularProgress size={20} style={{ marginRight: 8 }} />
          <Typography variant="body2" color="textSecondary">
            Carregando filas...
          </Typography>
        </Box>
      );
    }

    if (!queues.length) {
      return (
        <Typography variant="body2" color="textSecondary">
          Nenhuma fila cadastrada.{" "}
          <Link
            component={RouterLink}
            to="/queues"
            onClick={() => setOpen(false)}
          >
            Clique aqui para criar uma.
          </Link>
        </Typography>
      );
    }

    return (
      <FormControl fullWidth variant="outlined" margin="normal">
        <InputLabel id="fallback-queue-label">
          Fila padrão de transferência
        </InputLabel>
        <Select
          labelId="fallback-queue-label"
          label="Fila padrão de transferência"
          value={form.fallbackQueueId}
          onChange={e =>
            setForm({ ...form, fallbackQueueId: String(e.target.value) })
          }
        >
          <MenuItem value="">
            <em>Selecione (opcional)</em>
          </MenuItem>
          {queues.map(queue => (
            <MenuItem key={queue.id} value={String(queue.id)}>
              {queue.name}
            </MenuItem>
          ))}
        </Select>
        <Typography variant="caption" color="textSecondary">
          Fila usada quando a IA transferir o atendimento para um humano.
        </Typography>
      </FormControl>
    );
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Agentes</Title>
        <Button
          variant="contained"
          color="primary"
          onClick={handleOpenNewAgent}
        >
          Novo Agente
        </Button>
      </MainHeader>
      <AiSetupWizard />
      {orchestratorStatus && (
        <Box mb={2} p={2} bgcolor="#f5f5f5" borderRadius={4}>
          <Typography variant="body2">
            Orquestrador:{" "}
            {orchestratorStatus.active
              ? "ativo para esta empresa"
              : orchestratorStatus.globalEnabled
                ? "global ON — habilite aiOrchestratorEnabled=enabled na empresa"
                : "inativo (AI_ORCHESTRATOR_ENABLED=false)"}
            {" · "}
            Especialistas: {orchestratorStatus.specialistsCount || 0}
          </Typography>
        </Box>
      )}
      <Paper className={classes.tablePaper} elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Especialidade</TableCell>
              <TableCell>Bases</TableCell>
              <TableCell>Modelo</TableCell>
              <TableCell>Ativo</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {agents.map(agent => (
              <TableRow key={agent.id}>
                <TableCell>{agent.name}</TableCell>
                <TableCell>{agent.role || "legacy"}</TableCell>
                <TableCell>{agent.specialty || "—"}</TableCell>
                <TableCell>
                  {(agent.knowledgeBases || [])
                    .map(base => base.name)
                    .join(", ") || "—"}
                </TableCell>
                <TableCell>{agent.textModel}</TableCell>
                <TableCell>{agent.active ? "Sim" : "Não"}</TableCell>
                <TableCell align="center">
                  <IconButton onClick={() => handleEdit(agent)}>
                    <Edit />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(agent.id)}>
                    <DeleteOutline />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setSaveError("");
        }}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editingId ? "Editar Agente" : "Novo Agente de IA"}
        </DialogTitle>
        <DialogContent dividers>
          {saveError && (
            <Box
              mb={2}
              p={2}
              borderRadius={4}
              bgcolor="#fdecea"
              color="#611a15"
            >
              <Typography variant="body2">{saveError}</Typography>
            </Box>
          )}
          <SectionBlock
            title="Identificação"
            subtitle="Nome e status do agente no painel."
          >
            <AiFormTextField
              label="Nome"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              helperText="Nome exibido internamente para identificar o agente."
            />
            <div className={classes.switchRow}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.active}
                    onChange={e =>
                      setForm({ ...form, active: e.target.checked })
                    }
                    color="primary"
                  />
                }
                label="Ativo"
              />
            </div>
          </SectionBlock>

          <SectionBlock
            title="Roteamento (Fase 1)"
            subtitle="Orquestrador classifica intenção; especialistas consultam bases próprias."
          >
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <FormControl fullWidth variant="outlined" margin="normal">
                  <InputLabel id="agent-role-label">Tipo</InputLabel>
                  <Select
                    labelId="agent-role-label"
                    label="Tipo"
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                  >
                    <MenuItem value="legacy">Legado</MenuItem>
                    <MenuItem value="orchestrator">Orquestrador</MenuItem>
                    <MenuItem value="specialist">Especialista</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              {form.role === "specialist" && (
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth variant="outlined" margin="normal">
                    <InputLabel id="agent-specialty-label">
                      Especialidade
                    </InputLabel>
                    <Select
                      labelId="agent-specialty-label"
                      label="Especialidade"
                      value={form.specialty}
                      onChange={e =>
                        setForm({ ...form, specialty: e.target.value })
                      }
                    >
                      <MenuItem value="faq">FAQ</MenuItem>
                      <MenuItem value="financeiro">Financeiro</MenuItem>
                      <MenuItem value="suporte">Suporte Técnico</MenuItem>
                      <MenuItem value="geral">Atendimento Geral</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              )}
              <Grid item xs={12} md={4}>
                <AiFormTextField
                  label="Prioridade"
                  type="number"
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                  helperText="Menor número = maior prioridade em empates."
                />
              </Grid>
            </Grid>
            {form.role !== "orchestrator" && (
              <>
                <AiFormTextField
                  label="Descrição para roteamento"
                  multiline
                  rows={2}
                  value={form.routingDescription}
                  onChange={e =>
                    setForm({ ...form, routingDescription: e.target.value })
                  }
                  helperText="Explica ao orquestrador quando usar este agente."
                />
                <AiFormTextField
                  label="Palavras-chave (separadas por vírgula)"
                  value={form.routingKeywordsText}
                  onChange={e =>
                    setForm({ ...form, routingKeywordsText: e.target.value })
                  }
                />
              </>
            )}
            {form.role === "specialist" && (
              <>
                <FormControl fullWidth variant="outlined" margin="normal">
                  <InputLabel id="agent-kb-label">
                    Bases de conhecimento
                  </InputLabel>
                  <Select
                    labelId="agent-kb-label"
                    label="Bases de conhecimento"
                    multiple
                    value={form.knowledgeBaseIds}
                    onChange={e =>
                      setForm({
                        ...form,
                        knowledgeBaseIds: e.target.value
                      })
                    }
                    renderValue={selected =>
                      knowledgeBases
                        .filter(base => selected.includes(base.id))
                        .map(base => base.name)
                        .join(", ")
                    }
                  >
                    {knowledgeBases.map(base => (
                      <MenuItem key={base.id} value={base.id}>
                        {base.name}
                        {publishedAssetsByBase[base.id]
                          ? ` (${publishedAssetsByBase[base.id]} pub.)`
                          : " (sem ativos publicados)"}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {emptyPublishedBases.length > 0 && (
                  <Box mt={1}>
                    <Alert severity="warning">
                      Bases sem ativos publicados no RAG:{" "}
                      {emptyPublishedBases.join(", ")}. Publique ativos em{" "}
                      <Link component={RouterLink} to="/ai/assets">
                        Ativos de Conhecimento
                      </Link>{" "}
                      para o especialista consultar conteúdo.
                    </Alert>
                  </Box>
                )}
              </>
            )}
          </SectionBlock>

          {form.role !== "orchestrator" && registeredTools.length > 0 && (
            <SectionBlock
              title="Ferramentas (Fase 3/4)"
              subtitle="Tools executáveis pelo especialista quando AI_TOOLS_ENABLED estiver ativo."
            >
              {(() => {
                const { readTools, writeTools } =
                  groupToolsByRisk(registeredTools);

                return (
                  <>
                    {readTools.length > 0 && (
                      <Box mb={1}>
                        <Typography variant="body2" color="textSecondary">
                          Leitura e consulta
                        </Typography>
                        {readTools.map(tool =>
                          renderToolToggle(tool, agentTools, setAgentTools)
                        )}
                      </Box>
                    )}
                    {writeTools.length > 0 && (
                      <Box>
                        <Typography variant="body2" color="secondary">
                          Escrita e mutação (requer AI_WRITE_TOOLS)
                        </Typography>
                        {writeTools.map(tool =>
                          renderToolToggle(tool, agentTools, setAgentTools)
                        )}
                      </Box>
                    )}
                  </>
                );
              })()}
            </SectionBlock>
          )}

          <SectionBlock
            title="Modelos de IA"
            subtitle="Modelos usados para texto, visão e transcrição de áudio."
          >
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <AiFormTextField
                  label="Modelo de texto"
                  value={form.textModel}
                  onChange={e =>
                    setForm({ ...form, textModel: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <AiFormTextField
                  label="Modelo de visão"
                  value={form.visionModel}
                  onChange={e =>
                    setForm({ ...form, visionModel: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <AiFormTextField
                  label="Modelo de transcrição"
                  value={form.transcriptionModel}
                  onChange={e =>
                    setForm({ ...form, transcriptionModel: e.target.value })
                  }
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <AiFormTextField
                  label="Temperatura"
                  type="number"
                  value={form.temperature}
                  onChange={e =>
                    setForm({ ...form, temperature: e.target.value })
                  }
                  helperText="0 = mais objetivo, 1 = mais criativo."
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <AiFormTextField
                  label="Limite de tokens"
                  type="number"
                  value={form.maxTokens}
                  onChange={e =>
                    setForm({ ...form, maxTokens: e.target.value })
                  }
                />
              </Grid>
            </Grid>
          </SectionBlock>

          <SectionBlock
            title="Comportamento"
            subtitle="Instruções base que orientam o tom e as regras do agente."
          >
            <AiFormTextField
              label="Prompt base"
              multiline
              rows={4}
              value={form.basePrompt}
              onChange={e => setForm({ ...form, basePrompt: e.target.value })}
              helperText="Contexto fixo enviado em todas as conversas."
            />
          </SectionBlock>

          <SectionBlock
            title="Transferência"
            subtitle="Defina para qual fila o atendimento será enviado ao humano."
          >
            {renderQueueField()}
            <AiFormTextField
              label="Mensagem de transferência"
              multiline
              rows={2}
              value={form.handoffMessage}
              onChange={e =>
                setForm({ ...form, handoffMessage: e.target.value })
              }
              helperText="Mensagem enviada ao cliente antes da transferência."
            />
          </SectionBlock>

          <SectionBlock
            title="Mensagens"
            subtitle="Confirmação automática opcional ao receber nova mensagem."
          >
            <div className={classes.switchRow}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.ackEnabled}
                    onChange={e =>
                      setForm({ ...form, ackEnabled: e.target.checked })
                    }
                    color="primary"
                  />
                }
                label="Enviar mensagem automática ao receber (ACK)"
              />
            </div>
            <AiFormTextField
              label="Mensagem automática (ACK)"
              multiline
              rows={2}
              disabled={!form.ackEnabled}
              placeholder="Recebi sua mensagem. Estou analisando e já vou responder."
              value={form.ackMessage}
              onChange={e => setForm({ ...form, ackMessage: e.target.value })}
            />
          </SectionBlock>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={handleSave}
            disabled={!form.name.trim()}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiAgents;
