import React from "react";
import {
  Checkbox,
  FormControlLabel,
  Switch,
  Typography
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
  root: {
    marginTop: theme.spacing(1)
  },
  title: {
    fontWeight: 700,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    color: theme.palette.text.secondary
  },
  hint: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5)
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing(1),
    paddingLeft: theme.spacing(0.5)
  },
  attend: {
    fontSize: "0.75rem"
  }
}));

/**
 * Marcas que o funcionário pode acessar.
 *
 * O switch separa supervisionar de atender: desligado, ele acompanha a
 * operação mas não assume ticket nem responde. A regra vale no backend — aqui
 * é só a configuração.
 */
const UserBrandsSelect = ({ brands = [], value = [], onChange }) => {
  const classes = useStyles();

  if (!brands.length) {
    return null;
  }

  const findLink = brandId => value.find(item => item.brandId === brandId);

  const toggleBrand = brandId => {
    if (findLink(brandId)) {
      onChange(value.filter(item => item.brandId !== brandId));
      return;
    }
    onChange([...value, { brandId, canAttend: true }]);
  };

  const toggleAttend = brandId =>
    onChange(
      value.map(item =>
        item.brandId === brandId
          ? { ...item, canAttend: !item.canAttend }
          : item
      )
    );

  return (
    <div className={classes.root}>
      <Typography className={classes.title}>
        Empresas/Marcas que pode atender
      </Typography>
      <Typography className={classes.hint}>
        Sem nenhuma marca marcada, o funcionário segue com o acesso atual. Ao
        marcar a primeira, ele passa a enxergar somente as marcas escolhidas.
      </Typography>

      {brands.map(brand => {
        const link = findLink(brand.id);
        return (
          <div className={classes.row} key={brand.id}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={Boolean(link)}
                  onChange={() => toggleBrand(brand.id)}
                  color="primary"
                />
              }
              label={brand.name}
            />
            {link && (
              <FormControlLabel
                className={classes.attend}
                control={
                  <Switch
                    size="small"
                    checked={link.canAttend !== false}
                    onChange={() => toggleAttend(brand.id)}
                    color="primary"
                  />
                }
                label={
                  link.canAttend !== false ? "Pode atender" : "Só supervisiona"
                }
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default UserBrandsSelect;
