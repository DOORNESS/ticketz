import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  CircularProgress,
  Chip
} from "@material-ui/core";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const AiLearningCloseModal = ({ open, ticket, onClose, onComplete }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionType, setActionType] = useState("");
  const [suggestion, setSuggestion] = useState(null);
  const [similarDocs, setSimilarDocs] = useState([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [form, setForm] = useState({
    title: "",
    mainQuestion: "",
    organizedAnswer: "",
    keywords: "",
    category: "",
    summary: "",
    suggestedUpdate: ""
  });

  useEffect(() => {
    if (!open) {
      setStep(1);
      setActionType("");
      setSuggestion(null);
      setSimilarDocs([]);
      setSelectedDocumentId("");
      setForm({
        title: "",
        mainQuestion: "",
        organizedAnswer: "",
        keywords: "",
        category: "",
        summary: "",
        suggestedUpdate: ""
      });
    }
  }, [open]);

  const closeTicket = async () => {
    await api.put(`/tickets/${ticket.id}`, {
      status: "closed",
      userId: ticket.userId
    });
    onComplete();
  };

  const handleNoKnowledge = async () => {
    setLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/ai/learning/decline`);
      await closeTicket();
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleYesKnowledge = () => {
    setStep(2);
  };

  const loadDraft = async type => {
    setLoading(true);
    try {
      const { data } = await api.post(
        `/tickets/${ticket.id}/ai/learning/draft`,
        {
          actionType: type
        }
      );
      const draft = data.suggestion;
      setSuggestion(draft);
      setForm({
        title: draft.suggestedTitle || "",
        mainQuestion: draft.mainQuestion || "",
        organizedAnswer: draft.organizedAnswer || draft.suggestedContent || "",
        keywords: Array.isArray(draft.keywords)
          ? draft.keywords.join(", ")
          : "",
        category: draft.category || "",
        summary: draft.summary || "",
        suggestedUpdate: draft.suggestedUpdate || ""
      });
      setStep(3);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAction = async type => {
    setActionType(type);

    if (type === "update_existing") {
      setLoading(true);
      try {
        const { data } = await api.post(
          `/tickets/${ticket.id}/ai/learning/similar-docs`
        );
        setSimilarDocs(data.documents || []);
        setStep(2.5);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
      return;
    }

    await loadDraft(type);
  };

  const handleSelectDocument = async () => {
    if (!selectedDocumentId) return;
    setLoading(true);
    try {
      const { data } = await api.post(
        `/tickets/${ticket.id}/ai/learning/update-draft`,
        { documentId: Number(selectedDocumentId) }
      );
      const draft = data.suggestion;
      setSuggestion(draft);
      setForm({
        title: draft.suggestedTitle || "",
        mainQuestion: draft.mainQuestion || "",
        organizedAnswer: draft.organizedAnswer || "",
        keywords: "",
        category: "",
        summary: draft.summary || "",
        suggestedUpdate: draft.suggestedUpdate || ""
      });
      setStep(3);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndClose = async () => {
    if (!suggestion?.id) {
      await closeTicket();
      return;
    }

    setLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/ai/learning/save`, {
        suggestionId: suggestion.id,
        title: form.title,
        mainQuestion: form.mainQuestion,
        organizedAnswer: form.organizedAnswer,
        keywords: form.keywords
          .split(",")
          .map(item => item.trim())
          .filter(Boolean),
        category: form.category,
        summary: form.summary,
        suggestedUpdate: form.suggestedUpdate,
        actionType,
        selectedDocumentId: selectedDocumentId
          ? Number(selectedDocumentId)
          : undefined
      });
      await closeTicket();
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{i18n.t("aiLearning.closeModal.title")}</DialogTitle>
      <DialogContent>
        {loading && (
          <Box display="flex" justifyContent="center" p={2}>
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && step === 1 && (
          <Typography>{i18n.t("aiLearning.closeModal.question1")}</Typography>
        )}

        {!loading && step === 2 && (
          <Typography>{i18n.t("aiLearning.closeModal.question2")}</Typography>
        )}

        {!loading && step === 2.5 && (
          <Box>
            <Typography gutterBottom>
              {i18n.t("aiLearning.closeModal.selectDocument")}
            </Typography>
            {similarDocs.map(doc => (
              <Box
                key={doc.documentId}
                mb={1}
                p={1}
                border={1}
                borderColor="divider"
              >
                <Typography variant="subtitle2">
                  {doc.title} — {Math.round((doc.confidence || 0) * 100)}%
                  confiança
                </Typography>
                {doc.similarSnippets?.slice(0, 2).map((snippet, idx) => (
                  <Typography key={idx} variant="body2" color="textSecondary">
                    {snippet}
                  </Typography>
                ))}
                <Button
                  size="small"
                  color="primary"
                  onClick={() => {
                    setSelectedDocumentId(String(doc.documentId));
                  }}
                >
                  {i18n.t("aiLearning.closeModal.choose")}
                </Button>
              </Box>
            ))}
            {selectedDocumentId && (
              <Chip
                label={`Documento #${selectedDocumentId}`}
                color="primary"
                style={{ marginTop: 8 }}
              />
            )}
          </Box>
        )}

        {!loading && step === 3 && (
          <Box display="flex" flexDirection="column" gridGap={12}>
            <TextField
              label={i18n.t("aiLearning.fields.title")}
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.mainQuestion")}
              value={form.mainQuestion}
              onChange={e => setForm({ ...form, mainQuestion: e.target.value })}
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.organizedAnswer")}
              value={form.organizedAnswer}
              onChange={e =>
                setForm({ ...form, organizedAnswer: e.target.value })
              }
              fullWidth
              multiline
              rows={5}
            />
            {actionType === "update_existing" && (
              <TextField
                label={i18n.t("aiLearning.fields.suggestedUpdate")}
                value={form.suggestedUpdate}
                onChange={e =>
                  setForm({ ...form, suggestedUpdate: e.target.value })
                }
                fullWidth
                multiline
                rows={4}
              />
            )}
            <TextField
              label={i18n.t("aiLearning.fields.keywords")}
              value={form.keywords}
              onChange={e => setForm({ ...form, keywords: e.target.value })}
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.category")}
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.summary")}
              value={form.summary}
              onChange={e => setForm({ ...form, summary: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {i18n.t("aiLearning.closeModal.cancel")}
        </Button>

        {step === 1 && !loading && (
          <>
            <Button onClick={handleNoKnowledge} color="default">
              {i18n.t("aiLearning.closeModal.no")}
            </Button>
            <Button
              onClick={handleYesKnowledge}
              color="primary"
              variant="contained"
            >
              {i18n.t("aiLearning.closeModal.yes")}
            </Button>
          </>
        )}

        {step === 2 && !loading && (
          <>
            <Button onClick={() => handleSelectAction("create_new")}>
              {i18n.t("aiLearning.closeModal.createNew")}
            </Button>
            <Button onClick={() => handleSelectAction("update_existing")}>
              {i18n.t("aiLearning.closeModal.updateExisting")}
            </Button>
            <Button
              onClick={() => handleSelectAction("review_later")}
              color="primary"
            >
              {i18n.t("aiLearning.closeModal.reviewLater")}
            </Button>
          </>
        )}

        {step === 2.5 && !loading && (
          <Button
            onClick={handleSelectDocument}
            color="primary"
            variant="contained"
            disabled={!selectedDocumentId}
          >
            {i18n.t("aiLearning.closeModal.continue")}
          </Button>
        )}

        {step === 3 && !loading && (
          <Button
            onClick={handleSaveAndClose}
            color="primary"
            variant="contained"
          >
            {i18n.t("aiLearning.closeModal.saveAndClose")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default AiLearningCloseModal;
