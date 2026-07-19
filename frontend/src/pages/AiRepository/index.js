import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  IconButton,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from "@material-ui/core";
import { CloudUpload, DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useAiPageStyles } from "../../components/Ai/shared";
import {
  AiFormSelect,
  AiFormTextField,
  AiSectionPaper
} from "../../components/Ai/forms";

const CONTENT_TYPES = [
  { value: "link", label: "Link" },
  { value: "text", label: "Texto pronto" },
  { value: "message_template", label: "Modelo de mensagem" },
  { value: "pdf", label: "PDF" },
  { value: "document", label: "Documento" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "video", label: "Vídeo" },
  { value: "file", label: "Arquivo genérico" }
];

const defaultForm = {
  name: "",
  displayTitle: "",
  contentType: "link",
  category: "",
  description: "",
  sendCaption: "",
  externalUrl: "",
  knowledgeDomainId: "",
  knowledgeBaseId: "",
  active: true,
  allowAiUse: false,
  allowHumanUse: true,
  useForKnowledge: false,
  useForDelivery: true
};

const typeIcon = type => {
  if (type === "link") return "🔗";
  if (type === "pdf") return "📄";
  if (type === "image") return "🖼️";
  if (type === "audio") return "🎵";
  if (type === "video") return "🎬";
  return "📎";
};

