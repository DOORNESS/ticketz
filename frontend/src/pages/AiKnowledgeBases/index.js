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
  DialogActions
} from "@material-ui/core";
import { DeleteOutline, Edit } from "@material-ui/icons";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import AiSetupWizard from "../../components/AiSetupWizard";
import { useAiPageStyles } from "../../components/Ai/shared";
import { AiFormTextField, AiSectionPaper } from "../../components/Ai/forms";

const AiKnowledgeBases = () => {
  const classes = useAiPageStyles();
  const [bases, setBases] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", active: true });
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/ai/knowledge-bases");
      setBases(data);
    } catch (err) {
      toastError(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async () => {
    try {
      if (editingId) {
        await api.put(`/ai/knowledge-bases/${editingId}`, form);
      } else {
        await api.post("/ai/knowledge-bases", form);
      }
      toast.success("Base salva com sucesso");
      setOpen(false);
      setEditingId(null);
      setForm({ name: "", description: "", active: true });
      load();
    } catch (err) {
      toastError(err);
    }
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
            setForm({ name: "", description: "", active: true });
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
                <TableCell>Descrição</TableCell>
                <TableCell>Agentes</TableCell>
                <TableCell>Ativa</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bases.map(base => (
                <TableRow key={base.id}>
                  <TableCell>{base.name}</TableCell>
                  <TableCell>{base.description}</TableCell>
                  <TableCell>
                    {(base.linkedAgents || [])
                      .map(agent => agent.name)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell>{base.active ? "Sim" : "Não"}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      onClick={() => {
                        setEditingId(base.id);
                        setForm({
                          name: base.name,
                          description: base.description || "",
                          active: base.active
                        });
                        setOpen(true);
                      }}
                    >
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
          {editingId ? "Editar Base" : "Nova Base de Conhecimento"}
        </DialogTitle>
        <DialogContent dividers>
          <AiFormTextField
            label="Nome"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            helperText="Nome interno da base de conhecimento."
          />
          <AiFormTextField
            label="Descrição"
            multiline
            rows={3}
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            helperText="Resumo do conteúdo ou finalidade desta base."
          />
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
