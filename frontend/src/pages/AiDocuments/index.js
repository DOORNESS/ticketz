import React, { useEffect, useState } from "react";
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography
} from "@material-ui/core";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { useAiPageStyles } from "../../components/Ai/shared";
import {
  AiFormSelect,
  AiFormTextField,
  AiSectionPaper
} from "../../components/Ai/forms";

const AiDocuments = () => {
  const classes = useAiPageStyles();
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
      setDocuments(docs || []);
      setBases((kb || []).filter(base => base.active));
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

  const baseOptions = bases.map(base => ({
    value: base.id,
    label: base.name
  }));

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

      <div className={classes.pageContent}>
        <AiSectionPaper
          title="Upload de arquivos"
          subtitle="Envie PDF, DOCX, TXT, MD ou HTML para a base selecionada."
        >
          <AiFormSelect
            label="Base de conhecimento"
            value={form.knowledgeBaseId}
            onChange={e =>
              setForm({ ...form, knowledgeBaseId: String(e.target.value) })
            }
            options={baseOptions}
            helperText="Escolha a base que receberá o documento."
          />
          <Box mt={1} mb={2}>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.html"
              onChange={e => setFile(e.target.files[0])}
            />
            {file && (
              <Typography variant="body2" color="textSecondary">
                Arquivo selecionado: {file.name}
              </Typography>
            )}
          </Box>
          <Button
            variant="outlined"
            color="primary"
            disabled={!file || !form.knowledgeBaseId}
            onClick={handleUpload}
          >
            Upload de Arquivo
          </Button>
        </AiSectionPaper>

        <AiSectionPaper
          title="Documentos cadastrados"
          subtitle="Status de ingestão e arquivos disponíveis para consulta da IA."
        >
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
        </AiSectionPaper>
      </div>

      <Dialog open={openText} onClose={() => setOpenText(false)} fullWidth>
        <DialogTitle>Documento em Texto Manual</DialogTitle>
        <DialogContent dividers>
          <AiFormSelect
            label="Base de conhecimento"
            value={form.knowledgeBaseId}
            onChange={e =>
              setForm({ ...form, knowledgeBaseId: String(e.target.value) })
            }
            options={baseOptions}
          />
          <AiFormTextField
            label="Título"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <AiFormTextField
            label="Conteúdo"
            multiline
            rows={8}
            value={form.content}
            onChange={e => setForm({ ...form, content: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenText(false)}>Cancelar</Button>
          <Button
            color="primary"
            variant="contained"
            onClick={handleSaveText}
            disabled={!form.knowledgeBaseId || !form.content.trim()}
          >
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default AiDocuments;
