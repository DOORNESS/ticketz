import React, { useContext, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import SearchIcon from "@material-ui/icons/Search";
import InputBase from "@material-ui/core/InputBase";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Badge from "@material-ui/core/Badge";
import MoveToInboxIcon from "@material-ui/icons/MoveToInbox";
import CheckBoxIcon from "@material-ui/icons/CheckBox";
import DeleteSweepIcon from "@material-ui/icons/DeleteSweep";

import FormControlLabel from "@material-ui/core/FormControlLabel";
import Switch from "@material-ui/core/Switch";

import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsListCustom";
import TabPanel from "../TabPanel";

import { resolvePermissionRole } from "../../helpers/ticketListVisibility";
import { isMasterAdminUser } from "../../helpers/isMasterAdmin";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { Can } from "../Can";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { Box, Button } from "@material-ui/core";
import { TagsFilter } from "../TagsFilter";
import { UsersFilter } from "../UsersFilter";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import useSettings from "../../hooks/useSettings";
import { ContactSelect } from "../ContactSelect";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";

const useStyles = makeStyles(theme => ({
  ticketsWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0
  },

  tabsHeader: {
    flex: "none",
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`
  },

  settingsIcon: {
    alignSelf: "center",
    marginLeft: "auto",
    padding: 8
  },

  tabWithGroups: {
    minWidth: 80,
    width: 80
  },

  tab: {
    minWidth: 100,
    width: 100
  },

  openSubTab: {
    minWidth: 110,
    flexShrink: 0
  },

  ticketOptionsBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing(1, 1.5),
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`
  },

  serachInputWrapper: {
    flex: 1,
    display: "flex",
    borderRadius: 6,
    padding: theme.spacing(0.25, 1),
    marginRight: theme.spacing(1),
    backgroundColor: theme.palette.action.hover,
    border: `1px solid ${theme.palette.borderPrimary}`
  },

  searchIcon: {
    color: theme.palette.text.secondary,
    marginLeft: 6,
    marginRight: 6,
    alignSelf: "center"
  },

  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 30
  },

  badge: {
    right: "-10px"
  },
  show: {
    display: "block"
  },
  hide: {
    display: "none !important"
  },

  icon24: {
    width: 24,
    height: 24
  },

  aiFilterBar: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`
  },

  wipeBaseBar: {
    position: "relative",
    zIndex: 20,
    display: "flex",
    justifyContent: "stretch",
    padding: theme.spacing(1, 1.5),
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`
  },

  wipeBaseButton: {
    position: "relative",
    zIndex: 21,
    width: "100%",
    textTransform: "none",
    fontWeight: 600,
    letterSpacing: 0.2,
    pointerEvents: "auto"
  }
}));

