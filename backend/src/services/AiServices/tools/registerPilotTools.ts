import { AiTool, registerTools } from "./ToolRegistry";

let pilotToolsRegistered = false;

type ToolExport = [modulePath: string, exportName: string];

const PHASE3_TOOL_EXPORTS: ToolExport[] = [
  ["./definitions/GetTicketStatusTool", "GetTicketStatusTool"],
  ["./definitions/GetBusinessHoursTool", "GetBusinessHoursTool"],
  [
    "./definitions/SearchPublishedKnowledgeTool",
    "SearchPublishedKnowledgeTool"
  ],
  ["./definitions/RequestHumanHandoffTool", "RequestHumanHandoffTool"]
];

const PHASE4_WRITE_TOOL_EXPORTS: ToolExport[] = [
  ["./definitions/write/AddTicketTagTool", "AddTicketTagTool"],
  ["./definitions/write/UpdateTicketPriorityTool", "UpdateTicketPriorityTool"],
  ["./definitions/write/TransferTicketQueueTool", "TransferTicketQueueTool"],
  [
    "./definitions/write/CreateContactMemoryNoteTool",
    "CreateContactMemoryNoteTool"
  ],
  ["./definitions/write/ScheduleFollowupTool", "ScheduleFollowupTool"]
];

const safeRequireTool = (
  modulePath: string,
  exportName: string
): AiTool | null => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(modulePath) as Record<string, AiTool>;
    const tool = mod[exportName];
    return tool?.definition?.id ? tool : null;
  } catch {
    return null;
  }
};

const loadTools = (exports: ToolExport[]): AiTool[] =>
  exports
    .map(([modulePath, exportName]) => safeRequireTool(modulePath, exportName))
    .filter((tool): tool is AiTool => Boolean(tool));

export const ensurePilotToolsRegistered = (): void => {
  if (pilotToolsRegistered) {
    return;
  }

  const tools = [
    ...loadTools(PHASE3_TOOL_EXPORTS),
    ...loadTools(PHASE4_WRITE_TOOL_EXPORTS)
  ];

  if (!tools.length) {
    throw new Error("ai_pilot_tools_registration_failed");
  }

  registerTools(tools);
  pilotToolsRegistered = true;
};

export const isPilotToolsRegistered = (): boolean => pilotToolsRegistered;

export const resetPilotToolsRegistrationForTests = (): void => {
  pilotToolsRegistered = false;
};

export { GetTicketStatusTool } from "./definitions/GetTicketStatusTool";
export { GetBusinessHoursTool } from "./definitions/GetBusinessHoursTool";
export { SearchPublishedKnowledgeTool } from "./definitions/SearchPublishedKnowledgeTool";
export { RequestHumanHandoffTool } from "./definitions/RequestHumanHandoffTool";
