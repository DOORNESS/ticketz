import React, { useEffect, useState } from "react";
import {
  Button,
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
import { Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useAiPageStyles } from "../../components/Ai/shared";
import BrandSelect from "../../components/BrandSelect";
import {
  AiFormSelect,
  AiFormTextField,
  AiSectionPaper
} from "../../components/Ai/forms";

const defaultForm = {
  brandId: null,
  name: "",
  slug: "",
  description: "",
  linkedSpecialty: "",
  sortOrder: 100,
  active: true
};

const specialtyOptions = [
  { value: "", label: "Nenhuma" },
  { value: "faq", label: "FAQ" },
  { value: "financeiro", label: "Financeiro" },
  { value: "suporte", label: "Suporte Técnico" },
  { value: "geral", label: "Atendimento Geral" }
];

const AiKnowledgeDomains = () => {
  const classes = useAiPageStyles();
  const [domains, setDomains] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/ai/knowledge-domains");
      setDomains(Array.isArray(data) ? data : []);
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
        sortOrder: Number(form.sortOrder),
        linkedSpecialty: form.linkedSpecialty || null,
        slug: form.slug.trim() || undefined
      };

      if (editingId) {
        await api.put(`/ai/knowledge-domains/${editingId}`, payload);
      } else {
        await api.post("/ai/knowledge-domains", payload);
      }

      toast.success("Domínio salvo com sucesso");
      setOpen(false);
      setEditingId(null);
      setForm(defaultForm);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const handleEdit = domain => {
    setEditingId(domain.id);
    setForm({
      name: domain.name || "",
      slug: domain.slug || "",
      description: domain.description || "",
      linkedSpecialty: domain.linkedSpecialty || "",
      sortOrder: domain.sortOrder ?? 100,
      active: domain.active !== false,
      brandId: domain.brandId ?? null
    });
    setOpen(true);
  };

  const specialtyLabel = value => {
    const match = specialtyOptions.find(option => option.value === value);
    return match?.label || value || "—";
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Domínios de Conhecimento</Title>
        <Button
          variant="contained"
          color="primary"
          onClick={() => {
            setEditingId(null);
            setForm(defaultForm);
            setOpen(true);
          }}
        >
          Novo Domínio
        </Button>
      </MainHeader>

      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Domínios cadastrados"
          subtitle="Agrupe bases de conhecimento por área de negócio ou produto."
        >
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nome</TableCell>
                <TableCell>Slug</TableCell>
                <TableCell>Especialidade</TableCell>
                <TableCell>Ordem</TableCell>
                <TableCell>Ativo</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {domains.map(domain => (
                <TableRow key={domain.id}>
                  <TableCell>{domain.name}</TableCell>
                  <TableCell>{domain.slug}</TableCell>
                  <TableCell>
                    {specialtyLabel(domain.linkedSpecialty)}
                  </TableCell>
                  <TableCell>{domain.sortOrder}</TableCell>
                  <TableCell>{domain.active ? "Sim" : "Não"}</TableCell>
                  <TableCell align="center">
                    <IconButton onClick={() => handleEdit(domain)}>
                      <Edit />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
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
          {editingId ? "Editar Domínio" : "Novo Domínio de Conhecimento"}
        </DialogTitle>
        <DialogContent dividers>
          <AiFormTextField
            label="Nome"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            helperText="Nome exibido no painel (ex.: Financeiro, Suporte)."
          />
          <BrandSelect
            value={form.brandId ?? null}
            onChange={brandId => setForm({ ...form, brandId })}
            helperText="Marca dona deste domínio. Uma marca pode ter vários domínios; as bases dele seguem a mesma marca."
          />
          <AiFormTextField
            label="Slug"
            value={form.slug}
            onChange={e => setForm({ ...form, slug: e.target.value })}
            helperText="Identificador estável. Deixe vazio para gerar a partir do nome."
          />
          <AiFormTextField
            label="Descrição"
            multiline
            rows={3}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <AiFormSelect
            label="Especialidade vinculada"
            value={form.linkedSpecialty}
            onChange={e =>
              setForm({ ...form, linkedSpecialty: String(e.target.value) })
            }
            options={specialtyOptions.filter(option => option.value !== "")}
            emptyLabel="Nenhuma"
            helperText="Alinha o domínio com um especialista da Fase 1."
          />
          <AiFormTextField
            label="Ordem de exibição"
            type="number"
            value={form.sortOrder}
            onChange={e => setForm({ ...form, sortOrder: e.target.value })}
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
              label="Ativo"
            />
          </div>
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

export default AiKnowledgeDomains;
