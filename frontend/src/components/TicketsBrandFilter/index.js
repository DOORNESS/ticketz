import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import BrandScopeSelect from "../BrandScopeSelect";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper
  }
}));

/**
 * Marca do atendimento — o contexto operacional da tela de tickets.
 *
 * Era rotulado "Empresa" e desenhado como chips de múltipla escolha. Duas
 * coisas erradas ali: "Empresa" é a Company (o tenant, que continua sendo uma
 * só), e marcar duas marcas ao mesmo tempo não descreve nenhum atendimento
 * real. Virou seletor de escolha única — que também é o que sobrevive quando
 * existirem vinte marcas em vez de duas.
 *
 * Mantém a lista de ids no contrato com o pai (`[]` = todas, `[id]` = uma)
 * porque é o formato que a consulta já usa ponta a ponta.
 */
const TicketsBrandFilter = ({
  brands = [],
  selectedBrandIds = [],
  onChange
}) => {
  const classes = useStyles();

  if (brands.length < 2) {
    return null;
  }

  const selected = selectedBrandIds.length ? Number(selectedBrandIds[0]) : null;

  return (
    <div className={classes.root}>
      <BrandScopeSelect
        brands={brands}
        value={selected}
        onChange={brandId => onChange(brandId === null ? [] : [brandId])}
        label="Marca"
        allLabel="Todas as marcas"
      />
    </div>
  );
};

export default TicketsBrandFilter;
