import { makeStyles } from "@material-ui/core/styles";

export const useAiPageStyles = makeStyles(theme => ({
  pageContent: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2)
  },
  sectionPaper: {
    padding: theme.spacing(2.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1.5)
  },
  sectionSubtitle: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2)
  },
  formGrid: {
    display: "grid",
    gap: theme.spacing(2),
    [theme.breakpoints.up("sm")]: {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
    }
  },
  formGridFull: {
    gridColumn: "1 / -1"
  },
  fieldSpacing: {
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1)
  },
  switchRow: {
    display: "flex",
    alignItems: "center",
    minHeight: 48,
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5)
  },
  metricsGrid: {
    display: "grid",
    gap: theme.spacing(2),
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))"
  },
  metricCard: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    minHeight: 96
  },
  metricLabel: {
    color: theme.palette.text.secondary,
    fontSize: "0.75rem",
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: theme.spacing(0.75)
  },
  metricValue: {
    fontSize: "1.5rem",
    fontWeight: 700,
    lineHeight: 1.2
  },
  metricHint: {
    marginTop: theme.spacing(0.75),
    color: theme.palette.text.secondary,
    fontSize: "0.8125rem"
  },
  tablePaper: {
    overflowX: "auto"
  },
  actionsRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1)
  },
  resultCard: {
    padding: theme.spacing(2),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default
  },
  chunkItem: {
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(1)
  }
}));
