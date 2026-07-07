import React, { useState, useEffect, useContext } from "react";

import Paper from "@material-ui/core/Paper";
import Container from "@material-ui/core/Container";
import Grid from "@material-ui/core/Grid";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";

// ICONS
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import TimerIcon from "@material-ui/icons/Timer";

import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";

import TableAttendantsStatus from "../../components/Dashboard/TableAttendantsStatus";
import BackdropLoading from "../../components/BackdropLoading";

import { isEmpty } from "lodash";
import moment from "moment";
import { i18n } from "../../translate/i18n";
import useAuth from "../../hooks/useAuth.js";

import { SmallPie } from "./SmallPie";
import { TicketCountersChart } from "./TicketCountersChart";
import { getTimezoneOffset } from "../../helpers/getTimezoneOffset.js";

import api from "../../services/api.js";
import { SocketContext } from "../../context/Socket/SocketContext.js";
import { formatTimeInterval } from "../../helpers/formatTimeInterval.js";
import brandTokens from "../../theme/brandTokens";

const useStyles = makeStyles(theme => ({
  container: {
    paddingTop: theme.spacing(2),
    paddingBottom: theme.spacing(3),
    maxWidth: 1280,
    [theme.breakpoints.down("sm")]: {
      paddingTop: theme.spacing(1),
      paddingBottom: theme.spacing(2),
      paddingLeft: theme.spacing(1),
      paddingRight: theme.spacing(1)
    }
  },
  fixedHeightPaper: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    minHeight: 220,
    height: "auto",
    overflowY: "auto",
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.borderPrimary}`,
    boxShadow: theme.mode === "light" ? brandTokens.elevation.card : "none",
    backgroundColor: theme.palette.background.paper,
    ...theme.scrollbarStyles,
    [theme.breakpoints.down("sm")]: {
      padding: theme.spacing(1.5),
      minHeight: 180
    }
  },
  cardSolid: {
    padding: theme.spacing(1.5, 2),
    display: "flex",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.borderPrimary}`,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.mode === "light" ? brandTokens.elevation.card : "none",
    [theme.breakpoints.down("sm")]: {
      padding: theme.spacing(1.25, 1.5)
    }
  },
  cardGray: {
    padding: theme.spacing(1.5, 2),
    display: "flex",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    height: "100%",
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.borderPrimary}`,
    backgroundColor: theme.palette.background.paper,
    boxShadow: theme.mode === "light" ? brandTokens.elevation.card : "none",
    [theme.breakpoints.down("sm")]: {
      padding: theme.spacing(1.25, 1.5)
    }
  },
  cardData: {
    display: "block",
    flex: 1,
    minWidth: 0,
    zIndex: 1
  },
  cardLabel: {
    fontSize: "0.6875rem",
    fontWeight: 500,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    marginBottom: theme.spacing(0.25),
    lineHeight: 1.3
  },
  cardValue: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
    [theme.breakpoints.down("sm")]: {
      fontSize: "1.125rem"
    }
  },
  cardIcon: {
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.shape.borderRadiusSm || 6,
    backgroundColor:
      theme.mode === "light"
        ? "rgba(211, 47, 47, 0.08)"
        : "rgba(239, 83, 80, 0.12)",
    color: theme.palette.primary.main,
    flexShrink: 0,
    marginLeft: theme.spacing(1),
    "& svg": {
      fontSize: 20
    }
  },
  cardRingGraph: {
    width: 72,
    height: 72,
    flexShrink: 0,
    marginLeft: theme.spacing(0.5),
    [theme.breakpoints.down("sm")]: {
      width: 56,
      height: 56
    }
  },
  alignRight: {
    textAlign: "right"
  },
  fullWidth: {
    width: "100%"
  },
  selectContainer: {
    width: "100%",
    textAlign: "left"
  },
  filterRow: {
    display: "flex",
    alignItems: "flex-end",
    gap: theme.spacing(1),
    flexWrap: "wrap",
    padding: theme.spacing(1.25, 1.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.borderPrimary}`,
    backgroundColor: theme.palette.background.paper,
    [theme.breakpoints.down("sm")]: {
      padding: theme.spacing(1),
      gap: theme.spacing(0.75)
    }
  },
  filterItem: {
    flex: "1 1 160px",
    minWidth: 140,
    [theme.breakpoints.down("sm")]: {
      flex: "1 1 100%",
      minWidth: "100%"
    }
  }
}));

const InfoCard = ({ title, value, icon }) => {
  const classes = useStyles();

  return (
    <Grid item xs={12} sm={6} md={3}>
      <Paper className={classes.cardGray} elevation={0}>
        <div className={classes.cardData}>
          <Typography className={classes.cardLabel}>{title}</Typography>
          <Typography className={classes.cardValue}>{value}</Typography>
        </div>
        <div className={classes.cardIcon}>{icon}</div>
      </Paper>
    </Grid>
  );
};

