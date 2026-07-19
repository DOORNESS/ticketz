import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import SendIcon from "@material-ui/icons/Send";
import FolderSharedIcon from "@material-ui/icons/FolderShared";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  item: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
    cursor: "pointer",
    "&:hover": {
      backgroundColor:
        theme.palette.type === "dark" ? "#1e2a38" : "#f5f9ff"
    }
  },
  selected: {
    borderColor: theme.palette.primary.main,
    backgroundColor:
      theme.palette.type === "dark" ? "#1b2838" : "#eef5ff"
  },
  preview: {
    marginTop: theme.spacing(1),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.background.default,
    borderRadius: 6,
    fontSize: "0.875rem"
  }
}));

const typeLabel = type => {
  const map = {
    link: "Link",
    pdf: "PDF",
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
    document: "Documento",
    text: "Texto",
    message_template: "Modelo"
  };
  return map[type] || type;
};

const RepositoryPanel = ({ open, onClose, ticket }) => {
  const classes = useStyles();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [contentType, setContentType] = useState("");
  const [selected, setSelected] = useState(null);
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const loadItems = useCallback(async () => {
    if (!ticket?.id) return;
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (contentType) params.contentType = contentType;
      const { data } = await api.get(`/tickets/${ticket.id}/repository`, {
        params
      });
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [ticket?.id, search, contentType]);

  useEffect(() => {
    if (open) {
      loadItems();
    }
  }, [open, loadItems]);

  useEffect(() => {
    if (selected) {
      setCaption(selected.sendCaption || "");
    }
  }, [selected]);

  const handleSend = async () => {
    if (!selected?.id || !ticket?.id) return;
    setSending(true);
    try {
      await api.post(
        `/tickets/${ticket.id}/repository/${selected.id}/send`,
        { caption }
      );
      toast.success("Conteúdo enviado ao cliente");
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center" gridGap={8}>
            <FolderSharedIcon color="primary" />
            Repositório
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
          <TextField
            size="small"
            variant="outlined"
            label="Buscar"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && loadItems()}
            style={{ minWidth: 220 }}
          />
          <TextField
            select
            size="small"
            variant="outlined"
            label="Tipo"
            value={contentType}
            onChange={e => setContentType(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="link">Link</MenuItem>
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="image">Imagem</MenuItem>
            <MenuItem value="document">Documento</MenuItem>
            <MenuItem value="audio">Áudio</MenuItem>
            <MenuItem value="text">Texto</MenuItem>
          </TextField>
          <Button variant="outlined" onClick={loadItems} disabled={loading}>
            Filtrar
          </Button>
        </Box>

        <Box display="flex" flexDirection={{ xs: "column", md: "row" }} gridGap={16}>
          <Box flex={1} minWidth={0}>
            {loading ? (
              <Typography color="textSecondary">Carregando...</Typography>
            ) : (
              items.map(item => (
                <Box
                  key={item.id}
                  className={`${classes.item} ${
                    selected?.id === item.id ? classes.selected : ""
                  }`}
                  onClick={() => setSelected(item)}
                >
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="subtitle2">
                      {item.displayTitle || item.name}
                    </Typography>
                    <Chip size="small" label={typeLabel(item.contentType)} />
                  </Box>
                  <Typography variant="caption" color="textSecondary">
                    {item.category || "Sem categoria"} · usado{" "}
                    {item.usageCount || 0}x
                  </Typography>
                  <Typography variant="body2" noWrap>
                    {item.sendCaption || item.description || "—"}
                  </Typography>
                </Box>
              ))
            )}
            {!loading && !items.length && (
              <Typography color="textSecondary">
                Nenhum conteúdo disponível para este atendimento.
              </Typography>
            )}
          </Box>

          <Box flex={1} minWidth={0}>
            {selected ? (
              <>
                <Typography variant="subtitle1" gutterBottom>
                  Pré-visualização
                </Typography>
                <div className={classes.preview}>
                  <strong>{selected.displayTitle || selected.name}</strong>
                  <Typography variant="body2" style={{ marginTop: 8 }}>
                    {selected.description}
                  </Typography>
                  {selected.externalUrl && (
                    <Typography variant="body2" style={{ marginTop: 8 }}>
                      {selected.externalUrl}
                    </Typography>
                  )}
                </div>
                <TextField
                  fullWidth
                  multiline
                  rows={3}
                  variant="outlined"
                  size="small"
                  label="Mensagem ao enviar"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  style={{ marginTop: 12 }}
                />
              </>
            ) : (
              <Typography color="textSecondary">
                Selecione um item para revisar e enviar.
              </Typography>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
        <Button
          color="primary"
          variant="contained"
          startIcon={<SendIcon />}
          disabled={!selected || sending}
          onClick={handleSend}
        >
          Enviar ao cliente
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RepositoryPanel;
