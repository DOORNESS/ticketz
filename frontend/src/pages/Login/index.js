import React, { useContext, useEffect, useState, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";

import Button from "@material-ui/core/Button";
import CssBaseline from "@material-ui/core/CssBaseline";
import TextField from "@material-ui/core/TextField";
import Link from "@material-ui/core/Link";
import Grid from "@material-ui/core/Grid";
import MenuItem from "@material-ui/core/MenuItem";
import Popover from "@material-ui/core/Popover";
import Fade from "@material-ui/core/Fade";
import Paper from "@material-ui/core/Paper";
import MenuList from "@material-ui/core/MenuList";
import IconButton from "@material-ui/core/IconButton";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import Brightness4Icon from "@material-ui/icons/Brightness4";
import Brightness7Icon from "@material-ui/icons/Brightness7";
import LanguageIcon from "@material-ui/icons/Translate";
import Typography from "@material-ui/core/Typography";

import { i18n } from "../../translate/i18n";
import { messages } from "../../translate/languages";

import { AuthContext } from "../../context/Auth/AuthContext";
import useSettings from "../../hooks/useSettings";
import { getBackendURL } from "../../services/config";
import ColorModeContext from "../../layout/themeContext";
import { loadJSON } from "../../helpers/loadJSON";
import brandTokens from "../../theme/brandTokens";
import TurnstileWidget from "../../components/TurnstileWidget";
import { resolveTurnstileSiteKey } from "../../helpers/turnstileConfig";
import { resolveErrorMessage } from "../../errors/toastError";

const gitinfo = loadJSON("/gitinfo.json");

const parseLoginLinks = value => {
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(value);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter(
      link => typeof link?.title === "string" && typeof link?.url === "string"
    );
  } catch (error) {
    return [];
  }
};

const isVideoFile = (filename = "") => /\.(mp4|webm|ogg)$/i.test(filename);

const getPublicAssetUrl = filename => {
  if (!filename) {
    return "";
  }

  return `${getBackendURL()}/public/${filename}`;
};

