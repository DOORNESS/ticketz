import React, { useState, useEffect } from "react";

import { Avatar, CardHeader } from "@material-ui/core";
import { Lightbox } from "react-modal-image";

import { i18n } from "../../translate/i18n";
import {
  formatWhatsappContactName,
  formatWhatsappContactNumber
} from "../../helpers/formatWhatsappDisplay";
import { getInitials } from "../../helpers/getInitials";
import { generateColor } from "../../helpers/colorGenerator";
import BrandBadge from "../BrandBadge";

const TicketInfo = ({ contact, ticket, onClick }) => {
  const { user } = ticket;
  const [userName, setUserName] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);

  const contactName = contact ? formatWhatsappContactName(contact, ticket) : "";
  const truncatedContactName =
    document.body.offsetWidth < 600 && contactName.length > 10
      ? contactName.substring(0, 10) + "..."
      : contactName;
  const contactNumber = contact ? formatWhatsappContactNumber(contact) : "";
  const conversationTitle = [
    contactNumber,
    truncatedContactName,
    `Ticket #${ticket.id}`
  ]
    .filter(Boolean)
    .join(" · ");

  useEffect(() => {
    if (user && contact) {
      setUserName(`${i18n.t("messagesList.header.assignedTo")} ${user.name}`);

      if (document.body.offsetWidth < 600) {
        setUserName(`${user.name}`);
      }
    }
  }, [contact, user]);

  // Origem do atendimento sempre visível: marca · conexão · fila.
  const originLine = [
    ticket.brand?.name,
    ticket.whatsapp?.name,
    ticket.queue?.name
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {avatarOpen && (
        <Lightbox
          medium={contact.profileHiresPictureUrl || contact.profilePicUrl}
          large={contact.profileHiresPictureUrl || contact.profilePicUrl}
          onClose={() => setAvatarOpen(false)}
        />
      )}
      <CardHeader
        onClick={onClick}
        style={{ cursor: "pointer" }}
        titleTypographyProps={{ noWrap: true }}
        subheaderTypographyProps={{ noWrap: true }}
        avatar={
          <Avatar
            style={{
              backgroundColor: generateColor(contact?.number),
              color: "white",
              fontWeight: "bold"
            }}
            src={contact.profilePicUrl}
            alt="contact_image"
            onClick={e => {
              e.stopPropagation();
              setAvatarOpen(true);
            }}
          >
            {getInitials(contactName)}
          </Avatar>
        }
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <BrandBadge brand={ticket.brand} />
            <span>{conversationTitle}</span>
          </span>
        }
        subheader={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {originLine}
            {ticket.user ? <span>· {userName}</span> : null}
          </span>
        }
      />
    </>
  );
};

export default TicketInfo;
