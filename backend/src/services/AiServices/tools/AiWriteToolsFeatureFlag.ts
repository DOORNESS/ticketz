import { GetCompanySetting } from "../../../helpers/CheckSettings";
import { isToolsEnabledForCompany } from "./AiToolsFeatureFlag";

export const isGlobalWriteToolsEnabled = (): boolean =>
  ["true", "1", "yes", "enabled"].includes(
    String(process.env.AI_WRITE_TOOLS_ENABLED || "")
      .trim()
      .toLowerCase()
  );

export const isWriteToolsEnabledForCompany = async (
  companyId: number
): Promise<boolean> => {
  if (!isGlobalWriteToolsEnabled()) {
    return false;
  }

  const toolsEnabled = await isToolsEnabledForCompany(companyId);
  if (!toolsEnabled) {
    return false;
  }

  const companyFlag = await GetCompanySetting(
    companyId,
    "aiWriteToolsEnabled",
    "disabled"
  );

  return String(companyFlag).trim().toLowerCase() === "enabled";
};

export const getWriteToolsStatus = async (
  companyId: number
): Promise<{ global: boolean; company: boolean; active: boolean }> => {
  const global = isGlobalWriteToolsEnabled();
  const company = global
    ? (await GetCompanySetting(
        companyId,
        "aiWriteToolsEnabled",
        "disabled"
      )) === "enabled"
    : false;

  return { global, company, active: global && company };
};
