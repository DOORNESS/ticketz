import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from "@material-ui/core";
import {
  FileCopy,
  Edit,
  History,
  Link as LinkIcon,
  MoreVert,
  Publish,
  Refresh,
  Save,
  Visibility,
  CloudUpload,
  NoteAdd
} from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { apiGetWithWarmupRetry } from "../../helpers/fetchWithWarmupRetry";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useAiPageStyles } from "../../components/Ai/shared";
import {
  AiFormSelect,
  AiFormTextField,
  AiSectionPaper
} from "../../components/Ai/forms";

const LIFECYCLE_STATUSES = [
  { value: "", label: "Todos os status" },
  { value: "draft", label: "Rascunho" },
  { value: "review", label: "Em revisão" },
  { value: "approved", label: "Aprovado" },
  { value: "published", label: "Publicado" },
  { value: "archived", label: "Arquivado" }
];

const LIFECYCLE_LABELS = {
  draft: "Rascunho",
  review: "Em revisão",
  approved: "Aprovado",
  published: "Publicado",
  archived: "Arquivado"
};

const LIFECYCLE_HINTS = {
  draft: "Recém-criado. Envie para revisão ou use “Publicar agora”.",
  review: "Aguardando aprovação editorial antes de ir ao ar.",
  approved: "Aprovado — falta publicar para a IA usar.",
  published: "Disponível para a IA consultar.",
  archived: "Removido da busca da IA."
};

const INGESTION_LABELS = {
  pending: "Pendente",
  processing: "Processando",
  indexed: "Indexado",
  failed: "Falhou"
};

const lifecycleChipColor = status => {
  switch (status) {
    case "published":
      return "primary";
    case "approved":
      return "secondary";
    default:
      return "default";
  }
};

const ingestionChipColor = status => {
  switch (status) {
    case "indexed":
      return "primary";
    case "processing":
      return "secondary";
    case "failed":
      return "default";
    default:
      return "default";
  }
};

const defaultCreateForm = {
  knowledgeBaseId: "",
  categoryId: "",
  title: "",
  content: "",
  url: ""
};

