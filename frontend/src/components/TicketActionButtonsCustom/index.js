import React, { useContext, useState } from "react";
import { useHistory } from "react-router-dom";

import {
  makeStyles,
  createTheme,
  ThemeProvider
} from "@material-ui/core/styles";
import { IconButton } from "@material-ui/core";
import { MoreVert, Replay } from "@material-ui/icons";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import TicketOptionsMenu from "../TicketOptionsMenu";
import ButtonWithSpinner from "../ButtonWithSpinner";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import UndoRoundedIcon from "@material-ui/icons/UndoRounded";
import AddBoxIcon from "@material-ui/icons/AddBox";
import { Call, CallEnd } from "@material-ui/icons";
import Tooltip from "@material-ui/core/Tooltip";
import { green } from "@material-ui/core/colors";
import { PhoneCallContext } from "../../context/PhoneCall/PhoneCallContext";
import { wavoipAvailable, wavoipCall } from "../../helpers/wavoipCallManager";
import {
  canSuperviseAi,
  canAssumeFromBot,
  canAcceptTicket,
  canReleaseTicketToAi,
  isAiHandlingTicket,
  isHandoffPendingTicket,
  getTicketListColumn
} from "../../helpers/aiTicketStatus";
import { toast } from "react-toastify";
import AiLearningCloseModal from "../AiLearningCloseModal";

const useStyles = makeStyles(theme => ({
  actionButtons: {
    marginRight: 6,
    flex: "none",
    alignSelf: "center",
    marginLeft: "auto",
    "& > *": {
      margin: theme.spacing(0.5)
    }
  }
}));

