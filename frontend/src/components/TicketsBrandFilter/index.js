import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Chip from "@material-ui/core/Chip";
import Typography from "@material-ui/core/Typography";

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
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    marginLeft: 6,
    marginRight: -2
  }
}));

/**
 * Seletor global de marca.
 *
 * "Todas" significa todas as marcas **que o usuário pode ver** — a lista já
 * vem filtrada pelo backend. Some quando há uma marca ou menos: um seletor
 * com uma opção só é ruído.
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

  const toggleBrand = id => {
    const numericId = Number(id);
    if (selectedBrandIds.includes(numericId)) {
      onChange(selectedBrandIds.filter(item => item !== numericId));
      return;
    }
    onChange([...selectedBrandIds, numericId]);
  };

  const allSelected = selectedBrandIds.length === 0;

  return (
    <div className={classes.root}>
      <Typography component="span" className={classes.label}>
        Empresa:
      </Typography>
      <Chip
        size="small"
        label="Todas"
        clickable
        color={allSelected ? "primary" : "default"}
        variant={allSelected ? "default" : "outlined"}
        className={`${classes.chip} ${allSelected ? classes.chipActive : ""}`}
        onClick={() => onChange([])}
      />
      {brands.map(brand => {
        const isActive = selectedBrandIds.includes(brand.id);
        return (
          <Chip
            key={brand.id}
            size="small"
            label={brand.shortLabel || brand.name}
            clickable
            color={isActive ? "primary" : "default"}
            variant={isActive ? "default" : "outlined"}
            className={`${classes.chip} ${isActive ? classes.chipActive : ""}`}
            avatar={
              <span
                className={classes.dot}
                style={{ backgroundColor: brand.primaryColor || "#9e9e9e" }}
              />
            }
            onClick={() => toggleBrand(brand.id)}
          />
        );
      })}
    </div>
  );
};

export default TicketsBrandFilter;
