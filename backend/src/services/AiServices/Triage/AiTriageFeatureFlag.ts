import { GetCompanySetting } from "../../../helpers/CheckSettings";

export const isTriageV2EnabledForCompany = async (
  companyId: number
): Promise<boolean> => {
  if (process.env.AI_TRIAGE_V2_ENABLED === "false") {
    return false;
  }

  if (process.env.AI_TRIAGE_V2_ENABLED === "true") {
    return true;
  }

  const setting = await GetCompanySetting(
    companyId,
    "aiTriageV2Enabled",
    "disabled"
  );

  return setting === "enabled";
};
