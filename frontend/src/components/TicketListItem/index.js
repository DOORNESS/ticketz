import React, { useState, useEffect, useRef, useContext } from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO, format, isSameDay } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";

import { i18n } from "../../translate/i18n";
import { formatWhatsappContactName } from "../../helpers/formatWhatsappDisplay";

import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import WhatsMarked from "react-whatsmarked";
import { Tooltip } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import toastError from "../../errors/toastError";
import {
  isAiHandlingTicket,
  isHandoffPendingTicket
} from "../../helpers/aiTicketStatus";

const useStyles = makeStyles(theme => ({
  ticket: {
    position: "relative"
  },

  pendingTicket: {
    cursor: "pointer"
  },

  contactNameWrapper: {
    display: "flex",
    justifyContent: "space-between"
  },

  lastMessageTime: {
    justifySelf: "flex-end"
  },

  closedBadge: {
    alignSelf: "center",
    justifySelf: "flex-end",
    marginRight: 32,
    marginLeft: "auto"
  },

  contactLastMessage: {
    paddingRight: 20
  },

  newMessagesCount: {
    alignSelf: "center",
    marginRight: 8,
    marginLeft: "auto"
  },

  badgeStyle: {
    color: "white",
    backgroundColor: green[500]
  },

  actionButton: {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    whiteSpace: "nowrap"
  },

  ticketQueueColor: {
    flex: "none",
    width: "8px",
    height: "100%",
    position: "absolute",
    top: "0%",
    left: "0%"
  }
}));

const TicketListItem = ({ ticket, groupActionButtons }) => {
  const classes = useStyles();
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const { user } = useContext(AuthContext);
  const { setObservationMode } = useContext(TicketsContext);

  const aiHandling = isAiHandlingTicket(ticket);
  const handoffPending = isHandoffPendingTicket(ticket);
  const routeId = ticket.uuid || String(ticket.id);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const openTicket = (observing = false) => {
    setObservationMode(observing);
    history.push(`/tickets/${routeId}`);
  };

  const handleAcceptTicket = async selectedTicket => {
    setLoading(true);
    try {
      await api.put(`/tickets/${selectedTicket.id}`, {
        status: "open",
        userId: user?.id
      });
      setObservationMode(false);
      history.push(`/tickets/${routeId}`);
    } catch (err) {
      toastError(err);
    }
    if (isMounted.current) {
      setLoading(false);
    }
  };

  const handleSelectTicket = () => {
    openTicket(aiHandling || handoffPending);
  };

  return (
    <React.Fragment key={ticket.id}>
      <ListItem
        dense
        button
        onClick={handleSelectTicket}
        selected={
          ticketId &&
          (ticket.uuid === ticketId || String(ticket.id) === ticketId)
        }
        className={clsx(classes.ticket, {
          [classes.pendingTicket]: ticket.status === "pending" || aiHandling
        })}
      >
        <Tooltip
          arrow
          placement="right"
          title={ticket.queue?.name || "Sem fila"}
        >
          <span
            style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
            className={classes.ticketQueueColor}
          ></span>
        </Tooltip>
        <ListItemAvatar>
          <Avatar src={ticket?.contact?.profilePicUrl} />
        </ListItemAvatar>
        <ListItemText
          disableTypography
          primary={
            <span className={classes.contactNameWrapper}>
              <Typography
                noWrap
                component="span"
                variant="body2"
                color="textPrimary"
              >
                {formatWhatsappContactName(ticket.contact, ticket)}
              </Typography>
              {ticket.status === "closed" && (
                <Badge
                  className={classes.closedBadge}
                  badgeContent={"closed"}
                  color="primary"
                />
              )}
              {ticket.lastMessage && (
                <Typography
                  className={classes.lastMessageTime}
                  component="span"
                  variant="body2"
                  color="textSecondary"
                >
                  {isSameDay(parseISO(ticket.updatedAt), new Date()) ? (
                    <>{format(parseISO(ticket.updatedAt), "HH:mm")}</>
                  ) : (
                    <>{format(parseISO(ticket.updatedAt), "dd/MM/yyyy")}</>
                  )}
                </Typography>
              )}
            </span>
          }
          secondary={
            <span className={classes.contactNameWrapper}>
              <Typography
                className={classes.contactLastMessage}
                noWrap
                component="span"
                variant="body2"
                color="textSecondary"
              >
                {ticket.lastMessage ? (
                  <WhatsMarked oneline>
                    {ticket.lastMessage.startsWith('{"ticketzvCard"')
                      ? "🪪"
                      : ticket.lastMessage.split("\n")[0]}
                  </WhatsMarked>
                ) : (
                  <br />
                )}
              </Typography>

              <Badge
                className={classes.newMessagesCount}
                badgeContent={ticket.unreadMessages}
                classes={{
                  badge: classes.badgeStyle
                }}
              />
            </span>
          }
        />
        {handoffPending &&
          !aiHandling &&
          ticket.status === "pending" &&
          (groupActionButtons || !ticket.isGroup) && (
            <ButtonWithSpinner
              color="primary"
              variant="contained"
              className={classes.actionButton}
              size="small"
              loading={loading}
              onClick={e => {
                e.stopPropagation();
                handleAcceptTicket(ticket);
              }}
            >
              {i18n.t("ticketsList.buttons.accept")}
            </ButtonWithSpinner>
          )}
      </ListItem>
      <Divider variant="inset" component="li" />
    </React.Fragment>
  );
};

export default TicketListItem;
