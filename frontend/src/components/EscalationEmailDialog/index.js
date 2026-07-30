import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import MailOutlineIcon from "@material-ui/icons/MailOutline";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";

export const DEFAULT_ESCALATION_EMAIL_TO = "fernandofortmax@gmail.com";

const useStyles = makeStyles(theme => ({
  header: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  intro: {
    marginBottom: theme.spacing(2),
    lineHeight: 1.6
  },
  field: {
    marginBottom: theme.spacing(1.5)
  }
}));

const EscalationEmailDialog = ({ open, onClose, ticketId }) => {
  const classes = useStyles();
  const [emailTo, setEmailTo] = useState(DEFAULT_ESCALATION_EMAIL_TO);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setEmailTo(DEFAULT_ESCALATION_EMAIL_TO);
    setNotes("");
  }, [open]);

  const handleSend = async () => {
    if (!ticketId || sending) return;

    const destination = emailTo.trim();
    if (!destination) {
      toast.info("Informe o e-mail de destino.");
      return;
    }

    setSending(true);
    try {
      await api.post(`/tickets/${ticketId}/ai/escalate-email`, {
        emailTo: destination,
        notes: notes.trim() || undefined
      });
      toast.success(`E-mail enviado para ${destination}.`);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle disableTypography>
        <Box className={classes.header}>
          <MailOutlineIcon color="primary" />
          <Typography variant="h6">Enviar e-mail</Typography>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Typography
          variant="body2"
          color="textSecondary"
          className={classes.intro}
        >
          Deseja enviar um e-mail agora para{" "}
          <strong>{DEFAULT_ESCALATION_EMAIL_TO}</strong> com a conversa
          completa, incluindo imagens e análises da IA?
        </Typography>
        <TextField
          fullWidth
          className={classes.field}
          label="Destinatário"
          type="email"
          value={emailTo}
          onChange={event => setEmailTo(event.target.value)}
          variant="outlined"
          size="small"
          helperText="Já vem preenchido. Altere só se precisar enviar para outro endereço."
        />
        <TextField
          fullWidth
          className={classes.field}
          label="Observação opcional (interna no e-mail)"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          variant="outlined"
          size="small"
          multiline
          minRows={3}
          placeholder="Ex.: bug no login, cliente enviou print de erro..."
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={sending}>
          Cancelar
        </Button>
        <Button
          color="primary"
          variant="contained"
          onClick={handleSend}
          disabled={sending}
          startIcon={
            sending ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          {sending ? "Enviando…" : "Enviar e-mail"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EscalationEmailDialog;
