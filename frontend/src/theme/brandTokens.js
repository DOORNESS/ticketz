/**
 * Tokens de identidade visual — ponto único para logo, paleta e layout.
 * Whitelabel da API sobrescreve primary em App.js.
 */
export const brandTokens = {
  appTitle: "Suporte Fortmax",
  primaryLight: "#D32F2F",
  primaryDark: "#EF5350",
  logo: {
    light: "/vector/fortmax-logo.png",
    dark: "/vector/fortmax-logo.png",
    favicon: "/vector/fortmax-logo.png"
  },
  layout: {
    appBarHeight: 40,
    drawerWidth: 228,
    drawerWidthCollapsed: 52
  },
  neutral: {
    backgroundLight: "#F8FAFC",
    backgroundDark: "#0B1120",
    paperLight: "#FFFFFF",
    paperDark: "#151D2E",
    borderLight: "#E2E8F0",
    borderDark: "#2A3548",
    textSecondaryLight: "#64748B",
    textSecondaryDark: "#94A3B8",
    textPrimaryLight: "#0F172A",
    textPrimaryDark: "#F1F5F9"
  },
  shape: {
    borderRadius: 8,
    borderRadiusSm: 6,
    borderRadiusLg: 12
  },
  elevation: {
    card: "0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.08)",
    cardHover:
      "0 2px 4px rgba(15, 23, 42, 0.06), 0 4px 12px rgba(15, 23, 42, 0.08)",
    drawer: "1px 0 0 rgba(15, 23, 42, 0.06)",
    popover:
      "0 4px 16px rgba(15, 23, 42, 0.12), 0 2px 4px rgba(15, 23, 42, 0.06)",
    appBar: "0 1px 0 rgba(15, 23, 42, 0.06)"
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif'
  }
};

export default brandTokens;