const useStyles = makeStyles(theme => ({
  root: {
    position: "fixed",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    backgroundColor: theme.palette.background.default
  },
  backgroundLayer: {
    position: "absolute",
    inset: 0,
    background:
      theme.mode === "light"
        ? `radial-gradient(ellipse at 20% 0%, rgba(211, 47, 47, 0.06) 0%, transparent 55%),
           radial-gradient(ellipse at 80% 100%, rgba(211, 47, 47, 0.04) 0%, transparent 50%),
           ${theme.palette.background.default}`
        : `radial-gradient(ellipse at 20% 0%, rgba(239, 83, 80, 0.08) 0%, transparent 55%),
           radial-gradient(ellipse at 80% 100%, rgba(239, 83, 80, 0.05) 0%, transparent 50%),
           ${theme.palette.background.default}`,
    backgroundColor: theme.palette.background.default
  },
  backgroundLayerImage: {
    position: "absolute",
    inset: 0,
    backgroundSize: "cover",
    backgroundPosition: "center",
    "&::after": {
      content: '""',
      position: "absolute",
      inset: 0,
      background:
        theme.mode === "light"
          ? "rgba(248, 250, 252, 0.82)"
          : "rgba(11, 17, 32, 0.78)"
    }
  },
  backgroundVideo: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "cover",
    opacity: theme.mode === "light" ? 0.25 : 0.2
  },
  content: {
    position: "relative",
    zIndex: 1,
    flex: 1,
    overflowY: "auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(3),
    [theme.breakpoints.down("xs")]: {
      padding: theme.spacing(2, 1.5),
      alignItems: "flex-start",
      paddingTop: theme.spacing(8)
    }
  },
  topBar: {
    position: "absolute",
    top: theme.spacing(2),
    right: theme.spacing(2),
    zIndex: 2,
    display: "flex",
    gap: theme.spacing(0.5),
    [theme.breakpoints.down("xs")]: {
      top: theme.spacing(1),
      right: theme.spacing(1)
    }
  },
  topBarButton: {
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.borderPrimary}`,
    padding: 6,
    "&:hover": {
      backgroundColor: theme.palette.action.hover
    }
  },
  langMenu: {
    zIndex: 3
  },
  langMenuPaper: {
    minWidth: 160,
    borderRadius: brandTokens.shape.borderRadius,
    overflow: "hidden",
    border: `1px solid ${theme.palette.borderPrimary}`,
    boxShadow: brandTokens.elevation.popover
  },
  layout: {
    width: "100%",
    maxWidth: 920,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(2)
  },
  loginBox: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    overflow: "hidden",
    borderRadius: brandTokens.shape.borderRadiusLg,
    backgroundColor: theme.palette.background.paper,
    boxShadow:
      theme.mode === "light" ? brandTokens.elevation.cardHover : "none",
    border: `1px solid ${theme.palette.borderPrimary}`,
    [theme.breakpoints.down("xs")]: {
      maxWidth: "100%",
      borderRadius: brandTokens.shape.borderRadius
    }
  },
  loginBoxWithMedia: {
    maxWidth: 820
  },
  mediaPane: {
    position: "relative",
    flex: "0 0 340px",
    alignSelf: "stretch",
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.palette.background.default,
    borderRight: `1px solid ${theme.palette.borderPrimary}`,
    [theme.breakpoints.down("sm")]: {
      display: "none"
    }
  },
  sidePanelImage: {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover"
  },
  formColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0
  },
  paper: {
    width: "100%",
    backgroundColor: "transparent",
    color: theme.palette.text.primary,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: theme.spacing(4, 3.5, 3),
    [theme.breakpoints.down("xs")]: {
      padding: theme.spacing(3, 2, 2.5)
    }
  },
  logoSection: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: theme.spacing(2.5),
    width: "100%"
  },
  logoImg: {
    width: "100%",
    maxWidth: 220,
    maxHeight: 56,
    objectFit: "contain",
    marginBottom: theme.spacing(0.5)
  },
  brandTagline: {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: theme.palette.text.secondary,
    letterSpacing: "0.02em"
  },
  form: {
    width: "100%"
  },
  input: {
    marginBottom: theme.spacing(1.5),
    "& .MuiOutlinedInput-root": {
      backgroundColor:
        theme.mode === "light"
          ? brandTokens.neutral.backgroundLight
          : brandTokens.neutral.paperDark
    }
  },
  submit: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    padding: "10px 0",
    fontWeight: 600,
    fontSize: "0.875rem",
    boxShadow: "none",
    "&:hover": {
      boxShadow: brandTokens.elevation.card
    }
  },
  signupLink: {
    fontSize: "0.8125rem",
    color: theme.palette.text.secondary,
    "& a": {
      color: theme.palette.primary.main,
      fontWeight: 500
    }
  },
  loginError: {
    width: "100%",
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
    padding: theme.spacing(1, 1.25),
    borderRadius: brandTokens.shape.borderRadiusSm,
    backgroundColor:
      theme.mode === "light"
        ? "rgba(211, 47, 47, 0.08)"
        : "rgba(239, 83, 80, 0.12)",
    border: `1px solid ${theme.palette.error.main}`,
    color: theme.palette.error.main,
    fontSize: "0.8125rem",
    lineHeight: 1.4
  },
  linksContainer: {
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing(0.75)
  },
  footerLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    padding: theme.spacing(0.5, 1.5),
    borderRadius: brandTokens.shape.borderRadiusSm,
    textDecoration: "none",
    color: theme.palette.text.secondary,
    fontWeight: 500,
    fontSize: "0.75rem",
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.borderPrimary}`,
    transition: "background-color 150ms ease, color 150ms ease",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      color: theme.palette.text.primary,
      textDecoration: "none"
    }
  },
  versionInfo: {
    position: "absolute",
    right: theme.spacing(2),
    bottom: theme.spacing(1.25),
    zIndex: 2,
    fontSize: "0.625rem",
    fontWeight: 500,
    textAlign: "right",
    color: theme.palette.text.secondary,
    opacity: 0.6,
    [theme.breakpoints.down("xs")]: {
      right: theme.spacing(1),
      bottom: theme.spacing(0.75)
    }
  }
}));

