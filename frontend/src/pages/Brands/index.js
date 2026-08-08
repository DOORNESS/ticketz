import React, { useCallback, useEffect, useState } from "react";

import {
  Button,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import EditIcon from "@material-ui/icons/Edit";
import AddIcon from "@material-ui/icons/Add";
import BlockIcon from "@material-ui/icons/Block";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import BrandModal from "../../components/BrandModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import BrandBadge from "../../components/BrandBadge";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles
  },
  inactive: {
    opacity: 0.5
  },
  hint: {
    padding: theme.spacing(1, 1.5),
    color: theme.palette.text.secondary,
    fontSize: "0.8rem"
  }
}));

/**
 * Administração → Marcas.
 *
 * É por aqui que uma operação nova entra no ar. Criar a Brand 3 é preencher
 * este formulário — não existe passo de código nem deploy.
 */
const Brands = () => {
  const classes = useStyles();
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deactivating, setDeactivating] = useState(null);

  const loadBrands = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/brands/admin");
      setBrands(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  const handleOpenNew = () => {
    setSelectedBrand(null);
    setModalOpen(true);
  };

  const handleEdit = brand => {
    setSelectedBrand(brand);
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
    setSelectedBrand(null);
  };

  const handleDeactivate = async () => {
    if (!deactivating) return;
    try {
      await api.delete(`/brands/${deactivating.id}`);
      toast.success("Marca desativada.");
      loadBrands();
    } catch (err) {
      toastError(err);
    } finally {
      setDeactivating(null);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title="Desativar marca"
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={handleDeactivate}
      >
        A marca deixa de aparecer nos filtros e no atendimento. Os tickets
        antigos continuam vinculados a ela — nada de histórico é perdido.
      </ConfirmationModal>

      <BrandModal
        open={modalOpen}
        onClose={handleClose}
        brand={selectedBrand}
        onSaved={loadBrands}
      />

      <MainHeader>
        <Title>Marcas</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleOpenNew}
          >
            Nova marca
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined">
        <Typography className={classes.hint}>
          Cada marca é uma operação dentro desta empresa. Depois de criar,
          vincule a conexão de WhatsApp, a fila, o agente de IA e o domínio de
          conhecimento — é a conexão que define a marca de cada atendimento.
        </Typography>

        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Marca</TableCell>
              <TableCell>Slug</TableCell>
              <TableCell>Assistente</TableCell>
              <TableCell align="center">Contatos</TableCell>
              <TableCell align="center">Vocabulário</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="right">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {brands.map(brand => (
              <TableRow
                key={brand.id}
                className={brand.active ? "" : classes.inactive}
              >
                <TableCell>
                  <BrandBadge brand={brand} size="large" />
                </TableCell>
                <TableCell>
                  <code>{brand.slug}</code>
                </TableCell>
                <TableCell>{brand.identityName || "—"}</TableCell>
                <TableCell align="center">
                  {(brand.supportContacts || []).length}
                </TableCell>
                <TableCell align="center">
                  {(brand.vocabulary || []).length}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={brand.active ? "Ativa" : "Inativa"}
                    color={brand.active ? "primary" : "default"}
                    variant={brand.active ? "default" : "outlined"}
                  />
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => handleEdit(brand)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  {brand.active && (
                    <IconButton
                      size="small"
                      onClick={() => setDeactivating(brand)}
                    >
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!loading && !brands.length && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Nenhuma marca cadastrada.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </MainContainer>
  );
};

export default Brands;