const InfoRingCard = ({ title, value, graph }) => {
  const classes = useStyles();
  return (
    <Grid item xs={12} sm={6} md={4}>
      <Paper className={classes.cardSolid} elevation={0}>
        <div className={classes.cardData}>
          <Typography className={classes.cardLabel}>{title}</Typography>
          <Typography className={classes.cardValue}>{value}</Typography>
        </div>
        <div className={classes.cardRingGraph}>{graph}</div>
      </Paper>
    </Grid>
  );
};

const Dashboard = () => {
  const classes = useStyles();
  const [period, setPeriod] = useState(0);
  const [currentUser, setCurrentUser] = useState({});
  const [userChecked, setUserChecked] = useState(false);
  const [dateFrom, setDateFrom] = useState(
    moment("1", "D").format("YYYY-MM-DDTHH") + ":00"
  );
  const [dateTo, setDateTo] = useState(
    moment().format("YYYY-MM-DDTHH") + ":59"
  );
  const { getCurrentUserInfo } = useAuth();

  const [usersOnlineTotal, setUsersOnlineTotal] = useState(0);
  const [usersOfflineTotal, setUsersOfflineTotal] = useState(0);
  const [usersStatusChartData, setUsersStatusChartData] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [pendingChartData, setPendingChartData] = useState([]);
  const [openedTotal, setOpenedTotal] = useState(0);
  const [openedChartData, setOpenedChartData] = useState([]);

  const [ticketsData, setTicketsData] = useState({});
  const [usersData, setUsersData] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const socketManager = useContext(SocketContext);
  const companyId = localStorage.getItem("companyId");

  useEffect(() => {
    const socket = socketManager.GetSocket(companyId);

    socket.on("userOnlineChange", updateStatus);
    socket.on("counter", updateStatus);

    return () => {
      socket.disconnect();
    };
  }, [socketManager, companyId]);

  useEffect(() => {
    getCurrentUserInfo()
      .then(user => {
        if (user?.profile !== "admin") {
          window.location.href = "/tickets";
          return;
        }
        setCurrentUser(user);
      })
      .catch(() => {})
      .finally(() => {
        setUserChecked(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
  }, [period]);

  async function handleChangePeriod(value) {
    setPeriod(value);
  }

  async function updateStatus() {
    api
      .get("/dashboard/status")
      .then(result => {
        const { data } = result;

        if (!data) return;

        let usersOnlineTotal = 0;
        let usersOfflineTotal = 0;
        data.usersStatusSummary.forEach(item => {
          if (item.online) {
            usersOnlineTotal++;
          } else {
            usersOfflineTotal++;
          }
        });

        setUsersStatusChartData([
          {
            name: "Online",
            value: usersOnlineTotal,
            color: "#22C55E"
          },
          {
            name: "Offline",
            value: usersOfflineTotal,
            color: "#94A3B8"
          }
        ]);

        setUsersOnlineTotal(usersOnlineTotal);
        setUsersOfflineTotal(usersOfflineTotal);

        let pendingTotal = 0;
        let openedTotal = 0;
        const pendingChartData = [];
        const openedChartData = [];
        data.ticketsStatusSummary.forEach(item => {
          if (item.status === "pending") {
            pendingTotal += Number(item.count);
            pendingChartData.push({
              name: item.queue?.name || i18n.t("common.noqueue"),
              value: Number(item.count),
              color: item.queue?.color || "#888"
            });
            return;
          }
          if (item.status === "open") {
            openedTotal += Number(item.count);
            openedChartData.push({
              name: item.queue?.name || i18n.t("common.noqueue"),
              value: Number(item.count),
              color: item.queue?.color || "#888"
            });
          }
        });
        setPendingTotal(pendingTotal);
        setPendingChartData(pendingChartData);
        setOpenedTotal(openedTotal);
        setOpenedChartData(openedChartData);
      })
      .catch(() => {});
  }

  async function fetchData() {
    let params = { tz: getTimezoneOffset() };

    const days = Number(period);

    if (days) {
      params = {
        date_from: moment().subtract(days, "days").format("YYYY-MM-DD"),
        date_to: moment().format("YYYY-MM-DD")
      };
    }

    if (!days && !isEmpty(dateFrom) && moment(dateFrom).isValid()) {
      params = {
        ...params,
        date_from: moment(dateFrom).format("YYYY-MM-DD"),
        hour_from: moment(dateFrom).format("HH:mm:ss")
      };
    }

    if (!days && !isEmpty(dateTo) && moment(dateTo).isValid()) {
      params = {
        ...params,
        date_to: moment(dateTo).format("YYYY-MM-DD"),
        hour_to: moment(dateTo).format("HH:mm:ss")
      };
    }

    if (Object.keys(params).length === 0) {
      toast.error(i18n.t("dashboard.filter.invalid"));
      return;
    }

    const ticketsRequest = api
      .get("/dashboard/tickets", { params })
      .then(result => {
        if (result?.data) {
          setTicketsData(result.data);
        }
      })
      .catch(() => {
        setTicketsData({});
      });

    setLoadingUsers(true);
    const usersRequest = api
      .get("/dashboard/users", { params })
      .then(result => {
        if (result?.data) {
          setUsersData(result.data);
        }
      })
      .catch(() => {
        setUsersData({});
      })
      .finally(() => {
        setLoadingUsers(false);
      });

    return Promise.allSettled([ticketsRequest, usersRequest]);
  }

  useEffect(() => {
    updateStatus();
  }, []);

  function renderFilters() {
    return (
      <Grid item xs={12}>
        <div className={classes.filterRow}>
          <FormControl className={classes.filterItem} size="small">
            <InputLabel id="period-selector-label">
              {i18n.t("dashboard.filter.period")}
            </InputLabel>
            <Select
              labelId="period-selector-label"
              id="period-selector"
              value={period}
              onChange={e => handleChangePeriod(e.target.value)}
            >
              <MenuItem value={0}>{i18n.t("dashboard.filter.custom")}</MenuItem>
              <MenuItem value={3}>
                {i18n.t("dashboard.filter.last3days")}
              </MenuItem>
              <MenuItem value={7}>
                {i18n.t("dashboard.filter.last7days")}
              </MenuItem>
              <MenuItem value={15}>
                {i18n.t("dashboard.filter.last14days")}
              </MenuItem>
              <MenuItem value={30}>
                {i18n.t("dashboard.filter.last30days")}
              </MenuItem>
              <MenuItem value={90}>
                {i18n.t("dashboard.filter.last90days")}
              </MenuItem>
            </Select>
          </FormControl>
          {!period && (
            <>
              <TextField
                label={i18n.t("dashboard.date.start")}
                type="datetime-local"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                onBlur={fetchData}
                className={classes.filterItem}
                size="small"
                InputLabelProps={{
                  shrink: true
                }}
              />
              <TextField
                label={i18n.t("dashboard.date.end")}
                type="datetime-local"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                onBlur={fetchData}
                className={classes.filterItem}
                size="small"
                InputLabelProps={{
                  shrink: true
                }}
              />
            </>
          )}
        </div>
      </Grid>
    );
  }

  if (!userChecked || currentUser?.profile !== "admin") {
    return <BackdropLoading />;
  }

  return (
    <div>
      <Container maxWidth="lg" className={classes.container}>
        <Grid container spacing={1.5} justifyContent="flex-start">
          {/* USUARIOS ONLINE */}
          <InfoRingCard
            title={i18n.t("dashboard.usersOnline")}
            value={`${usersOnlineTotal}/${usersOnlineTotal + usersOfflineTotal}`}
            graph={<SmallPie chartData={usersStatusChartData} />}
          />

          {/* ATENDIMENTOS PENDENTES */}
          <InfoRingCard
            title={i18n.t("dashboard.ticketsWaiting")}
            value={pendingTotal}
            graph={<SmallPie chartData={pendingChartData} />}
          />

          {/* ATENDIMENTOS ACONTECENDO */}
          <InfoRingCard
            title={i18n.t("dashboard.ticketsOpen")}
            value={openedTotal}
            graph={<SmallPie chartData={openedChartData} />}
          />

          {/* FILTROS */}
          {renderFilters()}

          {/* ATENDIMENTOS REALIZADOS */}
          <InfoCard
            title={i18n.t("dashboard.ticketsDone")}
            value={ticketsData.ticketStatistics?.totalClosed || 0}
            icon={<CheckCircleIcon />}
          />

          {/* NOVOS CONTATOS */}
          <InfoCard
            title={i18n.t("dashboard.newContacts")}
            value={ticketsData.ticketStatistics?.newContacts || 0}
            icon={<GroupAddIcon />}
          />

          {/* T.M. DE ATENDIMENTO */}
          <InfoCard
            title={i18n.t("dashboard.avgServiceTime")}
            value={formatTimeInterval(
              ticketsData.ticketStatistics?.avgServiceTime
            )}
            icon={<TimerIcon />}
          />

          {/* T.M. DE ESPERA */}
          <InfoCard
            title={i18n.t("dashboard.avgWaitTime")}
            value={formatTimeInterval(
              ticketsData.ticketStatistics?.avgWaitTime
            )}
            icon={<HourglassEmptyIcon />}
          />

          {/* DASHBOARD ATENDIMENTOS NO PERÍODO */}
          <Grid item xs={12}>
            <Paper className={classes.fixedHeightPaper} elevation={0}>
              <TicketCountersChart
                ticketCounters={ticketsData.ticketCounters}
              />
            </Paper>
          </Grid>

          {/* USER REPORT */}
          <Grid item xs={12}>
            {usersData.userReport?.length ? (
              <TableAttendantsStatus
                attendants={usersData.userReport}
                loading={loadingUsers}
              />
            ) : null}
          </Grid>
        </Grid>
      </Container>
    </div>
  );
};

export default Dashboard;