const Login = () => {
  const classes = useStyles();
  const theme = useTheme();
  const { getPublicSetting } = useSettings();
  const { colorMode } = useContext(ColorModeContext);

  const [langMenuAnchor, setLangMenuAnchor] = useState(null);
  const currentLanguage =
    localStorage.getItem("language") || i18n.language || "en";

  const handleChooseLanguage = lang => {
    setLangMenuAnchor(null);
    localStorage.setItem("language", lang);
    window.location.reload(false);
  };

  const [user, setUser] = useState({ email: "", password: "" });
  const [allowSignup, setAllowSignup] = useState(false);
  const [loginLinks, setLoginLinks] = useState([]);
  const [sidePanelImage, setSidePanelImage] = useState("");
  const [backgroundContent, setBackgroundContent] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(() =>
    resolveTurnstileSiteKey()
  );
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileNonce, setTurnstileNonce] = useState(0);
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { handleLogin } = useContext(AuthContext);

  const handleTurnstileToken = useCallback(token => {
    setTurnstileToken(token || "");
  }, []);

  const handleChangeInput = event => {
    setUser(prevUser => ({
      ...prevUser,
      [event.target.name]: event.target.value.trim()
    }));
  };

  const handlSubmit = async event => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    if (turnstileSiteKey && !turnstileToken) {
      setLoginError(i18n.t("backendErrors.ERR_TURNSTILE_REQUIRED"));
      return;
    }

    setLoginError("");
    setSubmitting(true);

    try {
      const result = await handleLogin({
        ...user,
        turnstileToken: turnstileSiteKey ? turnstileToken : undefined
      });

      if (!result?.ok) {
        setLoginError(resolveErrorMessage(result?.error));
        setTurnstileToken("");
        setTurnstileNonce(current => current + 1);
      }
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    Promise.allSettled([
      getPublicSetting("allowSignup"),
      getPublicSetting("loginPageLinks"),
      getPublicSetting("loginSidePanelImage"),
      getPublicSetting("loginBackgroundContent"),
      getPublicSetting("turnstileSiteKey"),
      getPublicSetting("TURNSTILE_SITE_KEY"),
      getPublicSetting("cfTurnstileSiteKey")
    ]).then(results => {
      const valueAt = index =>
        results[index].status === "fulfilled" ? results[index].value : null;

      setAllowSignup(valueAt(0) === "enabled");
      setLoginLinks(parseLoginLinks(valueAt(1)));
      setSidePanelImage(valueAt(2) || "");
      setBackgroundContent(valueAt(3) || "");
      setTurnstileSiteKey(
        resolveTurnstileSiteKey(valueAt(4), valueAt(5), valueAt(6))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backgroundAssetUrl = getPublicAssetUrl(backgroundContent);
  const sidePanelImageUrl = getPublicAssetUrl(sidePanelImage);
  const shouldRenderBackgroundVideo = isVideoFile(backgroundContent);
  const showSidePanelImage = !!sidePanelImageUrl;
  const isLightMode = theme.palette.type === "light";
  const logoSrc =
    theme.calculatedLogo() ||
    (theme.palette.type === "light"
      ? brandTokens.logo.light
      : brandTokens.logo.dark);

  return (
    <div className={classes.root}>
      <CssBaseline />
      <div className={classes.topBar}>
        <IconButton
          className={classes.topBarButton}
          onClick={event => setLangMenuAnchor(event.currentTarget)}
          aria-label={i18n.t("mainDrawer.appBar.i18n.language")}
          size="small"
        >
          <LanguageIcon fontSize="small" />
        </IconButton>
        <IconButton
          className={classes.topBarButton}
          onClick={colorMode.toggleColorMode}
          aria-label={
            isLightMode ? "Switch to dark mode" : "Switch to light mode"
          }
          size="small"
        >
          {isLightMode ? (
            <Brightness4Icon fontSize="small" />
          ) : (
            <Brightness7Icon fontSize="small" />
          )}
        </IconButton>
      </div>
      <Popover
        className={classes.langMenu}
        open={Boolean(langMenuAnchor)}
        anchorEl={langMenuAnchor}
        onClose={() => setLangMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={Fade}
        TransitionProps={{ timeout: 180 }}
        PaperProps={{
          style: {
            marginTop: 6,
            overflow: "visible",
            background: "transparent",
            boxShadow: "none"
          }
        }}
        disableScrollLock
      >
        <Paper className={classes.langMenuPaper} elevation={0}>
          <MenuList dense>
            {Object.keys(messages).map(lang => (
              <MenuItem
                key={lang}
                onClick={() => handleChooseLanguage(lang)}
                selected={currentLanguage === lang}
                style={{
                  fontWeight: currentLanguage === lang ? 600 : 400,
                  fontSize: "0.8125rem"
                }}
              >
                {messages[lang].translations.mainDrawer.appBar.i18n.language}
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popover>
      {shouldRenderBackgroundVideo ? (
        <video
          className={classes.backgroundVideo}
          autoPlay
          loop
          muted
          playsInline
        >
          <source src={backgroundAssetUrl} />
        </video>
      ) : (
        <div
          className={`${classes.backgroundLayer}${backgroundAssetUrl ? ` ${classes.backgroundLayerImage}` : ""}`}
          style={
            backgroundAssetUrl
              ? { backgroundImage: `url("${backgroundAssetUrl}")` }
              : undefined
          }
        />
      )}
      <div className={classes.content}>
        <div className={classes.layout}>
          <div
            className={`${classes.loginBox}${showSidePanelImage ? ` ${classes.loginBoxWithMedia}` : ""}`}
          >
            {showSidePanelImage && (
              <div className={classes.mediaPane}>
                <img
                  className={classes.sidePanelImage}
                  src={sidePanelImageUrl}
                  alt={i18n.t("login.title")}
                />
              </div>
            )}
            <div className={classes.formColumn}>
              <div className={classes.paper}>
                <div className={classes.logoSection}>
                  <img
                    className={classes.logoImg}
                    src={logoSrc}
                    alt="Fortmax Sistemas"
                  />
                  <Typography className={classes.brandTagline}>
                    Sistema de atendimento
                  </Typography>
                </div>
                <form
                  className={classes.form}
                  noValidate
                  onSubmit={handlSubmit}
                >
                  <TextField
                    className={classes.input}
                    variant="outlined"
                    required
                    fullWidth
                    size="small"
                    id="email"
                    label={i18n.t("login.form.email")}
                    name="email"
                    value={user.email}
                    onChange={handleChangeInput}
                    autoComplete="email"
                    autoFocus
                  />
                  <TextField
                    className={classes.input}
                    variant="outlined"
                    required
                    fullWidth
                    size="small"
                    name="password"
                    label={i18n.t("login.form.password")}
                    type="password"
                    id="password"
                    value={user.password}
                    onChange={handleChangeInput}
                    autoComplete="current-password"
                  />
                  {turnstileSiteKey && (
                    <TurnstileWidget
                      siteKey={turnstileSiteKey}
                      onTokenChange={handleTurnstileToken}
                      resetNonce={turnstileNonce}
                    />
                  )}
                  {loginError && (
                    <Typography className={classes.loginError} role="alert">
                      {loginError}
                    </Typography>
                  )}
                  <Button
                    type="submit"
                    fullWidth
                    variant="contained"
                    color="primary"
                    className={classes.submit}
                    disabled={
                      submitting || (turnstileSiteKey && !turnstileToken)
                    }
                  >
                    {submitting
                      ? i18n.t("login.buttons.submitting") || "Entrando..."
                      : i18n.t("login.buttons.submit")}
                  </Button>
                  {allowSignup && (
                    <Grid container justifyContent="center">
                      <Grid item className={classes.signupLink}>
                        <Link
                          href="#"
                          variant="body2"
                          component={RouterLink}
                          to="/signup"
                        >
                          {i18n.t("login.buttons.register")}
                        </Link>
                      </Grid>
                    </Grid>
                  )}
                </form>
              </div>
            </div>
          </div>
          {loginLinks.length > 0 && (
            <div className={classes.linksContainer}>
              {loginLinks.map((link, index) => (
                <a
                  className={classes.footerLink}
                  href={link.url}
                  key={`${link.url}-${index}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <Typography className={classes.versionInfo}>
        {`${gitinfo.tagName || `${gitinfo.branchName || "N/A"} ${gitinfo.commitHash || "N/A"}`}`}
        {" / "}
        {`${gitinfo.buildTimestamp || "N/A"}`}
      </Typography>
    </div>
  );
};

export default Login;
