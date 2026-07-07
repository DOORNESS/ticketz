import React, { useState, useEffect, useMemo } from "react";

import "react-toastify/dist/ReactToastify.css";

import { ptBR } from "@material-ui/core/locale";
import { createTheme, ThemeProvider } from "@material-ui/core/styles";
import ColorModeContext from "./layout/themeContext";
import { PhoneCallProvider } from "./context/PhoneCall/PhoneCallContext";
import { SocketContext, socketManager } from "./context/Socket/SocketContext";
import useSettings from "./hooks/useSettings";
import Favicon from "react-favicon";
import { getBackendURL } from "./services/config";
import brandTokens from "./theme/brandTokens";

import Routes from "./routes";

const defaultLogoLight = brandTokens.logo.light;
const defaultLogoDark = brandTokens.logo.dark;
const defaultLogoFavicon = brandTokens.logo.favicon;

function useViewportHeight() {
  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty("--vh", `${h}px`);
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setVh);
      window.visualViewport.addEventListener("scroll", setVh);
    }
    window.addEventListener("resize", setVh);

    setVh(); // initial

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", setVh);
        window.visualViewport.removeEventListener("scroll", setVh);
      }
      window.removeEventListener("resize", setVh);
    };
  }, []);
}

const App = () => {
  const [locale, setLocale] = useState();

  const prefersDarkMode = !!window.matchMedia("(prefers-color-scheme: dark)")
    .matches;
  const preferredTheme = window.localStorage.getItem("preferredTheme");
  const [mode, setMode] = useState(
    preferredTheme ? preferredTheme : prefersDarkMode ? "dark" : "light"
  );
  const [primaryColorLight, setPrimaryColorLight] = useState(
    brandTokens.primaryLight
  );
  const [primaryColorDark, setPrimaryColorDark] = useState(
    brandTokens.primaryDark
  );
  const [appLogoLight, setAppLogoLight] = useState("");
  const [appLogoDark, setAppLogoDark] = useState("");
  const [appLogoFavicon, setAppLogoFavicon] = useState("");
  const [appName, setAppName] = useState("");
  const { getPublicSetting } = useSettings();

  const colorMode = useMemo(
    () => ({
      toggleColorMode: () => {
        setMode(prevMode => (prevMode === "light" ? "dark" : "light"));
      },
      setPrimaryColorLight: color => {
        setPrimaryColorLight(color);
      },
      setPrimaryColorDark: color => {
        setPrimaryColorDark(color);
      },
      setAppLogoLight: file => {
        setAppLogoLight(file);
      },
      setAppLogoDark: file => {
        setAppLogoDark(file);
      },
      setAppLogoFavicon: file => {
        setAppLogoFavicon(file);
      },
      setAppName: name => {
        setAppName(name);
      }
    }),
    []
  );

  const calculatedLogoDark = () => {
    if (appLogoDark === defaultLogoDark && appLogoLight !== defaultLogoLight) {
      return appLogoLight;
    }
    return appLogoDark;
  };
  const calculatedLogoLight = () => {
    if (appLogoDark !== defaultLogoDark && appLogoLight === defaultLogoLight) {
      return appLogoDark;
    }
    return appLogoLight;
  };

  const theme = useMemo(
    () =>
      createTheme(
        {
          scrollbarStyles: {
            "&::-webkit-scrollbar": {
              width: "8px",
              height: "8px"
            },
            "&::-webkit-scrollbar-thumb": {
              boxShadow: "inset 0 0 6px rgba(0, 0, 0, 0.3)",
              backgroundColor:
                mode === "light" ? primaryColorLight : primaryColorDark
            }
          },
          scrollbarStylesSoft: {
            "&::-webkit-scrollbar": {
              width: "6px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor:
                mode === "light"
                  ? brandTokens.neutral.borderLight
                  : brandTokens.neutral.borderDark,
              borderRadius: 3
            }
          },
          layout: brandTokens.layout,
          palette: {
            type: mode,
            primary: {
              main: mode === "light" ? primaryColorLight : primaryColorDark,
              contrastText: "#FFFFFF"
            },
            secondary: {
              main: mode === "light" ? "#64748B" : "#94A3B8"
            },
            text: {
              primary:
                mode === "light"
                  ? brandTokens.neutral.textPrimaryLight
                  : brandTokens.neutral.textPrimaryDark,
              secondary:
                mode === "light"
                  ? brandTokens.neutral.textSecondaryLight
                  : brandTokens.neutral.textSecondaryDark
            },
            divider:
              mode === "light"
                ? brandTokens.neutral.borderLight
                : brandTokens.neutral.borderDark,
            textPrimary:
              mode === "light" ? primaryColorLight : primaryColorDark,
            textCommon:
              mode === "light"
                ? brandTokens.neutral.textPrimaryLight
                : brandTokens.neutral.textPrimaryDark,
            borderPrimary:
              mode === "light"
                ? brandTokens.neutral.borderLight
                : brandTokens.neutral.borderDark,
            background: {
              default:
                mode === "light"
                  ? brandTokens.neutral.backgroundLight
                  : brandTokens.neutral.backgroundDark,
              paper:
                mode === "light"
                  ? brandTokens.neutral.paperLight
                  : brandTokens.neutral.paperDark
            },
            backgroundContrast: {
              default: mode === "light" ? "#E2E8F0" : "#475569",
              paper: mode === "light" ? "#F1F5F9" : "#334155",
              border:
                mode === "light"
                  ? brandTokens.neutral.borderLight
                  : brandTokens.neutral.borderDark
            },
            dark: { main: mode === "light" ? "#1E293B" : "#CBD5E1" },
            light: { main: mode === "light" ? "#F1F5F9" : "#334155" },
            chatBubbleFromMe: {
              main: mode === "light" ? "#FEE2E2" : "#7F1D1D"
            },
            chatBubbleReceived: {
              main: mode === "light" ? "#FFFFFF" : "#1E293B"
            },
            chatBackground: {
              main: mode === "light" ? "#F1F5F9" : "#0B1120"
            },
            tabHeaderBackground: mode === "light" ? "#F1F5F9" : "#334155",
            optionsBackground: mode === "light" ? "#F8FAFC" : "#1E293B",
            options: mode === "light" ? "#F8FAFC" : "#475569",
            fontecor: mode === "light" ? primaryColorLight : primaryColorDark,
            fancyBackground:
              mode === "light"
                ? brandTokens.neutral.backgroundLight
                : brandTokens.neutral.backgroundDark,
            bordabox:
              mode === "light"
                ? brandTokens.neutral.borderLight
                : brandTokens.neutral.borderDark,
            newmessagebox: mode === "light" ? "#E2E8F0" : "#334155",
            inputdigita: mode === "light" ? "#FFFFFF" : "#475569",
            contactdrawer: mode === "light" ? "#FFFFFF" : "#1E293B",
            announcements: mode === "light" ? "#F1F5F9" : "#334155",
            login: mode === "light" ? "#FFFFFF" : "#0F172A",
            announcementspopover: mode === "light" ? "#FFFFFF" : "#334155",
            chatlist: { main: mode === "light" ? "#E2E8F0" : "#475569" },
            boxlist: mode === "light" ? "#F1F5F9" : "#475569",
            boxchatlist: mode === "light" ? "#F1F5F9" : "#334155",
            total: mode === "light" ? "#FFFFFF" : "#0F172A",
            messageIcons: mode === "light" ? "#64748B" : "#CBD5E1",
            inputBackground: mode === "light" ? "#FFFFFF" : "#1E293B",
            barraSuperior: mode === "light" ? primaryColorLight : "#334155",
            boxticket: mode === "light" ? "#F1F5F9" : "#475569",
            campaigntab: mode === "light" ? "#F1F5F9" : "#475569",
            ticketzproad: { main: "#39ACE7", contrastText: "white" }
          },
          typography: {
            fontFamily: brandTokens.typography.fontFamily,
            fontSize: 14,
            h1: { fontWeight: 700, fontSize: "2rem", letterSpacing: "-0.02em" },
            h2: {
              fontWeight: 700,
              fontSize: "1.5rem",
              letterSpacing: "-0.02em"
            },
            h3: {
              fontWeight: 600,
              fontSize: "1.25rem",
              letterSpacing: "-0.01em"
            },
            h4: { fontWeight: 600, fontSize: "1.125rem" },
            h5: { fontWeight: 600, fontSize: "1rem" },
            h6: { fontWeight: 600, fontSize: "0.875rem" },
            subtitle1: { fontWeight: 500, fontSize: "0.875rem" },
            subtitle2: { fontWeight: 500, fontSize: "0.8125rem" },
            body1: { fontSize: "0.875rem", lineHeight: 1.5 },
            body2: { fontSize: "0.8125rem", lineHeight: 1.5 },
            caption: { fontSize: "0.75rem", lineHeight: 1.4 },
            button: {
              textTransform: "none",
              fontWeight: 500,
              fontSize: "0.8125rem"
            }
          },
          shape: {
            borderRadius: brandTokens.shape.borderRadius
          },
          overrides: {
            MuiCssBaseline: {
              "@global": {
                body: {
                  fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"'
                }
              }
            },
            MuiPaper: {
              rounded: {
                borderRadius: brandTokens.shape.borderRadius
              },
              elevation1: {
                boxShadow: brandTokens.elevation.card
              },
              elevation2: {
                boxShadow: brandTokens.elevation.card
              },
              elevation4: {
                boxShadow: brandTokens.elevation.cardHover
              },
              elevation6: {
                boxShadow: brandTokens.elevation.cardHover
              }
            },
            MuiCard: {
              root: {
                boxShadow: brandTokens.elevation.card,
                border: `1px solid ${
                  mode === "light"
                    ? brandTokens.neutral.borderLight
                    : brandTokens.neutral.borderDark
                }`
              }
            },
            MuiButton: {
              root: {
                borderRadius: brandTokens.shape.borderRadiusSm,
                padding: "6px 14px",
                fontSize: "0.8125rem"
              },
              contained: {
                boxShadow: "none",
                "&:hover": {
                  boxShadow: brandTokens.elevation.card
                }
              },
              outlined: {
                borderColor:
                  mode === "light"
                    ? brandTokens.neutral.borderLight
                    : brandTokens.neutral.borderDark
              }
            },
            MuiOutlinedInput: {
              root: {
                borderRadius: brandTokens.shape.borderRadiusSm,
                fontSize: "0.875rem",
                "& fieldset": {
                  borderColor:
                    mode === "light"
                      ? brandTokens.neutral.borderLight
                      : brandTokens.neutral.borderDark
                },
                "&:hover fieldset": {
                  borderColor: mode === "light" ? "#CBD5E1" : "#475569"
                }
              },
              input: {
                padding: "10px 12px"
              }
            },
            MuiInputLabel: {
              root: {
                fontSize: "0.875rem"
              }
            },
            MuiTab: {
              root: {
                minHeight: 40,
                fontSize: "0.8125rem",
                fontWeight: 500,
                textTransform: "none"
              }
            },
            MuiTabs: {
              root: {
                minHeight: 40
              }
            },
            MuiListItem: {
              root: {
                borderRadius: brandTokens.shape.borderRadiusSm
              },
              dense: {
                paddingTop: 4,
                paddingBottom: 4
              }
            },
            MuiListItemIcon: {
              root: {
                minWidth: 32
              }
            },
            MuiIconButton: {
              root: {
                padding: 6
              }
            },
            MuiSelect: {
              root: {
                fontSize: "0.875rem"
              }
            },
            MuiTableCell: {
              root: {
                fontSize: "0.8125rem",
                borderBottom: `1px solid ${
                  mode === "light"
                    ? brandTokens.neutral.borderLight
                    : brandTokens.neutral.borderDark
                }`
              },
              head: {
                fontWeight: 600,
                fontSize: "0.75rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color:
                  mode === "light"
                    ? brandTokens.neutral.textSecondaryLight
                    : brandTokens.neutral.textSecondaryDark
              }
            },
            MuiAppBar: {
              colorPrimary: {
                backgroundColor:
                  mode === "light"
                    ? brandTokens.neutral.paperLight
                    : brandTokens.neutral.paperDark,
                color:
                  mode === "light"
                    ? brandTokens.neutral.textPrimaryLight
                    : brandTokens.neutral.textPrimaryDark
              }
            },
            MuiDrawer: {
              paper: {
                backgroundColor:
                  mode === "light"
                    ? brandTokens.neutral.paperLight
                    : brandTokens.neutral.paperDark
              }
            },
            MuiMenu: {
              paper: {
                boxShadow: brandTokens.elevation.popover,
                border: `1px solid ${
                  mode === "light"
                    ? brandTokens.neutral.borderLight
                    : brandTokens.neutral.borderDark
                }`
              }
            },
            MuiBadge: {
              badge: {
                fontSize: "0.625rem",
                height: 16,
                minWidth: 16
              }
            }
          },
          mode,
          appLogoLight,
          appLogoDark,
          appLogoFavicon,
          appName,
          calculatedLogoLight,
          calculatedLogoDark,
          calculatedLogo: () => {
            if (mode === "light") {
              return calculatedLogoLight();
            }
            return calculatedLogoDark();
          }
        },
        locale
      ),
    [
      appLogoLight,
      appLogoDark,
      appLogoFavicon,
      appName,
      locale,
      mode,
      primaryColorDark,
      primaryColorLight
    ]
  );

  useEffect(() => {
    const i18nlocale = localStorage.getItem("language");
    if (!i18nlocale) {
      return;
    }

    const browserLocale =
      i18nlocale.substring(0, 2) + i18nlocale.substring(3, 5);

    if (browserLocale === "ptBR") {
      setLocale(ptBR);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("preferredTheme", mode);
  }, [mode]);

  useEffect(() => {
    document.title = brandTokens.appTitle;
  }, []);

  useEffect(() => {
    getPublicSetting("primaryColorLight")
      .then(color => {
        setPrimaryColorLight(color || brandTokens.primaryLight);
      })
      .catch(() => {});
    getPublicSetting("primaryColorDark")
      .then(color => {
        setPrimaryColorDark(color || brandTokens.primaryDark);
      })
      .catch(() => {});
    getPublicSetting("appLogoLight")
      .then(
        file => {
          setAppLogoLight(
            file ? `${getBackendURL()}/public/${file}` : defaultLogoLight
          );
        },
        _ => {}
      )
      .catch(() => {});
    getPublicSetting("appLogoDark")
      .then(file => {
        setAppLogoDark(
          file ? `${getBackendURL()}/public/${file}` : defaultLogoDark
        );
      })
      .catch(() => {});
    getPublicSetting("appLogoFavicon")
      .then(file => {
        setAppLogoFavicon(file ? `${getBackendURL()}/public/${file}` : null);
      })
      .catch(() => {});
    getPublicSetting("appName")
      .then(name => {
        setAppName(name || brandTokens.appTitle);
      })
      .catch(() => {
        setAppName(brandTokens.appTitle);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useViewportHeight();

  return (
    <>
      <Favicon
        url={appLogoFavicon ? theme.appLogoFavicon : defaultLogoFavicon}
      />
      <ColorModeContext.Provider value={{ colorMode }}>
        <PhoneCallProvider>
          <ThemeProvider theme={theme}>
            <SocketContext.Provider value={socketManager}>
              <Routes />
            </SocketContext.Provider>
          </ThemeProvider>
        </PhoneCallProvider>
      </ColorModeContext.Provider>
    </>
  );
};

export default App;