const TicketsManagerTabs = () => {
  const classes = useStyles();
  const history = useHistory();

  const [searchParam, setSearchParam] = useState("");
  const [tab, setTab] = useState("open");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const searchInputRef = useRef();
  const { user } = useContext(AuthContext);
  const { listSubTab, setListSubTab, setCurrentTicket, refreshTicketLists } =
    useContext(TicketsContext);
  const { profile } = user || {};
  const permissionRole = resolvePermissionRole(user);
  const isSuperAdmin = user?.super === true;
  const isMasterAdmin = isMasterAdminUser(user);
  const userQueues = user?.queues ?? [];
  const tabOpen = listSubTab;

  const [openCount, setOpenCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [aiCount, setAiCount] = useState(0);
  const [wipingBase, setWipingBase] = useState(false);

  const userQueueIds = userQueues.map(q => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const [selectedContact, setSelectedContact] = useState(null);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const { getSetting } = useSettings();
  const [showTabGroups, setShowTabGroups] = useState(false);

  useEffect(() => {
    Promise.all([getSetting("CheckMsgIsGroup"), getSetting("groupsTab")]).then(
      ([ignoreGroups, groupsTab]) => {
        setShowTabGroups(
          ignoreGroups === "disabled" && groupsTab === "enabled"
        );
      }
    );
  }, []);

  useEffect(() => {
    if (isMasterAdmin) {
      setShowAllTickets(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === "search") {
      searchInputRef.current.focus();
    }
  }, [tab]);

  let searchTimeout;

  const handleSearch = e => {
    const searchedTerm = e.target.value.toLowerCase();

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      setSearchParam(searchedTerm);
    }, 500);
  };

  const handleChangeTab = (e, newValue) => {
    setTab(newValue);
  };

  const handleChangeTabOpen = (e, newValue) => {
    setListSubTab(newValue);
  };

  const applyPanelStyle = status => {
    if (tabOpen !== status) {
      return { width: 0, height: 0 };
    }
  };

  const handleCloseOrOpenTicket = ticket => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.uuid !== undefined) {
      history.push(`/tickets/${ticket.uuid}`);
    }
  };

  const handleSelectedTags = selecteds => {
    const tags = selecteds.map(t => t.id);
    setSelectedTags(tags);
  };

  const handleSelectedUsers = selecteds => {
    const users = selecteds.map(t => t.id);
    setSelectedUsers(users);
  };

  const handleWipeCustomerBase = async () => {
    setWipingBase(true);
    try {
      const { data } = await api.post("/ai/wipe-customer-base");
      const summary = data?.summary || {};
      toast.success(
        i18n.t("ticketsManager.wipeCustomerBase.success", {
          contacts: summary.contactsDeleted ?? 0,
          tickets: summary.ticketsDeleted ?? 0
        })
      );
      setCurrentTicket({ id: null, code: null, uuid: null });
      refreshTicketLists?.();
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    } finally {
      setWipingBase(false);
    }
  };

  return (
    <Paper elevation={0} variant="outlined" className={classes.ticketsWrapper}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={ticket => {
          handleCloseOrOpenTicket(ticket);
        }}
      />
      {isMasterAdmin && (
        <Paper elevation={0} square className={classes.wipeBaseBar}>
          <Button
            className={classes.wipeBaseButton}
            variant="outlined"
            color="secondary"
            startIcon={<DeleteSweepIcon />}
            disabled={wipingBase}
            onClick={handleWipeCustomerBase}
          >
            {wipingBase
              ? i18n.t("ticketsManager.wipeCustomerBase.loading")
              : i18n.t("ticketsManager.wipeCustomerBase.button")}
          </Button>
        </Paper>
      )}
      <Paper elevation={0} square className={classes.tabsHeader}>
        <Tabs
          value={tab}
          onChange={handleChangeTab}
          variant="fullWidth"
          indicatorColor="primary"
          textColor="primary"
          aria-label="icon label tabs example"
        >
          <Tab
            value={"open"}
            icon={<MoveToInboxIcon />}
            label={i18n.t("tickets.tabs.open.title")}
            classes={{
              root: showTabGroups ? classes.tabWithGroups : classes.tab
            }}
          />

          {showTabGroups && (
            <Tab
              value={"groups"}
              icon={
                <FontAwesomeIcon
                  className={classes.icon24}
                  icon={faPeopleGroup}
                />
              }
              label={i18n.t("tickets.tabs.groups.title")}
              classes={{ root: classes.tabWithGroups }}
            />
          )}

          <Tab
            value={"closed"}
            icon={<CheckBoxIcon />}
            label={i18n.t("tickets.tabs.closed.title")}
            classes={{
              root: showTabGroups ? classes.tabWithGroups : classes.tab
            }}
          />

          <Tab
            value={"search"}
            icon={<SearchIcon />}
            label={i18n.t("tickets.tabs.search.title")}
            classes={{
              root: showTabGroups ? classes.tabWithGroups : classes.tab
            }}
          />
        </Tabs>
      </Paper>
      <Paper square elevation={0} className={classes.ticketOptionsBox}>
        {tab === "search" ? (
          <div className={classes.serachInputWrapper}>
            <SearchIcon className={classes.searchIcon} />
            <InputBase
              className={classes.searchInput}
              inputRef={searchInputRef}
              placeholder={i18n.t("tickets.search.placeholder")}
              type="search"
              onChange={handleSearch}
            />
          </div>
        ) : (
          <>
            <Button
              variant="outlined"
              color="primary"
              onClick={() => setNewTicketModalOpen(true)}
            >
              {i18n.t("ticketsManager.buttons.newTicket")}
            </Button>
            {tab === "open" && (
              <Can
                role={permissionRole}
                perform="tickets-manager:showall"
                yes={() => (
                  <FormControlLabel
                    label={i18n.t("tickets.buttons.showAll")}
                    labelPlacement="start"
                    control={
                      <Switch
                        size="small"
                        checked={showAllTickets}
                        onChange={() =>
                          setShowAllTickets(prevState => !prevState)
                        }
                        name="showAllTickets"
                        color="primary"
                      />
                    }
                  />
                )}
              />
            )}
          </>
        )}
        <TicketsQueueSelect
          style={{ marginLeft: 6 }}
          selectedQueueIds={selectedQueueIds}
          userQueues={user?.queues}
          onChange={values => setSelectedQueueIds(values)}
        />
      </Paper>
      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        <Tabs
          value={tabOpen}
          onChange={handleChangeTabOpen}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab
            className={classes.openSubTab}
            label={
              <Badge
                className={classes.badge}
                badgeContent={openCount}
                color="primary"
                max={999}
              >
                {i18n.t("ticketsList.assignedHeader")}
              </Badge>
            }
            value={"open"}
          />
          <Tab
            className={classes.openSubTab}
            label={
              <Badge
                className={classes.badge}
                badgeContent={pendingCount}
                color="secondary"
                max={999}
              >
                {i18n.t("ticketsList.pendingHeader")}
              </Badge>
            }
            value={"pending"}
          />
          <Tab
            className={classes.openSubTab}
            label={
              <Badge
                className={classes.badge}
                badgeContent={aiCount}
                color="primary"
                max={999}
              >
                {i18n.t("aiSupervision.tabTitle")}
              </Badge>
            }
            value={"ai"}
          />
        </Tabs>
        <Paper className={classes.ticketsWrapper}>
          <TicketsList
            status="open"
            showAll={showAllTickets || user?.super}
            supervision={isMasterAdmin}
            selectedQueueIds={selectedQueueIds}
            updateCount={val => setOpenCount(val)}
            style={applyPanelStyle("open")}
            setTabOpen={setListSubTab}
            showTabGroups={showTabGroups}
          />
          <TicketsList
            status="pending"
            supervision={isMasterAdmin}
            selectedQueueIds={selectedQueueIds}
            updateCount={val => setPendingCount(val)}
            style={applyPanelStyle("pending")}
            setTabOpen={setListSubTab}
            showTabGroups={showTabGroups}
          />
          <TicketsList
            listMode="ai"
            aiFilter={isMasterAdmin ? "ai_supervision" : "ai_handling"}
            supervision={isMasterAdmin}
            selectedQueueIds={selectedQueueIds}
            updateCount={val => setAiCount(val)}
            style={applyPanelStyle("ai")}
            setTabOpen={setListSubTab}
            showTabGroups={showTabGroups}
          />
        </Paper>
      </TabPanel>
      <TabPanel value={tab} name="closed" className={classes.ticketsWrapper}>
        <TicketsList
          status="closed"
          showAll={true}
          selectedQueueIds={selectedQueueIds}
          showTabGroups={showTabGroups}
        />
      </TabPanel>
      <TabPanel value={tab} name="groups" className={classes.ticketsWrapper}>
        <TicketsList
          groups={true}
          showAll={true}
          selectedQueueIds={selectedQueueIds}
          showTabGroups={showTabGroups}
        />
      </TabPanel>
      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        <Box style={{ paddingRight: 10, paddingLeft: 10 }}>
          <ContactSelect
            onSelected={contactId => {
              setSelectedContact(contactId);
            }}
            allowCreate={false}
          />
        </Box>
        <TagsFilter onFiltered={handleSelectedTags} />
        {(profile === "admin" || user?.super) && (
          <UsersFilter onFiltered={handleSelectedUsers} />
        )}
        <TicketsList
          isSearch={true}
          searchParam={searchParam}
          showAll={true}
          contactId={selectedContact}
          tags={selectedTags}
          users={selectedUsers}
          selectedQueueIds={selectedQueueIds}
          showTabGroups={showTabGroups}
        />
      </TabPanel>
    </Paper>
  );
};

export default TicketsManagerTabs;