const AiRepository = () => {
  const classes = useAiPageStyles();
  const [items, setItems] = useState([]);
  const [domains, setDomains] = useState([]);
  const [bases, setBases] = useState([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [file, setFile] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const domainOptions = useMemo(
    () =>
      domains.map(d => ({
        value: d.id,
        label: d.name
      })),
    [domains]
  );

  const baseOptions = useMemo(
    () =>
      bases.map(b => ({
        value: b.id,
        label: b.name
      })),
    [bases]
  );

  const load = useCallback(async () => {
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (filterType) params.contentType = filterType;
      const [{ data: repo }, { data: domainData }, { data: baseData }] =
        await Promise.all([
          api.get("/ai/repository", { params }),
          api.get("/ai/knowledge-domains"),
          api.get("/ai/knowledge-bases")
        ]);
      setItems(Array.isArray(repo) ? repo : []);
      setDomains(Array.isArray(domainData) ? domainData : []);
      setBases(Array.isArray(baseData) ? baseData : []);
    } catch (err) {
      toastError(err);
    }
  }, [search, filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFile(null);
    setOpen(true);
  };

  const openEdit = item => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      displayTitle: item.displayTitle || "",
      contentType: item.contentType || "link",
      category: item.category || "",
      description: item.description || "",
      sendCaption: item.sendCaption || "",
      externalUrl: item.externalUrl || "",
      knowledgeDomainId: item.knowledgeDomainId || "",
      knowledgeBaseId: item.knowledgeBaseId || "",
      active: item.active !== false,
      allowAiUse: !!item.allowAiUse,
      allowHumanUse: item.allowHumanUse !== false,
      useForKnowledge: !!item.useForKnowledge,
      useForDelivery: item.useForDelivery !== false
    });
    setFile(null);
    setOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...form,
        knowledgeDomainId: form.knowledgeDomainId
          ? Number(form.knowledgeDomainId)
          : null,
        knowledgeBaseId: form.knowledgeBaseId
          ? Number(form.knowledgeBaseId)
          : null
      };

      if (file) {
        const data = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          if (value !== null && value !== undefined) {
            data.append(key, String(value));
          }
        });
        data.append("file", file);
        await api.post("/ai/repository/upload", data);
      } else if (editingId) {
        await api.put(`/ai/repository/${editingId}`, payload);
      } else {
        await api.post("/ai/repository", payload);
      }

      toast.success("Item salvo no Repositório");
      setOpen(false);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const handleArchive = async id => {
    try {
      await api.delete(`/ai/repository/${id}`);
      toast.success("Item arquivado");
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const needsFile = ["pdf", "document", "image", "audio", "video", "file"].includes(
    form.contentType
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title>Repositório de Conteúdos</Title>
        <Button variant="contained" color="primary" onClick={openCreate}>
          Novo item
        </Button>
      </MainHeader>

      <AiSectionPaper title="Buscar">
        <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
          <TextField
            label="Buscar"
            size="small"
            variant="outlined"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <TextField
            select
            label="Tipo"
            size="small"
            variant="outlined"
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{ minWidth: 180 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {CONTENT_TYPES.map(t => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="outlined" onClick={load}>
            Atualizar
          </Button>
        </Box>
      </AiSectionPaper>

      <AiSectionPaper title="Itens cadastrados">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Uso</TableCell>
              <TableCell>Utilizações</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                <TableCell>
                  {typeIcon(item.contentType)} {item.contentType}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{item.displayTitle || item.name}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {item.sendCaption || item.description || "—"}
                  </Typography>
                </TableCell>
                <TableCell>{item.category || "—"}</TableCell>
                <TableCell>
                  {item.allowHumanUse && (
                    <Chip size="small" label="Humano" style={{ marginRight: 4 }} />
                  )}
                  {item.allowAiUse && <Chip size="small" label="IA" color="primary" />}
                  {item.useForKnowledge && (
                    <Chip size="small" label="KB" color="secondary" />
                  )}
                </TableCell>
                <TableCell>{item.usageCount || 0}</TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => openEdit(item)}>
                    <Edit fontSize="small" />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleArchive(item.id)}>
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="textSecondary">
                    Nenhum item cadastrado.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </AiSectionPaper>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? "Editar item" : "Novo item do Repositório"}
        </DialogTitle>
        <DialogContent>
          <AiFormTextField
            label="Nome interno"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            helperText="Identificação interna"
          />
          <AiFormTextField
            label="Título de exibição"
            value={form.displayTitle}
            onChange={e => setForm({ ...form, displayTitle: e.target.value })}
          />
          <AiFormSelect
            label="Tipo"
            value={form.contentType}
            onChange={e => setForm({ ...form, contentType: e.target.value })}
            options={CONTENT_TYPES}
          />
          <AiFormTextField
            label="Categoria"
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
          />
          <AiFormTextField
            label="Descrição interna"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            multiline
            rows={2}
          />
          <AiFormTextField
            label="Mensagem que acompanha o envio"
            value={form.sendCaption}
            onChange={e => setForm({ ...form, sendCaption: e.target.value })}
            multiline
            rows={2}
          />
          {(form.contentType === "link" || form.contentType === "text") && (
            <AiFormTextField
              label="URL (links)"
              value={form.externalUrl}
              onChange={e => setForm({ ...form, externalUrl: e.target.value })}
            />
          )}
          <AiFormSelect
            label="Domínio"
            value={form.knowledgeDomainId}
            onChange={e =>
              setForm({ ...form, knowledgeDomainId: e.target.value })
            }
            options={[{ value: "", label: "Nenhum" }, ...domainOptions]}
          />
          <AiFormSelect
            label="Base de Conhecimento (opcional, para ingestão)"
            value={form.knowledgeBaseId}
            onChange={e =>
              setForm({ ...form, knowledgeBaseId: e.target.value })
            }
            options={[{ value: "", label: "Nenhuma" }, ...baseOptions]}
          />
          {needsFile && !editingId && (
            <Box mt={2}>
              <input
                accept="*/*"
                style={{ display: "none" }}
                id="repo-file"
                type="file"
                onChange={e => setFile(e.target.files?.[0] || null)}
              />
              <label htmlFor="repo-file">
                <Button variant="outlined" component="span" startIcon={<CloudUpload />}>
                  {file ? file.name : "Selecionar arquivo"}
                </Button>
              </label>
            </Box>
          )}
          <Box mt={1}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.useForDelivery}
                  onChange={e =>
                    setForm({ ...form, useForDelivery: e.target.checked })
                  }
                  color="primary"
                />
              }
              label="Disponibilizar para envio ao cliente"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.useForKnowledge}
                  onChange={e =>
                    setForm({ ...form, useForKnowledge: e.target.checked })
                  }
                  color="primary"
                />
              }
              label="Usar como fonte de conhecimento da IA"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.allowHumanUse}
                  onChange={e =>
                    setForm({ ...form, allowHumanUse: e.target.checked })
                  }
                  color="primary"
                />
              }
              label="Uso permitido pelo atendente"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.allowAiUse}
                  onChange={e =>
                    setForm({ ...form, allowAiUse: e.target.checked })
                  }
                  color="primary"
                />
              }
              label="Uso permitido pela IA"
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
          </Box>
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

export default AiRepository;
