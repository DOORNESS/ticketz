import React from "react";
import {
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  FormHelperText
} from "@material-ui/core";
import useBrands from "../../hooks/useBrands";

/**
 * Seletor de marca para telas administrativas.
 *
 * Some quando a empresa não tem marca cadastrada, para não poluir instalações
 * de marca única. `null` é opção válida: registro sem marca continua no
 * comportamento legado até alguém decidir a qual operação ele pertence.
 */
const BrandSelect = ({
  value,
  onChange,
  label = "Marca",
  helperText,
  fullWidth = true,
  margin = "dense"
}) => {
  const { brands } = useBrands();

  if (!brands.length) {
    return null;
  }

  return (
    <FormControl variant="outlined" margin={margin} fullWidth={fullWidth}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value ?? ""}
        onChange={e =>
          onChange(e.target.value === "" ? null : Number(e.target.value))
        }
      >
        <MenuItem value="">
          <em>Sem marca</em>
        </MenuItem>
        {brands.map(brand => (
          <MenuItem key={brand.id} value={brand.id}>
            {brand.name}
          </MenuItem>
        ))}
      </Select>
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
};

export default BrandSelect;
