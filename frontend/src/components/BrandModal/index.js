import React, { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  TextField,
  Typography,
  Switch,
  FormControlLabel
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  section: {
    marginTop: theme.spacing(2),
    fontWeight: 700,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    color: theme.palette.text.secondary
  },
  hint: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1)
  },
  contactRow: {
    display: "flex",
    gap: theme.spacing(1),
    alignItems: "center",
    marginBottom: theme.spacing(1)
  }
}));

const emptyBrand = {
  slug: "",
  name: "",
  shortLabel: "",
  primaryColor: "#1976d2",
  logoUrl: "",
  identityName: "",
  identityReply: "",
  escalationUrl: "",
  informationalFallback: "",
  supportContacts: [],
  vocabulary: [],
  active: true,
  sortOrder: 0
};

/**
 * Formulário da marca.
 *
 * Tudo que antes vivia em código — persona, contatos, URL de escalação,
 * fallback e vocabulário — é editável aqui. `slug` só pode ser definido na
 * criação: é a identidade estável usada nos vínculos.
 */
const BrandModal = ({ open, onClose, brand, onSaved }) => {
  const classes = useStyles();
  const [form, setForm] = useState(emptyBrand);
  const [vocabularyText, setVocabularyText] = useState("");
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(brand?.id);

  useEffect(() => {
    if (brand) {
      setForm({ ...emptyBrand, ...brand });
      setVocabularyText((brand.vocabulary || []).join(", "));
    } else {
      setForm(emptyBrand);
      setVocabularyText("");
    }
  }, [brand, open]);

  const setField = (field, value) =>
    setForm(current => ({ ...current, [field]: value }));

  const setContact = (index, field, value) =>
    setForm(current => {
      const contacts = [...(current.supportContacts || [])];
      contacts[index] = { ...contacts[index], [field]: value };
      return { ...current, supportContacts: contacts };
    });

  const addContact = () =>
    setForm(current => ({
      ...current,
      supportContacts: [
        ...(current.supportContacts || []),
        { name: "", role: "", whatsapp: "" }
      ]
    }));

  const removeContact = index =>
    setForm(current => ({
      ...current,
      supportContacts: (current.supportContacts || []).filter(
        (_, i) => i !== index
      )
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        vocabulary: vocabularyText
          .split(",")
          .map(term => term.trim())
          .filter(Boolean),
        supportContacts: (form.supportContacts || []).filter(contact =>
          contact?.name?.trim()
        )
      };

      if (isEditing) {
        await api.put(`/brands/${brand.id}`, payload);
        toast.success("Marca atualizada.");
      } else {
        await api.post("/brands", payload);
        toast.success("Marca criada.");
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle>{isEditing ? "Editar marca" : "Nova marca"}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={5}>
            <TextField
              label="Nome"
              fullWidth
              variant="outlined"
              size="small"
              value={form.name}
              onChange={e => setField("name", e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Slug"
              fullWidth
              variant="outlined"
              size="small"
              disabled={isEditing}
              helperText={
                isEditing
                  ? "Identidade estável — não muda depois de criada"
                  : "minúsculas, sem espaço. ex.: marca3"
              }
              value={form.slug}
              onChange={e =>
                setField("slug", e.target.value.toLowerCase().trim())
              }
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="Nome curto"
              fullWidth
              variant="outlined"
              size="small"
              helperText="Usado no badge da lista"
              value={form.shortLabel || ""}
              onChange={e => setField("shortLabel", e.target.value)}
            />
          </Grid>

          <Grid item xs={12} sm={3}>
            <TextField
              label="Cor primária"
              type="color"
              fullWidth
              variant="outlined"
              size="small"
              value={form.primaryColor || "#1976d2"}
              onChange={e => setField("primaryColor", e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="URL do logo"
              fullWidth
              variant="outlined"
              size="small"
              value={form.logoUrl || ""}
              onChange={e => setField("logoUrl", e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={Boolean(form.active)}
                  onChange={e => setField("active", e.target.checked)}
                  color="primary"
                />
              }
              label="Ativa"
            />
          </Grid>

          <Grid item xs={12}>
            <Typography className={classes.section}>
              Assistente de IA
            </Typography>
            <Typography className={classes.hint}>
              Define como o robô desta operação se apresenta. Substitui o que
              antes estava fixo no código.
            </Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Nome do assistente"
              fullWidth
              variant="outlined"
              size="small"
              value={form.identityName || ""}
              onChange={e => setField("identityName", e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={8}>
            <TextField
              label="Resposta de identidade"
              fullWidth
              variant="outlined"
              size="small"
              value={form.identityReply || ""}
              onChange={e => setField("identityReply", e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="Vocabulário da marca"
              fullWidth
              variant="outlined"
              size="small"
              helperText="Separado por vírgula. Termos que identificam o domínio desta operação e reforçam a busca na base."
              value={vocabularyText}
              onChange={e => setVocabularyText(e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <TextField
              label="URL de escalação"
              fullWidth
              variant="outlined"
              size="small"
              helperText="Para onde encaminhar quando a base não resolve."
              value={form.escalationUrl || ""}
              onChange={e => setField("escalationUrl", e.target.value)}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Mensagem de fallback"
              fullWidth
              multiline
              minRows={2}
              variant="outlined"
              size="small"
              value={form.informationalFallback || ""}
              onChange={e => setField("informationalFallback", e.target.value)}
            />
          </Grid>

          <Grid item xs={12}>
            <Typography className={classes.section}>
              Contatos de suporte
            </Typography>
            {(form.supportContacts || []).map((contact, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <div className={classes.contactRow} key={index}>
                <TextField
                  label="Nome"
                  variant="outlined"
                  size="small"
                  value={contact.name || ""}
                  onChange={e => setContact(index, "name", e.target.value)}
                />
                <TextField
                  label="Função"
                  variant="outlined"
                  size="small"
                  value={contact.role || ""}
                  onChange={e => setContact(index, "role", e.target.value)}
                />
                <TextField
                  label="WhatsApp"
                  variant="outlined"
                  size="small"
                  value={contact.whatsapp || ""}
                  onChange={e => setContact(index, "whatsapp", e.target.value)}
                />
                <IconButton size="small" onClick={() => removeContact(index)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </div>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addContact}>
              Adicionar contato
            </Button>
          </Grid>

          {isEditing && (
            <Grid item xs={12}>
              <Typography className={classes.hint}>
                Conexões, filas, agentes e domínios são vinculados a esta marca
                nas telas de Conexões, Filas e IA — ali cada registro tem o
                campo “Marca”.
              </Typography>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          color="primary"
          variant="contained"
          disabled={saving || !form.name || !form.slug}
        >
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BrandModal;