const AiAssets = () => {
  const classes = useAiPageStyles();
  const [assets, setAssets] = useState([]);
  const [bases, setBases] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [basesLoading, setBasesLoading] = useState(true);
  const [createTab, setCreateTab] = useState(0);
  const [autoPublish, setAutoPublish] = useState(true);
  const [filters, setFilters] = useState({
    lifecycleStatus: "",
    knowledgeBaseId: ""
  });
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [file, setFile] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuAsset, setMenuAsset] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", summary: "" });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneBaseId, setCloneBaseId] = useState("");
  const [cloneAsset, setCloneAsset] = useState(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionsAsset, setVersionsAsset] = useState(null);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [jobsAsset, setJobsAsset] = useState(null);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackVersionId, setRollbackVersionId] = useState("");

  const baseOptions = useMemo(() => {
    if (basesLoading) {
      return [{ value: "", label: "Carregando bases..." }];
    }
    if (!bases.length) {
      return [{ value: "", label: "Nenhuma base encontrada" }];
    }
    return bases.map(base => ({
      value: base.id,
      label: base.name
    }));
  }, [bases, basesLoading]);

  const baseNameById = useMemo(() => {
    const map = {};
    bases.forEach(base => {
      map[base.id] = base.name;
    });
    return map;
  }, [bases]);

  const categoryOptions = useMemo(
    () =>
      categories.map(category => ({
        value: category.id,
        label: category.name
      })),
    [categories]
  );

  const loadBases = useCallback(async () => {
    setBasesLoading(true);
    try {
      const { data } = await apiGetWithWarmupRetry("/ai/knowledge-bases");
      setBases((Array.isArray(data) ? data : []).filter(base => base.active));
    } catch (err) {
      toastError(err);
      setBases([]);
    } finally {
      setBasesLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async baseId => {
    if (!baseId) {
      setCategories([]);
      return;
    }
    try {
      const { data } = await api.get(
        `/ai/knowledge-bases/${baseId}/categories`
      );
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
      setCategories([]);
    }
  }, []);

  const loadAssets = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.lifecycleStatus) {
        params.lifecycleStatus = filters.lifecycleStatus;
      }
      if (filters.knowledgeBaseId) {
        params.knowledgeBaseId = filters.knowledgeBaseId;
      }
      const { data } = await apiGetWithWarmupRetry("/ai/assets", { params });
      setAssets(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [filters.knowledgeBaseId, filters.lifecycleStatus]);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    loadCategories(createForm.knowledgeBaseId);
  }, [createForm.knowledgeBaseId, loadCategories]);

  useEffect(() => {
    const interval = setInterval(() => loadAssets(), 15000);
    return () => clearInterval(interval);
  }, [loadAssets]);

  const resetCreateForm = () => {
    setCreateForm(defaultCreateForm);
    setFile(null);
    setCategories([]);
  };

  const handleSaveText = async () => {
    try {
      await api.post("/ai/assets/text", {
        knowledgeBaseId: Number(createForm.knowledgeBaseId),
        categoryId: createForm.categoryId
          ? Number(createForm.categoryId)
          : undefined,
        title: createForm.title,
        content: createForm.content,
        autoPublish
      });
      toast.success(
        autoPublish
          ? "Documento salvo — publicação após indexação"
          : "Documento salvo como rascunho"
      );
      resetCreateForm();
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const handleSaveUrl = async () => {
    try {
      await api.post("/ai/assets/url", {
        knowledgeBaseId: Number(createForm.knowledgeBaseId),
        categoryId: createForm.categoryId
          ? Number(createForm.categoryId)
          : undefined,
        title: createForm.title,
        url: createForm.url,
        autoPublish
      });
      toast.success(
        autoPublish
          ? "Site salvo — a IA poderá usar após indexação"
          : "Site salvo como rascunho"
      );
      resetCreateForm();
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const handleUpload = async () => {
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("knowledgeBaseId", createForm.knowledgeBaseId);
      if (createForm.categoryId) {
        data.append("categoryId", createForm.categoryId);
      }
      data.append("title", createForm.title || file?.name || "Documento");
      data.append("autoPublish", autoPublish ? "true" : "false");
      await api.post("/ai/assets/upload", data);
      toast.success(
        autoPublish
          ? "Documento salvo — publicação após indexação"
          : "Documento salvo como rascunho"
      );
      resetCreateForm();
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const runLifecycleAction = async (asset, action, body) => {
    try {
      await api.post(`/ai/assets/${asset.id}/${action}`, body || {});
      toast.success("Ação executada com sucesso");
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const handleQuickPublish = async asset => {
    try {
      await api.post(`/ai/assets/${asset.id}/quick-publish`);
      toast.success("Publicação iniciada");
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const openView = async asset => {
    try {
      const { data } = await api.get(`/ai/assets/${asset.id}`);
      setViewAsset(data);
      setViewOpen(true);
    } catch (err) {
      toastError(err);
    }
  };

  const openEdit = asset => {
    setMenuAsset(asset);
    setEditForm({
      title: asset.title || "",
      summary: asset.summary || ""
    });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!menuAsset) return;
    try {
      await api.put(`/ai/assets/${menuAsset.id}`, editForm);
      toast.success("Ativo atualizado");
      setEditOpen(false);
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const openCloneDialog = asset => {
    setCloneAsset(asset);
    setCloneBaseId("");
    setCloneOpen(true);
  };

  const handleClone = async () => {
    if (!cloneAsset || !cloneBaseId) return;
    try {
      await api.post(`/ai/assets/${cloneAsset.id}/clone`, {
        targetKnowledgeBaseId: Number(cloneBaseId),
        autoPublish
      });
      toast.success("Ativo vinculado à outra base");
      setCloneOpen(false);
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const openMenu = (event, asset) => {
    setMenuAnchor(event.currentTarget);
    setMenuAsset(asset);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuAsset(null);
  };

  const handleMenuAction = async action => {
    const asset = menuAsset;
    closeMenu();
    if (!asset) return;

    if (action === "view") {
      await openView(asset);
      return;
    }

    if (action === "edit") {
      openEdit(asset);
      return;
    }

    if (action === "clone") {
      openCloneDialog(asset);
      return;
    }

    if (action === "quick-publish") {
      await handleQuickPublish(asset);
      return;
    }

    if (action === "versions") {
      try {
        const { data } = await api.get(`/ai/assets/${asset.id}/versions`);
        setVersions(Array.isArray(data) ? data : []);
        setVersionsAsset(asset);
        setVersionsOpen(true);
      } catch (err) {
        toastError(err);
      }
      return;
    }

    if (action === "jobs") {
      try {
        const { data } = await api.get(`/ai/assets/${asset.id}/ingestion-jobs`);
        setJobs(Array.isArray(data) ? data : []);
        setJobsAsset(asset);
        setJobsOpen(true);
      } catch (err) {
        toastError(err);
      }
      return;
    }

    if (action === "rollback") {
      try {
        const { data } = await api.get(`/ai/assets/${asset.id}/versions`);
        setVersions(Array.isArray(data) ? data : []);
        setVersionsAsset(asset);
        setRollbackVersionId("");
        setRollbackOpen(true);
      } catch (err) {
        toastError(err);
      }
      return;
    }

    await runLifecycleAction(asset, action);
  };

  const handleRollback = async () => {
    if (!versionsAsset || !rollbackVersionId) return;
    try {
      await api.post(`/ai/assets/${versionsAsset.id}/rollback`, {
        versionId: Number(rollbackVersionId)
      });
      toast.success("Rollback executado");
      setRollbackOpen(false);
      loadAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const renderLifecycleActions = asset => {
    const status = asset.lifecycleStatus;
    const actions = [
      { key: "view", label: "Ver detalhes" },
      { key: "edit", label: "Editar título/resumo" },
      { key: "clone", label: "Vincular a outra base" }
    ];

    if (status !== "published") {
      actions.push({ key: "quick-publish", label: "Publicar agora" });
    }
    if (status === "draft") {
      actions.push({ key: "submit-review", label: "Enviar para revisão" });
    }
    if (status === "review") {
      actions.push({ key: "approve", label: "Aprovar" });
    }
    if (status === "approved") {
      actions.push({ key: "publish", label: "Publicar" });
    }
    if (status === "published") {
      actions.push({ key: "archive", label: "Arquivar" });
      actions.push({ key: "reindex", label: "Reindexar" });
      actions.push({ key: "rollback", label: "Rollback de versão" });
    }
    if (status === "archived") {
      actions.push({ key: "publish", label: "Republicar" });
    }

    actions.push({ key: "versions", label: "Histórico de versões" });
    actions.push({ key: "jobs", label: "Jobs de ingestão" });

    return actions;
  };

  const getIngestionStatus = asset => {
    const version =
      asset.currentVersion ||
      asset.publishedVersion ||
      (asset.currentVersionId ? { ingestionStatus: "pending" } : null);
    return version?.ingestionStatus || "—";
  };

  const getIngestionError = asset =>
    asset.currentVersion?.errorMessage ||
    asset.publishedVersion?.errorMessage ||
    "";

  const renderCreateSection = () => (
    <>
      <Tabs
        value={createTab}
        onChange={(_, value) => setCreateTab(value)}
        indicatorColor="primary"
        textColor="primary"
      >
        <Tab icon={<CloudUpload />} label="Arquivo" />
        <Tab icon={<NoteAdd />} label="Texto" />
        <Tab icon={<LinkIcon />} label="Site (URL)" />
      </Tabs>

      <Box mt={2}>
        <AiFormSelect
          label="Base de conhecimento"
          value={createForm.knowledgeBaseId}
          onChange={e =>
            setCreateForm({
              ...createForm,
              knowledgeBaseId: String(e.target.value),
              categoryId: ""
            })
          }
          options={baseOptions}
        />
        {categoryOptions.length > 0 && (
          <AiFormSelect
            label="Categoria (opcional)"
            value={createForm.categoryId}
            onChange={e =>
              setCreateForm({
                ...createForm,
                categoryId: String(e.target.value)
              })
            }
            options={categoryOptions}
            emptyLabel="Sem categoria"
          />
        )}
        <AiFormTextField
          label="Título (opcional)"
          value={createForm.title}
          onChange={e =>
            setCreateForm({ ...createForm, title: e.target.value })
          }
        />

        {createTab === 0 && (
          <Box mt={1} mb={2}>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,.html"
              onChange={e => setFile(e.target.files[0])}
            />
            {file && (
              <Typography variant="body2" color="textSecondary">
                Arquivo selecionado: {file.name}
              </Typography>
            )}
          </Box>
        )}

        {createTab === 1 && (
          <AiFormTextField
            label="Conteúdo"
            multiline
            rows={8}
            value={createForm.content}
            onChange={e =>
              setCreateForm({ ...createForm, content: e.target.value })
            }
          />
        )}

        {createTab === 2 && (
          <AiFormTextField
            label="URL do site"
            placeholder="https://exemplo.com.br/sobre"
            value={createForm.url}
            onChange={e =>
              setCreateForm({ ...createForm, url: e.target.value })
            }
          />
        )}

        <FormControlLabel
          control={
            <Checkbox
              color="primary"
              checked={autoPublish}
              onChange={e => setAutoPublish(e.target.checked)}
            />
          }
          label="Publicar automaticamente após indexação (recomendado para a IA usar)"
        />

        <Box mt={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Save />}
            disabled={
              !createForm.knowledgeBaseId ||
              (createTab === 0 && !file) ||
              (createTab === 1 && !createForm.content.trim()) ||
              (createTab === 2 && !createForm.url.trim())
            }
            onClick={() => {
              if (createTab === 0) handleUpload();
              else if (createTab === 1) handleSaveText();
              else handleSaveUrl();
            }}
          >
            Salvar documento
          </Button>
        </Box>
      </Box>
    </>
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Ativos de Conhecimento</Title>
        <Box display="flex" style={{ gap: 8 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<Refresh />}
            onClick={loadAssets}
            disabled={loading}
          >
            Atualizar
          </Button>
        </Box>
      </MainHeader>

      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Filtros"
          subtitle="Refine a listagem por base e status editorial."
        >
          <Box display="flex" flexWrap="wrap" style={{ gap: 8 }}>
            <Box flex="1 1 220px" minWidth={200}>
              <AiFormSelect
                label="Base de conhecimento"
                value={filters.knowledgeBaseId}
                onChange={e =>
                  setFilters({
                    ...filters,
                    knowledgeBaseId: String(e.target.value)
                  })
                }
                options={baseOptions}
                emptyLabel="Todas as bases"
              />
            </Box>
            <Box flex="1 1 220px" minWidth={200}>
              <AiFormSelect
                label="Status editorial"
                value={filters.lifecycleStatus}
                onChange={e =>
                  setFilters({
                    ...filters,
                    lifecycleStatus: String(e.target.value)
                  })
                }
                options={LIFECYCLE_STATUSES}
                allowEmpty={false}
              />
            </Box>
          </Box>
        </AiSectionPaper>

        <AiSectionPaper
          title="Novo ativo"
          subtitle="Salve arquivos, textos ou sites institucionais. O botão “Salvar documento” grava na base escolhida."
        >
          {renderCreateSection()}
        </AiSectionPaper>

        <AiSectionPaper
          title="Ativos cadastrados"
          subtitle="Workflow: rascunho → revisão → aprovado → publicado. Só conteúdo publicado e indexado entra na busca da IA."
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Título</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Base</TableCell>
                <TableCell>Status editorial</TableCell>
                <TableCell>Indexação</TableCell>
                <TableCell>Detalhe</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assets.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    {loading
                      ? "Carregando ativos..."
                      : basesLoading
                        ? "Carregando bases de conhecimento..."
                        : "Nenhum ativo encontrado com os filtros atuais."}
                  </TableCell>
                </TableRow>
              )}
              {assets.map(asset => {
                const ingestionStatus = getIngestionStatus(asset);
                const ingestionError = getIngestionError(asset);
                return (
                  <TableRow key={asset.id}>
                    <TableCell>{asset.title}</TableCell>
                    <TableCell>{asset.assetType}</TableCell>
                    <TableCell>
                      {baseNameById[asset.knowledgeBaseId] ||
                        asset.knowledgeBaseId}
                    </TableCell>
                    <TableCell>
                      <Tooltip
                        title={
                          LIFECYCLE_HINTS[asset.lifecycleStatus] ||
                          asset.lifecycleStatus
                        }
                      >
                        <Chip
                          size="small"
                          label={
                            LIFECYCLE_LABELS[asset.lifecycleStatus] ||
                            asset.lifecycleStatus
                          }
                          color={lifecycleChipColor(asset.lifecycleStatus)}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {ingestionStatus !== "—" ? (
                        <Tooltip
                          title={
                            ingestionError ||
                            (ingestionStatus === "failed"
                              ? "Falha na extração ou indexação — use Reindexar ou veja Jobs"
                              : "")
                          }
                        >
                          <Chip
                            size="small"
                            label={
                              INGESTION_LABELS[ingestionStatus] ||
                              ingestionStatus
                            }
                            color={ingestionChipColor(ingestionStatus)}
                            variant={
                              ingestionStatus === "failed"
                                ? "default"
                                : "outlined"
                            }
                          />
                        </Tooltip>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="textSecondary">
                        {ingestionError ||
                          (asset.metadata?.url
                            ? String(asset.metadata.url).slice(0, 40)
                            : "—")}
                      </Typography>
                    </TableCell>
                    <TableCell align="center" style={{ whiteSpace: "nowrap" }}>
                      <Tooltip title="Ver">
                        <IconButton
                          size="small"
                          onClick={() => openView(asset)}
                        >
                          <Visibility />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          onClick={() => openEdit(asset)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      {asset.lifecycleStatus !== "published" && (
                        <Tooltip title="Publicar agora">
                          <IconButton
                            size="small"
                            onClick={() => handleQuickPublish(asset)}
                          >
                            <Publish />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Vincular a outra base">
                        <IconButton
                          size="small"
                          onClick={() => openCloneDialog(asset)}
                        >
                          <FileCopy />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Mais ações">
                        <IconButton
                          size="small"
                          onClick={event => openMenu(event, asset)}
                        >
                          <MoreVert />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Histórico">
                        <IconButton
                          size="small"
                          onClick={async () => {
                            try {
                              const { data } = await api.get(
                                `/ai/assets/${asset.id}/versions`
                              );
                              setVersions(Array.isArray(data) ? data : []);
                              setVersionsAsset(asset);
                              setVersionsOpen(true);
                            } catch (err) {
                              toastError(err);
                            }
                          }}
                        >
                          <History />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AiSectionPaper>
      </div>

      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        {menuAsset &&
          renderLifecycleActions(menuAsset).map(action => (
            <MenuItem
              key={action.key}
              onClick={() => handleMenuAction(action.key)}
            >
              {action.label}
            </MenuItem>
          ))}
      </Menu>

      <Dialog
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Detalhes — {viewAsset?.title}</DialogTitle>
        <DialogContent dividers>
          {viewAsset && (
            <>
              <Typography variant="body2">
                <strong>Tipo:</strong> {viewAsset.assetType}
              </Typography>
              <Typography variant="body2">
                <strong>Base:</strong>{" "}
                {baseNameById[viewAsset.knowledgeBaseId] ||
                  viewAsset.knowledgeBaseId}
              </Typography>
              <Typography variant="body2">
                <strong>Status:</strong>{" "}
                {LIFECYCLE_LABELS[viewAsset.lifecycleStatus] ||
                  viewAsset.lifecycleStatus}
              </Typography>
              {viewAsset.metadata?.url && (
                <Typography variant="body2">
                  <strong>URL:</strong> {viewAsset.metadata.url}
                </Typography>
              )}
              {getIngestionError(viewAsset) && (
                <Typography variant="body2" color="error">
                  <strong>Erro de indexação:</strong>{" "}
                  {getIngestionError(viewAsset)}
                </Typography>
              )}
              {viewAsset.currentVersion?.rawTextPreview && (
                <Box mt={2}>
                  <Typography variant="subtitle2">
                    Prévia do conteúdo
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    {viewAsset.currentVersion.rawTextPreview}
                  </Typography>
                </Box>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Editar ativo</DialogTitle>
        <DialogContent dividers>
          <AiFormTextField
            label="Título"
            value={editForm.title}
            onChange={e => setEditForm({ ...editForm, title: e.target.value })}
          />
          <AiFormTextField
            label="Resumo"
            multiline
            rows={4}
            value={editForm.summary}
            onChange={e =>
              setEditForm({ ...editForm, summary: e.target.value })
            }
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={handleEditSave}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Vincular a outra base</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Cria uma cópia do ativo “{cloneAsset?.title}” em outra base de
            conhecimento (útil quando o mesmo conteúdo serve a mais de um
            agente).
          </Typography>
          <AiFormSelect
            label="Base destino"
            value={cloneBaseId}
            onChange={e => setCloneBaseId(String(e.target.value))}
            options={baseOptions.filter(
              opt => String(opt.value) !== String(cloneAsset?.knowledgeBaseId)
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloneOpen(false)}>Cancelar</Button>
          <Button
            color="primary"
            variant="contained"
            disabled={!cloneBaseId}
            onClick={handleClone}
          >
            Vincular cópia
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Versões — {versionsAsset?.title || "Ativo"}</DialogTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Título</TableCell>
                <TableCell>Indexação</TableCell>
                <TableCell>Erro</TableCell>
                <TableCell>Chunks</TableCell>
                <TableCell>Criada em</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {versions.map(version => (
                <TableRow key={version.id}>
                  <TableCell>{version.versionNumber}</TableCell>
                  <TableCell>{version.title}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={
                        INGESTION_LABELS[version.ingestionStatus] ||
                        version.ingestionStatus
                      }
                      color={ingestionChipColor(version.ingestionStatus)}
                    />
                  </TableCell>
                  <TableCell>{version.errorMessage || "—"}</TableCell>
                  <TableCell>{version.chunkCount ?? "—"}</TableCell>
                  <TableCell>
                    {version.createdAt
                      ? new Date(version.createdAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhuma versão registrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVersionsOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={jobsOpen}
        onClose={() => setJobsOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Jobs de ingestão — {jobsAsset?.title || "Ativo"}
        </DialogTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tipo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Tentativas</TableCell>
                <TableCell>Erro</TableCell>
                <TableCell>Início</TableCell>
                <TableCell>Fim</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {jobs.map(job => (
                <TableRow key={job.id}>
                  <TableCell>{job.jobType}</TableCell>
                  <TableCell>{job.status}</TableCell>
                  <TableCell>{job.attempts ?? "—"}</TableCell>
                  <TableCell>{job.errorMessage || "—"}</TableCell>
                  <TableCell>
                    {job.startedAt
                      ? new Date(job.startedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {job.finishedAt
                      ? new Date(job.finishedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {jobs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Nenhum job de ingestão registrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setJobsOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={rollbackOpen}
        onClose={() => setRollbackOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Rollback — {versionsAsset?.title || "Ativo"}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Selecione a versão para restaurar como publicada.
          </Typography>
          <AiFormSelect
            label="Versão alvo"
            value={rollbackVersionId}
            onChange={e => setRollbackVersionId(String(e.target.value))}
            options={versions.map(version => ({
              value: version.id,
              label: `v${version.versionNumber} — ${
                INGESTION_LABELS[version.ingestionStatus] ||
                version.ingestionStatus
              }`
            }))}
            allowEmpty
            emptyLabel="Selecione a versão"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRollbackOpen(false)}>Cancelar</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={handleRollback}
            disabled={!rollbackVersionId}
          >
            Executar rollback
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiAssets;
