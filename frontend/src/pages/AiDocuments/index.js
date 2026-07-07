import React, { useEffect, useState } from "react";
import {
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const AiDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [bases, setBases] = useState([]);
  const [openText, setOpenText] = useState(false);
  const [form, setForm] = useState({
    knowledgeBaseId: "",
    title: "",
    content: ""
  });
  const [file, setFile] = useState(null);

  const load = async () => {
    try {
      const [{ data: docs }, { data: kb }] = await Promise.all([
        api.get("/ai/documents"),
        api.get("/ai/knowledge-bases")
      ]);
      setDocuments(docs);
      setBases(kb);
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveText = async () => {
    try {
      await api.post("/ai/documents/text", form);
      toast.success("Documento cadastrado");
      setOpenText(false);
      setForm({ knowledgeBaseId: "", title: "", content: "" });
      load();
    } catch (err) {
      toastError(err);
    }
  };

  const handleUpload = async () => {
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("knowledgeBaseId", form.knowledgeBaseId);
      data.append("title", form.title || file?.name);
      await api.post("/ai/documents/upload", data);
      toast.success("Upload realizado");
      setFile(null);
      load();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>IA — Documentos</Title>
        <Button
          variant="contained"
          color="primary"
          onClick={() => setOpenText(true)}
        >
          Texto Manual
        </Button>
      </MainHeader>

      <Paper style={{ padding: 16, marginBottom: 16 }}>
        <TextField
          select
          label="Base de conhecimento"
          fullWidth
          margin="dense"
          value={form.knowledgeBaseId}
          onChange={e => setForm({ ...form, knowledgeBaseId: e.target.value })}
          SelectProps={{ native: true }}
        >
          <option value="">Selecione</option>
          {bases.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </TextField>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.md,.html"
          onChange={e => setFile(e.target.files[0])}
        />
        <Button
          variant="outlined"
          color="primary"
          disabled={!file || !form.knowledgeBaseId}
          onClick={handleUpload}
        >
          Upload de Arquivo
        </Button>
      </Paper>

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Título</TableCell>
              <TableCell>Tipo</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Arquivo</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {documents.map(doc => (
              <TableRow key={doc.id}>
                <TableCell>{doc.title}</TableCell>
                <TableCell>{doc.type}</TableCell>
                <TableCell>{doc.status}</TableCell>
                <TableCell>{doc.originalFilename}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Dialog open={openText} onClose={() => setOpenText(false)} fullWidth>
        <DialogTitle>Documento em Texto Manual</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Base de conhecimento"
            fullWidth
            margin="dense"
            value={form.knowledgeBaseId}
            onChange={e =>
              setForm({ ...form, knowledgeBaseId: e.target.value })
            }
            SelectProps={{ native: true }}
          >
            <option value="">Selecione</option>
            {bases.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </TextField>
          <TextField
            label="Título"
            fullWidth
            margin="dense"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <TextField
            label="Conteúdo"
            fullWidth
            margin="dense"
            multiline
            rows={8}
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenText(false)}>Cancelar</Button>
          <Button color="primary" variant="contained" onClick={handleSaveText}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiDocuments;
