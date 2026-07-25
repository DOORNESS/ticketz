import React, { useState } from "react";
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography
} from "@material-ui/core";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const AiSuggestAnnexDialog = ({
  open,
  onClose,
  ticketId,
  suggestedText,
  onApplyToInput
}) => {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [annexing, setAnnexing] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setContent(suggestedText || "");
    setTitle("");
  }, [open, suggestedText]);

  const handleAnnex = async () => {
    if (!content?.trim()) {
      toast.info("Nada para anexar à base.");
      return;
    }

    try {
      setAnnexing(true);
      await api.post(`/tickets/${ticketId}/ai/annex-response`, {
        title: title.trim() || `Resposta ticket #${ticketId}`,
        content: content.trim()
      });
      toast.success('Resposta anexada à base "Respostas anexas"');
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setAnnexing(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Sugestão da IA</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" gutterBottom>
          Deseja salvar esta resposta na base &quot;Respostas anexas&quot; para
          a IA usar em casos semelhantes?
        </Typography>
        <TextField
          fullWidth
          margin="dense"
          label="Título do documento"
          value={title}
          onChange={event => setTitle(event.target.value)}
          variant="outlined"
          size="small"
        />
        <TextField
          fullWidth
          margin="dense"
          label="Conteúdo sugerido"
          value={content}
          onChange={event => setContent(event.target.value)}
          variant="outlined"
          multiline
          minRows={4}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={annexing}>
          Agora não
        </Button>
        {onApplyToInput && (
          <Button
            onClick={() => {
              onApplyToInput(content);
              onClose();
            }}
            disabled={annexing}
          >
            Usar no campo
          </Button>
        )}
        <Button
          color="primary"
          variant="contained"
          onClick={handleAnnex}
          disabled={annexing}
        >
          {annexing ? <CircularProgress size={20} /> : "Anexar à base"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AiSuggestAnnexDialog;
