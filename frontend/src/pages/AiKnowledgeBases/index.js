import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch
} from "@material-ui/core";
import { Link as RouterLink } from "react-router-dom";
import { DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import AiSetupWizard from "../../components/AiSetupWizard";
import { useAiPageStyles } from "../../components/Ai/shared";
import {
  AiFormSelect,
  AiFormTextField,
  AiSectionPaper
} from "../../components/Ai/forms";

const defaultForm = {
  name: "",
  description: "",
  knowledgeDomainId: "",
  active: true
};

const AiKnowledgeBases = () => {
  const classes = useAiPageStyles();
  const [bases, setBases] = useState([]);
  const [domains, setDomains] = useState([]);
  const [assetCounts, setAssetCounts] = useState({});
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);

  const domainOptions = useMemo(
    () =>
      domains
        .filter(domain => domain.active)
        .map(domain => ({
          value: domain.id,
          label: domain.name
        })),
    [domains]
  );

  const domainNameById = useMemo(() => {
    const map = {};
    domains.forEach(domain => {
      map[domain.id] = domain.name;
    });
    return map;
  }, [domains]);

  const loadAssetCounts = async () => {
    try {
      const { data } = await api.get("/ai/assets");
      const counts = {};
      (Array.isArray(data) ? data : []).forEach(asset => {
        const baseId = asset.knowledgeBaseId;
        if (!baseId) {
          return;
        }
        if (!counts[baseId]) {
          counts[baseId] = { total: 0, published: 0 };
        }
        counts[baseId].total += 1;
        if (asset.lifecycleStatus === "published") {
          counts[baseId].published += 1;
        }
      });
      setAssetCounts(counts);
    } catch (_err) {
      setAssetCounts({});
    }
  };

  const load = async () => {
    try {
      const [{ data: kbData }, { data: domainData }] = await Promise.all([
        api.get("/ai/knowledge-bases"),
        api.get("/ai/knowledge-domains")
      ]);
      setBases(Array.isArray(kbData) ? kbData : []);
      setDomains(Array.isArray(domainData) ? domainData : []);
      await loadAssetCounts();
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
        knowledgeDomainId: form.knowledgeDomainId
          ? Number(form.knowledgeDomainId)
          : null
      };

      if (editingId) {
        await api.put(`/ai/knowledge-bases/${editingId}`, payload);
      } else {
        await api.post("/ai/knowledge-bases", payload);
      }
      toast.success("Base salva com sucesso");
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const openEdit = base => {
    setEditingId(base.id);
    setForm({
      name: base.name,
      description: base.description || "",
      knowledgeDomainId: base.knowledgeDomainId
        ? String(base.knowledgeDomainId)
        : "",
      active: base.active
    });
    setOpen(true);
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Base de Conhecimento</Title>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setEditingId(null);
            setForm(defaultForm);
            setOpen(true);
          }}
        >
          Nova Base
        </Button>
      </MainHeader>
      <AiSetupWizard />
      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Bases cadastradas"
          subtitle="Organize o conhecimento que alimenta os agentes de IA."
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Domínio</TableCell>
                <TableCell>Descrição</TableCell>
                <TableCell>Ativos</TableCell>
                <TableCell>Agentes</TableCell>
                <TableCell>Ativa</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bases.map(base => {
                const counts = assetCounts[base.id];
                return (
                  <TableRow key={base.id}>
                    <TableCell>{base.name}</TableCell>
                    <TableCell>
                      {domainNameById[base.knowledgeDomainId] || "—"}
                    </TableCell>
                    <TableCell>{base.description}</TableCell>
                    <TableCell>
                      {counts
                        ? `${counts.published} pub. / ${counts.total} total`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {(base.linkedAgents || [])
                        .map(agent => agent.name)
                        .join(", ") || "—"}
                    </TableCell>
                    <TableCell>{base.active ? "Sim" : "Não"}</TableCell>
                    <TableCell align="center">
                      <IconButton onClick={() => openEdit(base)}>
                        <Edit />
                      </IconButton>
                      <IconButton
                        onClick={async () => {
                          await api.delete(`/ai/knowledge-bases/${base.id}`);
                          load();
                        }}
                      >
                        <DeleteOutline />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </AiSectionPaper>
      </div>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {editingId ? "Editar Base" : "Nova Base de Conhecimento"}
        </DialogTitle>
        <DialogContent dividers>
          <AiFormTextField
            label="Nome"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            helperText="Nome interno da base de conhecimento."
          />
          <AiFormSelect
            label="Domínio"
            value={form.knowledgeDomainId}
            onChange={e =>
              setForm({
                ...form,
                knowledgeDomainId: String(e.target.value)
              })
            }
            options={domainOptions}
            helperText="Agrupa a base dentro de um domínio de negócio."
          />
          <AiFormTextField
            label="Descrição"
            multiline
            rows={3}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            helperText="Resumo do conteúdo ou finalidade desta base."
          />
          <div className={classes.switchRow}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.active}
                  onChange={e => setForm({ ...form, active: e.target.checked })}
                  color="primary"
                />
              }
              label="Ativa"
            />
          </div>
          {editingId && (
            <div style={{ marginTop: 12 }}>
              <Link component={RouterLink} to={`/ai/assets?knowledgeBaseId=${editingId}`}>
                Gerenciar documentos desta base (PDF, DOCX, imagens)
              </Link>
              <br />
              <Link component={RouterLink} to="/ai/repository">
                Repositório de conteúdos enviáveis ao cliente
              </Link>
            </div>
          )}
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

export default AiKnowledgeBases;