const TicketActionButtonsCustom = ({
  ticket,
  showTabGroups,
  observationMode = false,
  onTicketUpdated
}) => {
  const classes = useStyles();
  const history = useHistory();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loadingAction, setLoadingAction] = useState(null);
  const [learningModalOpen, setLearningModalOpen] = useState(false);
  const ticketOptionsMenuOpen = Boolean(anchorEl);
  const { user } = useContext(AuthContext);
  const {
    setCurrentTicket,
    setObservationMode,
    setListSubTab,
    refreshTicketLists
  } = useContext(TicketsContext);
  const phoneContext = useContext(PhoneCallContext);

  const customTheme = createTheme({
    palette: {
      primary: green
    }
  });

  const handleOpenTicketOptionsMenu = e => {
    setAnchorEl(e.currentTarget);
  };

  const handleCloseTicketOptionsMenu = e => {
    setAnchorEl(null);
  };

  const handleUpdateTicketStatus = async (e, status, userId) => {
    if (loadingAction) {
      return;
    }
    setLoadingAction("status");
    try {
      let updatedTicket;
      if (status === "open" && ticket.status === "closed") {
        const { data } = await api.post(`/tickets/${ticket.id}/reopen`, {
          releaseToAi: false
        });
        updatedTicket = data.ticket;
      } else {
        const { data } = await api.put(`/tickets/${ticket.id}`, {
          status: status,
          userId: userId ?? null
        });
        updatedTicket = data;
      }

      if (status === "open") {
        applyTicketUpdate(updatedTicket);
        toast.success(i18n.t("closedTicketBar.reopened"));
      } else {
        setObservationMode(false);
        setCurrentTicket({ id: null, code: null });
        history.push("/tickets");
      }
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCall = async () => {
    wavoipCall(ticket, () => {
      phoneContext.disconnect();
    })
      .then(wavoipInstance => {
        phoneContext.updateCurrentCall({
          contact: ticket.contact,
          whatsapp: ticket.whatsapp,
          disconnect: () => {
            window.wavoipCallingSound.stop();
            wavoipInstance.endCall();
          }
        });
      })
      .catch(err => {
        toastError(err);
      });
  };

  const applyTicketUpdate = updatedTicket => {
    const column = getTicketListColumn(updatedTicket);
    if (column === "ai" || column === "pending" || column === "open") {
      setListSubTab(column);
    }

    refreshTicketLists?.();

    if (onTicketUpdated) {
      onTicketUpdated(updatedTicket);
      return;
    }

    const observing = column === "ai" || column === "pending";
    setObservationMode(observing);
    setCurrentTicket({
      ...updatedTicket,
      code: updatedTicket.status === "open" ? "#open" : "#pending"
    });
  };

  const buildOptimisticAssumedTicket = () => ({
    ...ticket,
    status: "open",
    userId: user?.id,
    user: ticket.user || user,
    aiPaused: true,
    aiHandoff: true,
    aiHumanAssumedAt: new Date().toISOString(),
    operationalState: {
      ...(ticket.operationalState || {}),
      listColumn: "open",
      label: "Em atendimento",
      allowedActions: {
        assume: false,
        accept: false,
        releaseToAi: true,
        pause: false
      }
    }
  });

  const handleAssumeFromBot = async () => {
    if (loadingAction) {
      return;
    }
    setLoadingAction("assume");
    applyTicketUpdate(buildOptimisticAssumedTicket());
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/assume`, {
        notifyCustomer: true
      });
      applyTicketUpdate(data);
      toast.success("Atendimento assumido com sucesso.");
    } catch (err) {
      applyTicketUpdate(ticket);
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handlePauseAi = async () => {
    if (loadingAction) {
      return;
    }
    setLoadingAction("pause");
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/pause`);
      setCurrentTicket({ ...data, code: "#paused" });
      toast.success(i18n.t("aiSupervision.actions.pauseSuccess"));
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResumeAi = async () => {
    if (loadingAction) {
      return;
    }
    setLoadingAction("resume");
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/resume`);
      setCurrentTicket({ ...data, code: "#resumed" });
      toast.success(i18n.t("aiSupervision.actions.resumeSuccess"));
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReleaseToAi = async () => {
    if (loadingAction) {
      return;
    }
    setLoadingAction("release");
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/ai/release`);
      applyTicketUpdate(data);
      toast.success(i18n.t("aiSupervision.actions.releaseSuccess"));
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCloseTicket = async () => {
    if (ticket.aiStartedAt && ticket.userId) {
      setLearningModalOpen(true);
      return;
    }

    if (loadingAction) {
      return;
    }
    setLoadingAction("close");
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status: "closed",
        justClose: true,
        userId: ticket.userId || user?.id
      });
      setObservationMode(false);
      setCurrentTicket({ id: null, code: null });
      history.push("/tickets");
      toast.success(i18n.t("messagesList.header.buttons.resolve"));
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLearningComplete = () => {
    setLearningModalOpen(false);
    setCurrentTicket({ id: null, code: null });
    history.push("/tickets");
  };

  const showAssumeFromBot = canAssumeFromBot(ticket, user);

  const showPauseAi =
    canSuperviseAi(user) &&
    ticket.aiAgentId &&
    !ticket.userId &&
    !ticket.aiPaused &&
    ticket.status !== "closed";

  const showResumeAi =
    canSuperviseAi(user) &&
    ticket.aiPaused &&
    ticket.aiHandoff &&
    !ticket.userId;

  const showReleaseToAi = canReleaseTicketToAi(ticket, user);

  const showAcceptTicket = canAcceptTicket(ticket, user);

  const handleAcceptTicket = async e => {
    if (e) {
      e.preventDefault();
    }
    if (loadingAction) {
      return;
    }
    setLoadingAction("accept");
    const fromAi = isHandoffPendingTicket(ticket) || isAiHandlingTicket(ticket);
    if (fromAi) {
      applyTicketUpdate(buildOptimisticAssumedTicket());
    }
    try {
      let data;
      if (fromAi) {
        ({ data } = await api.post(`/tickets/${ticket.id}/ai/assume`));
      } else {
        ({ data } = await api.put(`/tickets/${ticket.id}`, {
          status: "open",
          userId: user?.id
        }));
      }
      applyTicketUpdate(data);
      toast.success(i18n.t("ticketsList.acceptSuccess"));
    } catch (err) {
      if (fromAi) {
        applyTicketUpdate(ticket);
      }
      toastError(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleAcceptObservation = async () => {
    await handleAcceptTicket(null);
  };

  return (
    <div className={classes.actionButtons}>
      {ticket.status === "closed" && (!showTabGroups || !ticket.isGroup) && (
        <>
          <Tooltip title={i18n.t("ticketsManager.buttons.newTicket")}>
            <IconButton
              onClick={() =>
                window.mentionClick({
                  contactId: ticket.contactId,
                  name: ticket.contact?.name,
                  number: ticket.contact?.number
                })
              }
            >
              <AddBoxIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={i18n.t("messagesList.header.buttons.reopen")}>
            <IconButton
              onClick={e => handleUpdateTicketStatus(e, "open", user?.id)}
            >
              <Replay />
            </IconButton>
          </Tooltip>
        </>
      )}
      {(ticket.status === "open" || (showTabGroups && ticket.isGroup)) && (
        <>
          {wavoipAvailable() &&
            phoneContext &&
            !phoneContext.currentCall &&
            ticket.whatsapp.wavoip?.token &&
            !ticket.contact.isGroup && (
              <Tooltip title={i18n.t("messagesList.header.buttons.call")}>
                <IconButton onClick={handleCall}>
                  <Call />
                </IconButton>
              </Tooltip>
            )}

          {wavoipAvailable() &&
            phoneContext &&
            phoneContext.currentCall &&
            phoneContext.currentCall.contact.id === ticket.contact.id &&
            phoneContext.currentCall.whatsapp.id === ticket.whatsapp.id && (
              <Tooltip title={i18n.t("messagesList.header.buttons.endCall")}>
                <IconButton onClick={phoneContext.disconnect}>
                  <CallEnd />
                </IconButton>
              </Tooltip>
            )}

          {(!showTabGroups || !ticket.isGroup) && (
            <>
              <Tooltip title={i18n.t("messagesList.header.buttons.return")}>
                <IconButton
                  onClick={e => handleUpdateTicketStatus(e, "pending", null)}
                >
                  <UndoRoundedIcon />
                </IconButton>
              </Tooltip>
              <ThemeProvider theme={customTheme}>
                <Tooltip title={i18n.t("messagesList.header.buttons.resolve")}>
                  <IconButton onClick={handleCloseTicket} color="primary">
                    <CheckCircleIcon />
                  </IconButton>
                </Tooltip>
              </ThemeProvider>
            </>
          )}

          <IconButton onClick={handleOpenTicketOptionsMenu}>
            <MoreVert />
          </IconButton>
          <TicketOptionsMenu
            ticket={ticket}
            anchorEl={anchorEl}
            menuOpen={ticketOptionsMenuOpen}
            handleClose={handleCloseTicketOptionsMenu}
            showTabGroups={showTabGroups}
          />
        </>
      )}
      {observationMode && (
        <>
          {showAssumeFromBot && (
            <ButtonWithSpinner
              loading={loadingAction === "assume"}
              size="small"
              variant="contained"
              color="secondary"
              onClick={handleAssumeFromBot}
            >
              {i18n.t("aiSupervision.actions.assumeFromBot")}
            </ButtonWithSpinner>
          )}
          {showPauseAi && (
            <ButtonWithSpinner
              loading={loadingAction === "pause"}
              size="small"
              variant="outlined"
              color="default"
              onClick={handlePauseAi}
            >
              {i18n.t("aiSupervision.actions.pauseAi")}
            </ButtonWithSpinner>
          )}
          {showResumeAi && (
            <ButtonWithSpinner
              loading={loadingAction === "resume"}
              size="small"
              variant="outlined"
              color="primary"
              onClick={handleResumeAi}
            >
              {i18n.t("aiSupervision.actions.resumeAi")}
            </ButtonWithSpinner>
          )}
          {showAcceptTicket && (!showTabGroups || !ticket.isGroup) && (
            <ButtonWithSpinner
              loading={loadingAction === "accept"}
              size="small"
              variant="contained"
              color="primary"
              onClick={handleAcceptObservation}
            >
              {i18n.t("aiSupervision.actions.acceptAttendance")}
            </ButtonWithSpinner>
          )}
        </>
      )}
      {!observationMode && showAssumeFromBot && (
        <ButtonWithSpinner
          loading={loadingAction === "assume"}
          size="small"
          variant="contained"
          color="secondary"
          onClick={handleAssumeFromBot}
        >
          {i18n.t("aiSupervision.actions.assumeFromBot")}
        </ButtonWithSpinner>
      )}
      {!observationMode && showPauseAi && (
        <ButtonWithSpinner
          loading={loadingAction === "pause"}
          size="small"
          variant="outlined"
          color="default"
          onClick={handlePauseAi}
        >
          {i18n.t("aiSupervision.actions.pauseAi")}
        </ButtonWithSpinner>
      )}
      {!observationMode && showResumeAi && (
        <ButtonWithSpinner
          loading={loadingAction === "resume"}
          size="small"
          variant="outlined"
          color="primary"
          onClick={handleResumeAi}
        >
          {i18n.t("aiSupervision.actions.resumeAi")}
        </ButtonWithSpinner>
      )}
      {!observationMode && showReleaseToAi && (
        <ButtonWithSpinner
          loading={loadingAction === "release"}
          size="small"
          variant="contained"
          color="primary"
          onClick={handleReleaseToAi}
        >
          {i18n.t("aiSupervision.actions.releaseToAi")}
        </ButtonWithSpinner>
      )}
      {!observationMode &&
        showAcceptTicket &&
        (!showTabGroups || !ticket.isGroup) && (
          <ButtonWithSpinner
            loading={loadingAction === "accept"}
            size="small"
            variant="contained"
            color="primary"
            onClick={handleAcceptTicket}
          >
            {i18n.t("messagesList.header.buttons.accept")}
          </ButtonWithSpinner>
        )}
      <AiLearningCloseModal
        open={learningModalOpen}
        ticket={ticket}
        onClose={() => setLearningModalOpen(false)}
        onComplete={handleLearningComplete}
      />
    </div>
  );
};

export default TicketActionButtonsCustom;
