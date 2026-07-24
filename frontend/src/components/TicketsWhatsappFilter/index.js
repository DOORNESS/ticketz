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
  onChange
}) => {
  const classes = useStyles();

  if (!whatsapps.length) {
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
      {whatsapps.map(whatsapp => {
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
