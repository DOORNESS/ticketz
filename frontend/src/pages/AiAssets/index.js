import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useLocation } from "react-router-dom";
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
  NoteAdd,
  GetApp
} from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import BrandBadge from "../../components/BrandBadge";
import { useBrandScope } from "../../context/BrandScope/BrandScopeContext";
import api from "../../services/api";
import {
  AI_CACHE_KEYS,
  invalidateAiListCache,
  readAiListCache,
  writeAiListCache
} from "../../helpers/aiListCache";
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
  const location = useLocation();
  const initialKnowledgeBaseFilter = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("knowledgeBaseId") || "";
  }, [location.search]);
  const cachedBases = readAiListCache(AI_CACHE_KEYS.knowledgeBases);
  const initialFilters = useMemo(
    () => ({
      lifecycleStatus: "",
      knowledgeBaseId: initialKnowledgeBaseFilter
    }),
    [initialKnowledgeBaseFilter]
  );
  const cachedAssets = readAiListCache(
    AI_CACHE_KEYS.assetsList(initialFilters)
  );
  const [assets, setAssets] = useState(cachedAssets || []);

  // Marca escolhida no cabeçalho — a mesma para todas as telas.
  const { brands, brandScopeId } = useBrandScope();
  const [bases, setBases] = useState(
    cachedBases ? cachedBases.filter(base => base.active) : []
  );
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(!cachedAssets?.length);
  const [basesLoading, setBasesLoading] = useState(!cachedBases?.length);
  const [createTab, setCreateTab] = useState(0);
  const [autoPublish, setAutoPublish] = useState(true);
  const [filters, setFilters] = useState(initialFilters);
  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [file, setFile] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuAsset, setMenuAsset] = useState(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewAsset, setViewAsset] = useState(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceFile, setReplaceFile] = useState(null);
  const [replaceTitle, setReplaceTitle] = useState("");
  const [replaceLoading, setReplaceLoading] = useState(false);
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
  const assetsRequestRunningRef = useRef(false);
  const assetsReloadQueuedRef = useRef(false);
  const skipInitialFilterFetchRef = useRef(true);

  const invalidateCaches = () => {
    invalidateAiListCache("knowledge-bases");
    invalidateAiListCache("assets:list");
  };

  const buildAssetParams = useCallback(currentFilters => {
    const params = {};
    if (currentFilters.lifecycleStatus) {
      params.lifecycleStatus = currentFilters.lifecycleStatus;
    }
    if (currentFilters.knowledgeBaseId) {
      params.knowledgeBaseId = currentFilters.knowledgeBaseId;
    }
    return params;
  }, []);

  const loadBases = useCallback(async ({ background = false } = {}) => {
    const cached = readAiListCache(AI_CACHE_KEYS.knowledgeBases);
    if (cached?.length) {
      setBases(cached.filter(base => base.active));
      setBasesLoading(false);
    } else if (!background) {
      setBasesLoading(true);
    }

    try {
      const { data } = await api.get("/ai/knowledge-bases", {
        timeout: 15000,
        _skipApiRetry: true
      });
      const nextBases = Array.isArray(data) ? data : [];
      writeAiListCache(AI_CACHE_KEYS.knowledgeBases, nextBases);
      setBases(nextBases.filter(base => base.active));
    } catch (err) {
      if (!cached?.length) {
        toastError(err);
        setBases([]);
      }
    } finally {
      setBasesLoading(false);
    }
  }, []);

  const loadAssets = useCallback(
    async ({ background = false, currentFilters = filters } = {}) => {
      if (assetsRequestRunningRef.current) {
        assetsReloadQueuedRef.current = true;
        return;
      }

      const cacheKey = AI_CACHE_KEYS.assetsList(currentFilters);
      const cached = readAiListCache(cacheKey);
      if (cached?.length) {
        setAssets(cached);
        if (!background) {
          setLoading(false);
        }
      } else if (!background) {
        setLoading(true);
      }

      assetsRequestRunningRef.current = true;
      try {
        const { data } = await api.get("/ai/assets", {
          params: buildAssetParams(currentFilters),
          timeout: 15000,
          _skipApiRetry: true
        });
        const nextAssets = Array.isArray(data) ? data : [];
        setAssets(nextAssets);
        writeAiListCache(cacheKey, nextAssets);
      } catch (err) {
        if (!cached?.length) {
          toastError(err);
          setAssets([]);
        }
      } finally {
        assetsRequestRunningRef.current = false;
        setLoading(false);
        if (assetsReloadQueuedRef.current) {
          assetsReloadQueuedRef.current = false;
          window.setTimeout(() => loadAssets({ background: true }), 0);
        }
      }
    },
    [buildAssetParams, filters]
  );

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

  /**
   * O ativo não carrega marca própria: ele pertence a uma base, e é a base
   * que tem `brandId`. Derivar daqui evita duplicar o vínculo em mais uma
   * tabela — a marca do ativo é, por definição, a da base dele.
   */
  const brandIdByBase = useMemo(() => {
    const map = {};
    bases.forEach(base => {
      map[base.id] = base.brandId;
    });
    return map;
  }, [bases]);

  const visibleAssets = useMemo(() => {
    if (!brandScopeId) {
      return assets;
    }
    return assets.filter(
      asset =>
        Number(brandIdByBase[asset.knowledgeBaseId]) === Number(brandScopeId)
    );
  }, [assets, brandIdByBase, brandScopeId]);

  const categoryOptions = useMemo(
    () =>
      categories.map(category => ({
        value: category.id,
        label: category.name
      })),
    [categories]
  );

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

  useEffect(() => {
    Promise.all([
      loadBases({ background: Boolean(cachedBases?.length) }),
      loadAssets({
        background: Boolean(cachedAssets?.length),
        currentFilters: initialFilters
      })
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipInitialFilterFetchRef.current) {
      skipInitialFilterFetchRef.current = false;
      return;
    }
    loadAssets({ currentFilters: filters });
  }, [filters.knowledgeBaseId, filters.lifecycleStatus, loadAssets, filters]);

  const refreshAssets = useCallback(() => {
    invalidateCaches();
    loadAssets({ currentFilters: filters });
  }, [filters, loadAssets]);

  useEffect(() => {
    loadCategories(createForm.knowledgeBaseId);
  }, [createForm.knowledgeBaseId, loadCategories]);

  useEffect(() => {
    const hasActiveIngestion = assets.some(asset => {
      const status =
        asset.currentVersion?.ingestionStatus ||
        asset.publishedVersion?.ingestionStatus;
      return status === "pending" || status === "processing";
    });

    if (!hasActiveIngestion) {
      return undefined;
    }

    const interval = setInterval(
      () => loadAssets({ background: true, currentFilters: filters }),
      10000
    );
    return () => clearInterval(interval);
  }, [assets, loadAssets]);

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
      refreshAssets();
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
      refreshAssets();
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
      refreshAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const runLifecycleAction = async (asset, action, body) => {
    try {
      if (action === "delete") {
        if (
          !window.confirm(
            `Excluir permanentemente "${asset.title}"? Esta ação não pode ser desfeita.`
          )
        ) {
          return;
        }
        await api.delete(`/ai/assets/${asset.id}`);
      } else {
        await api.post(`/ai/assets/${asset.id}/${action}`, body || {});
      }
      toast.success("Ação executada com sucesso");
      refreshAssets();
    } catch (err) {
      toastError(err);
    }
  };

  const handleQuickPublish = async asset => {
    try {
      await api.post(`/ai/assets/${asset.id}/quick-publish`);
      toast.success("Publicação iniciada");
      refreshAssets();
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

  const handleDownloadAsset = async asset => {
    if (!asset?.id) return;
    try {
      const response = await api.get(`/ai/assets/${asset.id}/download`, {
        responseType: "blob"
      });
      const contentType = response.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        const text = await response.data.text();
        const data = JSON.parse(text);
        if (data?.url) {
          window.open(data.url, "_blank", "noopener,noreferrer");
          return;
        }
        toast.error("Arquivo não encontrado no storage.");
        return;
      }
      const extMap = {
        word: "docx",
        pdf: "pdf",
        text: "txt",
        markdown: "md"
      };
      const ext = extMap[asset.assetType] || "bin";
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(asset.title || "ativo").replace(/\s+/g, "_")}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err);
    }
  };

  const openReplace = asset => {
    setMenuAsset(asset);
    setReplaceTitle(asset.title || "");
    setReplaceFile(null);
    setReplaceOpen(true);
  };

  const handleReplaceSave = async () => {
    if (!menuAsset || !replaceFile) {
      toast.error("Selecione um arquivo para substituir o ativo.");
      return;
    }
    setReplaceLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", replaceFile);
      if (replaceTitle.trim()) {
        formData.append("title", replaceTitle.trim());
      }
      formData.append("autoPublish", autoPublish ? "true" : "false");
      await api.post(`/ai/assets/${menuAsset.id}/replace-file`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success("Arquivo substituído — reindexação iniciada");
      setReplaceOpen(false);
      setReplaceFile(null);
      refreshAssets();
    } catch (err) {
      toastError(err);
    } finally {
      setReplaceLoading(false);
    }
  };

  const openEdit = asset => {
    openReplace(asset);
  };

  const handleEditSave = async () => {
    handleReplaceSave();
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
      refreshAssets();
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
      refreshAssets();
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
      actions.push({ key: "archive", label: "Arquivar" });
    }
    if (status === "review") {
      actions.push({ key: "archive", label: "Arquivar" });
    }
    if (status === "draft") {
      actions.push({ key: "archive", label: "Arquivar" });
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

    if (status !== "published") {
      actions.push({ key: "delete", label: "Excluir ativo" });
    }

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
            onClick={() => loadAssets({ currentFilters: filters })}
            disabled={loading && !assets.length}
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
                <TableCell>Marca</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell>Base</TableCell>
                <TableCell>Status editorial</TableCell>
                <TableCell>Indexação</TableCell>
                <TableCell>Detalhe</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !assets.length && <TableRowSkeleton columns={7} />}
              {assets.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    {basesLoading
                      ? "Carregando bases de conhecimento..."
                      : "Nenhum ativo encontrado com os filtros atuais."}
                  </TableCell>
                </TableRow>
              )}
              {visibleAssets.map(asset => {
                const ingestionStatus = getIngestionStatus(asset);
                const ingestionError = getIngestionError(asset);
                return (
                  <TableRow key={asset.id}>
                    <TableCell>{asset.title}</TableCell>
                    <TableCell>
                      <BrandBadge
                        brand={brands.find(
                          item =>
                            Number(item.id) ===
                            Number(brandIdByBase[asset.knowledgeBaseId])
                        )}
                      />
                    </TableCell>
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
                      <Tooltip title="Substituir arquivo">
                        <IconButton
                          size="small"
                          onClick={() => openReplace(asset)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      {["word", "pdf", "document", "markdown", "text"].includes(
                        asset.assetType
                      ) && (
                        <Tooltip title="Baixar anexo">
                          <IconButton
                            size="small"
                            onClick={() => handleDownloadAsset(asset)}
                          >
                            <GetApp />
                          </IconButton>
                        </Tooltip>
                      )}
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
          {viewAsset?.currentVersion?.storageUrl && (
            <Button
              startIcon={<GetApp />}
              onClick={() => handleDownloadAsset(viewAsset)}
              color="primary"
            >
              Baixar anexo
            </Button>
          )}
          <Button onClick={() => setViewOpen(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={replaceOpen}
        onClose={() => !replaceLoading && setReplaceOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Substituir arquivo do ativo</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Envie um novo arquivo (.docx, .pdf, .txt) para corrigir falhas de
            indexação. O conteúdo anterior será substituído e reindexado.
          </Typography>
          <AiFormTextField
            label="Título (opcional)"
            value={replaceTitle}
            onChange={e => setReplaceTitle(e.target.value)}
          />
          <Box mt={2}>
            <input
              type="file"
              accept=".docx,.pdf,.txt,.md,.html"
              onChange={e => setReplaceFile(e.target.files?.[0] || null)}
            />
            {replaceFile && (
              <Typography
                variant="caption"
                display="block"
                color="textSecondary"
              >
                Selecionado: {replaceFile.name}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setReplaceOpen(false)}
            disabled={replaceLoading}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            variant="contained"
            onClick={handleReplaceSave}
            disabled={replaceLoading || !replaceFile}
          >
            {replaceLoading ? "Enviando…" : "Substituir e reindexar"}
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
