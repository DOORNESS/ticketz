import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import FormControl from "@material-ui/core/FormControl";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import Typography from "@material-ui/core/Typography";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  label: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    whiteSpace: "nowrap"
  },
  select: {
    fontSize: "0.8125rem",
    minWidth: 190
  },
  option: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0
  }
}));

/**
 * Seletor de MARCA — contexto operacional, não filtro acumulativo.
 *
 * É um `Select` de escolha única, e não uma fileira de chips, por dois
 * motivos práticos: escolher duas marcas ao mesmo tempo não corresponde a
 * nenhuma operação real (quem atende, atende uma linha por vez), e uma
 * fileira de botões deixa de funcionar já na quinta marca — com vinte vira
 * uma parede de ruído. O `Select` é indiferente à quantidade.
 *
 * `value === null` significa "Todas" — e "todas" quer dizer as marcas que
 * ESTE usuário pode ver, porque a lista já chega filtrada pelo backend.
 *
 * Some sozinho quando há uma marca ou menos: seletor de uma opção só é ruído.
 */
const BrandScopeSelect = ({
  brands = [],
  value = null,
  onChange,
  label = "Marca",
  allLabel = "Todas as marcas",
  hideWhenSingle = true,
  size = "small"
}) => {
  const classes = useStyles();

  if (hideWhenSingle && brands.length < 2) {
    return null;
  }

  const handleChange = event => {
    const raw = event.target.value;
    onChange(raw === "all" ? null : Number(raw));
  };

  return (
    <div className={classes.root}>
      <Typography component="span" className={classes.label}>
        {label}:
      </Typography>
      <FormControl size={size}>
        <Select
          value={value === null || value === undefined ? "all" : String(value)}
          onChange={handleChange}
          className={classes.select}
          disableUnderline
          data-testid="brand-scope-select"
        >
          <MenuItem value="all">{allLabel}</MenuItem>
          {brands.map(brand => (
            <MenuItem key={brand.id} value={String(brand.id)}>
              <span className={classes.option}>
                <span
                  className={classes.dot}
                  style={{ backgroundColor: brand.primaryColor || "#9e9e9e" }}
                />
                {brand.name || brand.shortLabel}
              </span>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </div>
  );
};

export default BrandScopeSelect;
