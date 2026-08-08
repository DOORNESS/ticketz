import React from "react";
import { makeStyles } from "@material-ui/core/styles";

/**
 * Identificação visual da marca.
 *
 * Não depende só de cor: sempre mostra o rótulo em texto, e o logo quando
 * existir. Assim a operação é reconhecível em monitor sem calibração, em
 * modo escuro e por quem tem daltonismo.
 */
const useStyles = makeStyles(theme => ({
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    maxWidth: "100%",
    padding: "1px 6px",
    borderRadius: 4,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
    lineHeight: 1.4,
    verticalAlign: "middle"
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0
  },
  logo: {
    width: 12,
    height: 12,
    objectFit: "contain",
    flexShrink: 0
  },
  label: {
    fontSize: "0.65rem",
    fontWeight: 700,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  large: {
    padding: "2px 8px"
  },
  labelLarge: {
    fontSize: "0.75rem"
  }
}));

const BrandBadge = ({ brand, size = "small" }) => {
  const classes = useStyles();

  if (!brand) {
    return null;
  }

  const label = brand.shortLabel || brand.name || "";
  if (!label) {
    return null;
  }

  const isLarge = size === "large";

  return (
    <span
      className={`${classes.root} ${isLarge ? classes.large : ""}`}
      title={brand.name || label}
    >
      {brand.logoUrl ? (
        <img className={classes.logo} src={brand.logoUrl} alt="" />
      ) : (
        <span
          className={classes.dot}
          style={{ backgroundColor: brand.primaryColor || "#9e9e9e" }}
        />
      )}
      <span className={`${classes.label} ${isLarge ? classes.labelLarge : ""}`}>
        {label}
      </span>
    </span>
  );
};

export default BrandBadge;
