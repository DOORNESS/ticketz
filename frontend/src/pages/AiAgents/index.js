import React, { useEffect, useState } from "react";
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
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

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
    "Vou transferir você para um atendente humano. Por favor, aguarde."
};

const AiAgents = () => {
  const [agents, setAgents] = useState([]);
  const [queues, setQueues] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultAgent);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const [{ data: agentsData }, { data: queuesData }] = await Promise.all([
        api.get("/ai/agents"),
        api.get("/queue")
      ]);
      setAgents(agentsData);
      setQueues(queuesData);
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

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
      load();
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
      fallbackQueueId: agent.fallbackQueueId || "",
      handoffMessage: agent.handoffMessage || defaultAgent.handoffMessage
    });
    setOpen(true);
  };

  const handleDelete = async id => {
    try {
      await api.delete(`/ai/agents/${id}`);
      toast.success("Agente removido");
      load();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Agentes</Title>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setEditingId(null);
            setForm(defaultAgent);
            setOpen(true);
          }}
        >
          Novo Agente
        </Button>
      </MainHeader>
      <Paper>
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
        <DialogContent>
          <TextField
            label="Nome"
            fullWidth
            margin="dense"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={form.active}
                onChange={e => setForm({ ...form, active: e.target.checked })}
                color="primary"
              />
            }
            label="Ativo"
          />
          <TextField
            label="Modelo de texto"
            fullWidth
            margin="dense"
            value={form.textModel}
            onChange={e => setForm({ ...form, textModel: e.target.value })}
          />
          <TextField
            label="Modelo de visão"
            fullWidth
            margin="dense"
            value={form.visionModel}
            onChange={e => setForm({ ...form, visionModel: e.target.value })}
          />
          <TextField
            label="Modelo de transcrição"
            fullWidth
            margin="dense"
            value={form.transcriptionModel}
            onChange={e =>
              setForm({ ...form, transcriptionModel: e.target.value })
            }
          />
          <TextField
            label="Temperatura"
            type="number"
            fullWidth
            margin="dense"
            value={form.temperature}
            onChange={e => setForm({ ...form, temperature: e.target.value })}
          />
          <TextField
            label="Limite de tokens"
            type="number"
            fullWidth
            margin="dense"
            value={form.maxTokens}
            onChange={e => setForm({ ...form, maxTokens: e.target.value })}
          />
          <TextField
            select
            label="Fila padrão de transferência"
            fullWidth
            margin="dense"
            value={form.fallbackQueueId}
            onChange={e =>
              setForm({ ...form, fallbackQueueId: e.target.value })
            }
            SelectProps={{ native: true }}
          >
            <option value="">Selecione</option>
            {queues.map(q => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </TextField>
          <TextField
            label="Prompt base"
            fullWidth
            margin="dense"
            multiline
            rows={4}
            value={form.basePrompt}
            onChange={e => setForm({ ...form, basePrompt: e.target.value })}
          />
          <TextField
            label="Mensagem de transferência"
            fullWidth
            margin="dense"
            multiline
            rows={2}
            value={form.handoffMessage}
            onChange={e => setForm({ ...form, handoffMessage: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={handleSave}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiAgents;
