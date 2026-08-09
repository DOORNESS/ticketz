import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Chip from "@material-ui/core/Chip";
import Typography from "@material-ui/core/Typography";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing(0.75),
    padding: theme.spacing(1, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginRight: theme.spacing(0.5),
    whiteSpace: "nowrap"
  },
  chip: {
    height: 28,
    fontSize: "0.75rem",
    fontWeight: 500
  },
  chipActive: {
    fontWeight: 700
  }
}));

const TicketsWhatsappFilter = ({
  whatsapps = [],
  selectedWhatsappIds = [],
  // Estava sendo passada pelo pai e nunca declarada aqui — a marca chegava e
  // era descartada em silêncio. Foi exatamente por isso que a tela permitia
  // "Marca: Nível" com "WhatsApp: WebG3".
  selectedBrandIds = [],
  onChange
}) => {
  const classes = useStyles();

  /**
   * A marca manda: só entram as conexões DELA.
   *
   * Antes esta lista mostrava todas as conexões da empresa mesmo com uma marca
   * escolhida, e dava para ficar em "Marca: Nível + WhatsApp: WebG3" — um
   * estado que não corresponde a atendimento nenhum. A marca é o contexto; a
   * conexão é um recorte dentro dele.
   */
  const brandScoped = React.useMemo(() => {
    if (!selectedBrandIds.length) {
      return whatsapps;
    }
    return whatsapps.filter(item =>
      selectedBrandIds.includes(Number(item.brandId))
    );
  }, [whatsapps, selectedBrandIds]);

  /**
   * Trocar de marca não pode deixar para trás uma conexão da marca anterior:
   * ela sumiria da lista e continuaria filtrando por baixo, invisível.
   */
  React.useEffect(() => {
    if (!selectedWhatsappIds.length) {
      return;
    }
    const allowed = brandScoped.map(item => Number(item.id));
    const pruned = selectedWhatsappIds.filter(id => allowed.includes(id));
    if (pruned.length !== selectedWhatsappIds.length) {
      onChange(pruned);
    }
  }, [brandScoped, selectedWhatsappIds, onChange]);

  if (!brandScoped.length) {
    return null;
  }

  const toggleWhatsapp = id => {
    const numericId = Number(id);
    const isSelected = selectedWhatsappIds.includes(numericId);

    if (isSelected) {
      onChange(selectedWhatsappIds.filter(item => item !== numericId));
      return;
    }

    onChange([...selectedWhatsappIds, numericId]);
  };

  const allSelected = selectedWhatsappIds.length === 0;

  return (
    <div className={classes.root}>
      <Typography component="span" className={classes.label}>
        {i18n.t("ticketsWhatsappFilter.label")}
      </Typography>
      <Chip
        size="small"
        label={i18n.t("ticketsWhatsappFilter.all")}
        clickable
        color={allSelected ? "primary" : "default"}
        variant={allSelected ? "default" : "outlined"}
        className={`${classes.chip} ${allSelected ? classes.chipActive : ""}`}
        onClick={() => onChange([])}
      />
      {brandScoped.map(whatsapp => {
        const isActive = selectedWhatsappIds.includes(whatsapp.id);
        return (
          <Chip
            key={whatsapp.id}
            size="small"
            label={whatsapp.name}
            clickable
            color={isActive ? "primary" : "default"}
            variant={isActive ? "default" : "outlined"}
            className={`${classes.chip} ${isActive ? classes.chipActive : ""}`}
            onClick={() => toggleWhatsapp(whatsapp.id)}
          />
        );
      })}
    </div>
  );
};

export default TicketsWhatsappFilter;
