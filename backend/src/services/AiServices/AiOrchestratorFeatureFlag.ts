import { GetCompanySetting } from "../../helpers/CheckSettings";
import { isGlobalOrchestratorEnabled } from "./AiOrchestratorConfig";

export const isOrchestratorEnabledForCompany = async (
  companyId: number
): Promise<boolean> => {
  if (!isGlobalOrchestratorEnabled()) {
    return false;
  }

  const companyFlag = await GetCompanySetting(
    companyId,
    "aiOrchestratorEnabled",
    "disabled"
  );

  return String(companyFlag).trim().toLowerCase() === "enabled";
};
