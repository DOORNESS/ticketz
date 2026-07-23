import { Sequelize } from "sequelize-typescript";
import User from "../models/User";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import ContactTag from "../models/ContactTag";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import WhatsappLidMap from "../models/WhatsappLidMap";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import OldMessage from "../models/OldMessage";
import Queue from "../models/Queue";
import WhatsappQueue from "../models/WhatsappQueue";
import UserQueue from "../models/UserQueue";
import Company from "../models/Company";
import Plan from "../models/Plan";
import TicketNote from "../models/TicketNote";
import QuickMessage from "../models/QuickMessage";
import Help from "../models/Help";
import TicketTraking from "../models/TicketTraking";
import Counter from "../models/Counter";
import UserRating from "../models/UserRating";
import QueueOption from "../models/QueueOption";
import Schedule from "../models/Schedule";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Campaign from "../models/Campaign";
import CampaignSetting from "../models/CampaignSetting";
import BaileysContact from "../models/BaileysContact";
import CampaignShipping from "../models/CampaignShipping";
import Announcement from "../models/Announcement";
import Chat from "../models/Chat";
import ChatUser from "../models/ChatUser";
import ChatMessage from "../models/ChatMessage";
import Invoices from "../models/Invoices";
import Subscriptions from "../models/Subscriptions";
import BaileysKeys from "../models/BaileysKeys";
import UserSocketSession from "../models/UserSocketSession";
import OutOfTicketMessage from "../models/OutOfTicketMessages";
import Translation from "../models/Translation";
import Wavoip from "../models/Wavoip";
import AiAgent from "../models/AiAgent";
import AiAgentQueue from "../models/AiAgentQueue";
import AiAgentKnowledgeBase from "../models/AiAgentKnowledgeBase";
import KnowledgeBase from "../models/KnowledgeBase";
import KnowledgeDocument from "../models/KnowledgeDocument";
import KnowledgeChunk from "../models/KnowledgeChunk";
import KnowledgeDomain from "../models/KnowledgeDomain";
import KnowledgeCategory from "../models/KnowledgeCategory";
import KnowledgeAsset from "../models/KnowledgeAsset";
import KnowledgeAssetVersion from "../models/KnowledgeAssetVersion";
import KnowledgePermission from "../models/KnowledgePermission";
import KnowledgeIngestionJob from "../models/KnowledgeIngestionJob";
import AiConversationLog from "../models/AiConversationLog";
import MessageMediaFile from "../models/MessageMediaFile";
import MediaDeletionAudit from "../models/MediaDeletionAudit";
import AiCopilotSuggestion from "../models/AiCopilotSuggestion";
import AiKnowledgeSuggestion from "../models/AiKnowledgeSuggestion";
import AiReplayLog from "../models/AiReplayLog";
import AiRoutingLog from "../models/AiRoutingLog";
import ContactAiMemory from "../models/ContactAiMemory";
import ContactAiMemoryJob from "../models/ContactAiMemoryJob";
import ContactAiMemoryLog from "../models/ContactAiMemoryLog";
import AiAgentTool from "../models/AiAgentTool";
import AiToolExecutionLog from "../models/AiToolExecutionLog";
import AiToolIdempotencyRecord from "../models/AiToolIdempotencyRecord";
import AiTicketTimelineEvent from "../models/AiTicketTimelineEvent";
import ContentRepositoryItem from "../models/ContentRepositoryItem";
import ContentRepositoryItemVersion from "../models/ContentRepositoryItemVersion";
import ContentRepositoryFavorite from "../models/ContentRepositoryFavorite";
import ContentRepositoryCategory from "../models/ContentRepositoryCategory";
import ContentRepositoryUsageLog from "../models/ContentRepositoryUsageLog";
import ContentRepositoryPermission from "../models/ContentRepositoryPermission";
import AiMetricsSnapshot from "../models/AiMetricsSnapshot";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbConfig = require("../config/database");

const sequelize = new Sequelize(dbConfig);

const models = [
  Company,
  User,
  UserSocketSession,
  Contact,
  ContactTag,
  Ticket,
  Message,
  OldMessage,
  Whatsapp,
  WhatsappLidMap,
  ContactCustomField,
  Setting,
  Queue,
  WhatsappQueue,
  UserQueue,
  Plan,
  TicketNote,
  QuickMessage,
  Help,
  TicketTraking,
  Counter,
  UserRating,
  QueueOption,
  Schedule,
  Tag,
  TicketTag,
  ContactList,
  ContactListItem,
  Campaign,
  CampaignSetting,
  BaileysContact,
  BaileysKeys,
  CampaignShipping,
  Announcement,
  Chat,
  ChatUser,
  ChatMessage,
  Invoices,
  OutOfTicketMessage,
  Subscriptions,
  Translation,
  Wavoip,
  AiAgent,
  AiAgentQueue,
  AiAgentKnowledgeBase,
  KnowledgeDomain,
  KnowledgeBase,
  KnowledgeCategory,
  KnowledgeAsset,
  KnowledgeAssetVersion,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgePermission,
  KnowledgeIngestionJob,
  AiConversationLog,
  MessageMediaFile,
  MediaDeletionAudit,
  AiCopilotSuggestion,
  AiKnowledgeSuggestion,
  AiReplayLog,
  AiRoutingLog,
  ContactAiMemory,
  ContactAiMemoryJob,
  ContactAiMemoryLog,
  AiAgentTool,
  AiToolExecutionLog,
  AiMetricsSnapshot,
  AiToolIdempotencyRecord,
  AiTicketTimelineEvent,
  ContentRepositoryItem,
  ContentRepositoryItemVersion,
  ContentRepositoryFavorite,
  ContentRepositoryCategory,
  ContentRepositoryUsageLog,
  ContentRepositoryPermission
];

sequelize.addModels(models);

export default sequelize;
