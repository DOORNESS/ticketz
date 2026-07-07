import React from "react";
import {
  Paper,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  FormHelperText
} from "@material-ui/core";
import { useAiPageStyles } from "./shared";

export const AiSectionPaper = ({ title, subtitle, children, className }) => {
  const classes = useAiPageStyles();

  return (
    <Paper
      className={`${classes.sectionPaper} ${className || ""}`}
      elevation={0}
    >
      {title && (
        <Typography variant="h6" className={classes.sectionTitle}>
          {title}
        </Typography>
      )}
      {subtitle && (
        <Typography variant="body2" className={classes.sectionSubtitle}>
          {subtitle}
        </Typography>
      )}
      {children}
    </Paper>
  );
};

export const AiMetricCard = ({ label, value, hint }) => {
  const classes = useAiPageStyles();

  return (
    <div className={classes.metricCard}>
      <Typography className={classes.metricLabel}>{label}</Typography>
      <Typography className={classes.metricValue}>{value}</Typography>
      {hint && <Typography className={classes.metricHint}>{hint}</Typography>}
    </div>
  );
};

export const AiFormSelect = ({
  label,
  labelId,
  value,
  onChange,
  options = [],
  emptyLabel = "Selecione",
  helperText,
  disabled = false,
  allowEmpty = true,
  fullWidth = true
}) => {
  const classes = useAiPageStyles();
  const resolvedLabelId =
    labelId || `ai-select-${label.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <FormControl
      fullWidth={fullWidth}
      variant="outlined"
      margin="normal"
      className={classes.fieldSpacing}
      disabled={disabled}
    >
      <InputLabel id={resolvedLabelId}>{label}</InputLabel>
      <Select
        labelId={resolvedLabelId}
        label={label}
        value={value}
        onChange={onChange}
      >
        {allowEmpty && (
          <MenuItem value="">
            <em>{emptyLabel}</em>
          </MenuItem>
        )}
        {options.map(option => (
          <MenuItem key={option.value} value={String(option.value)}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {helperText && <FormHelperText>{helperText}</FormHelperText>}
    </FormControl>
  );
};

export const AiFormTextField = ({
  helperText,
  className,
  fullWidth = true,
  margin = "normal",
  variant = "outlined",
  ...props
}) => {
  const classes = useAiPageStyles();

  return (
    <TextField
      fullWidth={fullWidth}
      margin={margin}
      variant={variant}
      className={`${classes.fieldSpacing} ${className || ""}`}
      helperText={helperText}
      {...props}
    />
  );
};

export const AiFormSection = ({ title, subtitle, children }) => (
  <AiSectionPaper title={title} subtitle={subtitle}>
    {children}
  </AiSectionPaper>
);
