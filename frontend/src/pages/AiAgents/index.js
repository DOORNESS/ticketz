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
  Grid
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import AiSetupWizard from "../../components/AiSetupWizard";
import { useAiPageStyles } from "../../components/Ai/shared";
import { AiFormTextField } from "../../components/Ai/forms";

const defaultAgent = {
  name: "",
  active: true,
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
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultAgent);
  const [editingId, setEditingId] = useState(null);

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

  useEffect(() => {
    loadAgents();
    loadQueues();
  }, [loadQueues]);

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
    try {
      const payload = {
        ...form,
        fallbackQueueId: form.fallbackQueueId
          ? Number(form.fallbackQueueId)
          : null,
        temperature: Number(form.temperature),
        maxTokens: Number(form.maxTokens)
      };

      if (editingId) {
        await api.put(`/ai/agents/${editingId}`, payload);
      } else {
        await api.post("/ai/agents", payload);
      }

      toast.success("Agente salvo com sucesso");
      setOpen(false);
      setEditingId(null);
      setForm(defaultAgent);
      loadAgents();
    } catch (err) {
      toastError(err);
    }
  };

  const handleEdit = agent => {
    setEditingId(agent.id);
    setForm({
      name: agent.name,
      active: agent.active,
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
    setOpen(true);
  };

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
      <Paper className={classes.tablePaper} elevation={0}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nome</TableCell>
              <TableCell>Modelo</TableCell>
              <TableCell>Ativo</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {agents.map(agent => (
              <TableRow key={agent.id}>
                <TableCell>{agent.name}</TableCell>
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
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editingId ? "Editar Agente" : "Novo Agente de IA"}
        </DialogTitle>
        <DialogContent dividers>
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
