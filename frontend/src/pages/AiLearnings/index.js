import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  makeStyles
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  filters: {
    display: "flex",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: "wrap"
  },
  transcript: {
    maxHeight: 180,
    overflow: "auto",
    whiteSpace: "pre-wrap",
    background: theme.palette.background.default,
    padding: theme.spacing(1),
    borderRadius: 4
  }
}));

const statusColors = {
  pending: "default",
  approved: "primary",
  rejected: "secondary",
  incorporated: "primary"
};

const AiLearnings = () => {
  const classes = useStyles();
  const [learnings, setLearnings] = useState([]);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [incorporateOpen, setIncorporateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [knowledgeBases, setKnowledgeBases] = useState([]);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");
  const [editForm, setEditForm] = useState({
    title: "",
    mainQuestion: "",
    organizedAnswer: "",
    summary: ""
  });

  const loadLearnings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/ai/learnings", {
        params: { status: status || undefined }
      });
      setLearnings(data.learnings || []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLearnings();
  }, [status]);

  useEffect(() => {
    const loadBases = async () => {
      try {
        const { data } = await api.get("/ai/knowledge-bases");
        setKnowledgeBases(data || []);
      } catch (err) {
        toastError(err);
      }
    };
    loadBases();
  }, []);

  const runAction = async (id, action, extra = {}) => {
    try {
      if (action === "approve") {
        await api.post(`/ai/learnings/${id}/approve`);
      } else if (action === "reject") {
        await api.post(`/ai/learnings/${id}/reject`, extra);
      } else if (action === "incorporate") {
        await api.post(`/ai/learnings/${id}/incorporate`, extra);
      }
      toast.success(i18n.t("aiLearning.admin.success"));
      loadLearnings();
    } catch (err) {
      toastError(err);
    }
  };

  const openEdit = learning => {
    setSelected(learning);
    setEditForm({
      title: learning.suggestedTitle || "",
      mainQuestion: learning.mainQuestion || "",
      organizedAnswer:
        learning.organizedAnswer || learning.suggestedContent || "",
      summary: learning.summary || ""
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    try {
      await api.put(`/ai/learnings/${selected.id}`, editForm);
      setEditOpen(false);
      loadLearnings();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("aiLearning.admin.title")}</Title>
      </MainHeader>

      <Box className={classes.filters}>
        <FormControl variant="outlined" size="small" style={{ minWidth: 180 }}>
          <InputLabel>{i18n.t("aiLearning.admin.filter")}</InputLabel>
          <Select
            label={i18n.t("aiLearning.admin.filter")}
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <MenuItem value="pending">
              {i18n.t("aiLearning.admin.pending")}
            </MenuItem>
            <MenuItem value="approved">
              {i18n.t("aiLearning.admin.approved")}
            </MenuItem>
            <MenuItem value="rejected">
              {i18n.t("aiLearning.admin.rejected")}
            </MenuItem>
            <MenuItem value="incorporated">
              {i18n.t("aiLearning.admin.incorporated")}
            </MenuItem>
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={loadLearnings} disabled={loading}>
          {i18n.t("aiLearning.admin.refresh")}
        </Button>
      </Box>

      <Paper>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{i18n.t("aiLearning.admin.columns.title")}</TableCell>
              <TableCell>
                {i18n.t("aiLearning.admin.columns.customer")}
              </TableCell>
              <TableCell>{i18n.t("aiLearning.admin.columns.queue")}</TableCell>
              <TableCell>
                {i18n.t("aiLearning.admin.columns.confidence")}
              </TableCell>
              <TableCell>{i18n.t("aiLearning.admin.columns.status")}</TableCell>
              <TableCell align="right">
                {i18n.t("aiLearning.admin.columns.actions")}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {learnings.map(learning => (
              <TableRow key={learning.id}>
                <TableCell>{learning.suggestedTitle || "-"}</TableCell>
                <TableCell>{learning.customerName || "-"}</TableCell>
                <TableCell>{learning.queueName || "-"}</TableCell>
                <TableCell>
                  {learning.confidence
                    ? `${Math.round(learning.confidence * 100)}%`
                    : "-"}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={statusColors[learning.status] || "default"}
                    label={learning.status}
                  />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => openEdit(learning)}>
                    {i18n.t("aiLearning.admin.edit")}
                  </Button>
                  {learning.status === "pending" && (
                    <>
                      <Button
                        size="small"
                        color="primary"
                        onClick={() => runAction(learning.id, "approve")}
                      >
                        {i18n.t("aiLearning.admin.approve")}
                      </Button>
                      <Button
                        size="small"
                        onClick={() => runAction(learning.id, "reject")}
                      >
                        {i18n.t("aiLearning.admin.reject")}
                      </Button>
                      <Button
                        size="small"
                        color="secondary"
                        onClick={() => {
                          setSelected(learning);
                          setIncorporateOpen(true);
                        }}
                      >
                        {i18n.t("aiLearning.admin.incorporate")}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!learnings.length && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  {i18n.t("aiLearning.admin.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{i18n.t("aiLearning.admin.editTitle")}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gridGap={12} mt={1}>
            <TextField
              label={i18n.t("aiLearning.fields.title")}
              value={editForm.title}
              onChange={e =>
                setEditForm({ ...editForm, title: e.target.value })
              }
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.mainQuestion")}
              value={editForm.mainQuestion}
              onChange={e =>
                setEditForm({ ...editForm, mainQuestion: e.target.value })
              }
              fullWidth
            />
            <TextField
              label={i18n.t("aiLearning.fields.organizedAnswer")}
              value={editForm.organizedAnswer}
              onChange={e =>
                setEditForm({ ...editForm, organizedAnswer: e.target.value })
              }
              fullWidth
              multiline
              rows={6}
            />
            <TextField
              label={i18n.t("aiLearning.fields.summary")}
              value={editForm.summary}
              onChange={e =>
                setEditForm({ ...editForm, summary: e.target.value })
              }
              fullWidth
            />
            {selected?.transcript && (
              <Box>
                <Typography variant="subtitle2">
                  {i18n.t("aiLearning.admin.transcript")}
                </Typography>
                <Box className={classes.transcript}>{selected.transcript}</Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>
            {i18n.t("aiLearning.closeModal.cancel")}
          </Button>
          <Button color="primary" variant="contained" onClick={saveEdit}>
            {i18n.t("aiLearning.admin.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={incorporateOpen}
        onClose={() => setIncorporateOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{i18n.t("aiLearning.admin.incorporateTitle")}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth variant="outlined" margin="dense">
            <InputLabel>{i18n.t("aiLearning.admin.knowledgeBase")}</InputLabel>
            <Select
              value={knowledgeBaseId}
              onChange={e => setKnowledgeBaseId(e.target.value)}
              label={i18n.t("aiLearning.admin.knowledgeBase")}
            >
              {knowledgeBases.map(base => (
                <MenuItem key={base.id} value={String(base.id)}>
                  {base.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIncorporateOpen(false)}>
            {i18n.t("aiLearning.closeModal.cancel")}
          </Button>
          <Button
            color="primary"
            variant="contained"
            disabled={!knowledgeBaseId || !selected}
            onClick={async () => {
              await runAction(selected.id, "incorporate", {
                knowledgeBaseId: Number(knowledgeBaseId)
              });
              setIncorporateOpen(false);
            }}
          >
            {i18n.t("aiLearning.admin.incorporate")}
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiLearnings;
