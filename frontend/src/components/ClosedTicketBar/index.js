import React, { useContext, useState } from "react";
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  makeStyles
} from "@material-ui/core";
import { Android, Replay } from "@material-ui/icons";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.25, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    minHeight: 36
  }
}));

const ClosedTicketBar = ({ ticket, onReopened }) => {
  const classes = useStyles();
  const { setObservationMode } = useContext(TicketsContext);
  const [loading, setLoading] = useState(false);

  if (!ticket?.id || ticket.status !== "closed") {
    return null;
  }

  const handleReopen = async (releaseToAi = false) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/reopen`, {
        releaseToAi
      });

      if (data.alreadyOpen) {
        toast.success(i18n.t("closedTicketBar.alreadyOpen"));
      } else if (data.releasedToAi) {
        setObservationMode(true);
        toast.success(i18n.t("closedTicketBar.reopenedWithAi"));
      } else {
        setObservationMode(false);
        toast.success(i18n.t("closedTicketBar.reopened"));
      }

      if (onReopened && data.ticket) {
        onReopened(data.ticket);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className={classes.root}>
      <Tooltip title={i18n.t("messagesList.header.buttons.reopen")}>
        <span>
          <IconButton
            size="small"
            color="primary"
            disabled={loading}
            onClick={() => handleReopen(false)}
          >
            {loading ? (
              <CircularProgress size={18} />
            ) : (
              <Replay fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title={i18n.t("closedTicketBar.reopenWithAi")}>
        <span>
          <IconButton
            size="small"
            disabled={loading}
            onClick={() => handleReopen(true)}
          >
            <Android fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
};

export default ClosedTicketBar;
