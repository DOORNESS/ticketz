import React, { useContext, useState } from "react";
import { Box, Typography, makeStyles } from "@material-ui/core";
import { Replay, SmartToy } from "@material-ui/icons";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { toast } from "react-toastify";
import ButtonWithSpinner from "../ButtonWithSpinner";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1.5, 2),
    backgroundColor: theme.palette.type === "dark" ? "#1b2838" : "#e3f2fd",
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing(1)
  },
  text: {
    flex: 1,
    minWidth: 200
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1)
  }
}));

const ClosedTicketBar = ({ ticket, onReopened }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const { setObservationMode } = useContext(TicketsContext);
  const [loading, setLoading] = useState(false);

  if (!ticket?.id || ticket.status !== "closed") {
    return null;
  }

  const handleReopen = async (releaseToAi = false) => {
    setLoading(true);
    try {
      const { data } = await api.put(`/tickets/${ticket.id}`, {
        status: "open",
        userId: user?.id
      });

      if (releaseToAi) {
        await api.post(`/tickets/${ticket.id}/ai/release`);
        setObservationMode(true);
        toast.success(i18n.t("closedTicketBar.reopenedWithAi"));
      } else {
        setObservationMode(false);
        toast.success(i18n.t("closedTicketBar.reopened"));
      }

      if (onReopened) {
        onReopened(releaseToAi ? { ...data, userId: null } : data);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className={classes.root}>
      <Typography className={classes.text} variant="body2">
        {i18n.t("closedTicketBar.message")}
      </Typography>
      <Box className={classes.actions}>
        <ButtonWithSpinner
          loading={loading}
          size="small"
          variant="contained"
          color="primary"
          startIcon={<Replay />}
          onClick={() => handleReopen(false)}
        >
          {i18n.t("messagesList.header.buttons.reopen")}
        </ButtonWithSpinner>
        <ButtonWithSpinner
          loading={loading}
          size="small"
          variant="outlined"
          color="primary"
          startIcon={<SmartToy />}
          onClick={() => handleReopen(true)}
        >
          {i18n.t("closedTicketBar.reopenWithAi")}
        </ButtonWithSpinner>
      </Box>
    </Box>
  );
};

export default ClosedTicketBar;
