import AppError from "../../errors/AppError";
import User from "../../models/User";
import ContentRepositoryPermission from "../../models/ContentRepositoryPermission";

export type RepositoryPermissionAction =
  | "read"
  | "write"
  | "send"
  | "archive"
  | "publish"
  | "admin"
  | "copilot"
  | "diagnostics";

const actionRank: Record<RepositoryPermissionAction, number> = {
  read: 1,
  send: 2,
  write: 3,
  archive: 3,
  publish: 4,
  copilot: 2,
  diagnostics: 2,
  admin: 5
};

const permissionRank: Record<string, number> = {
  read: 1,
  send: 2,
  write: 3,
  archive: 3,
  publish: 4,
  copilot: 2,
  diagnostics: 2,
  admin: 5
};

const profileAllows = (
  profile: string,
  action: RepositoryPermissionAction
): boolean => {
  if (action === "read" || action === "send" || action === "copilot") {
    return true;
  }
  if (action === "diagnostics") {
    return profile === "admin" || profile === "supervisor";
  }
  return profile === "admin" || profile === "supervisor";
};

export const checkRepositoryPermission = async (
  action: RepositoryPermissionAction,
  companyId: number,
  user: Pick<User, "id" | "profile" | "companyId" | "super">,
  resourceId = 0
): Promise<boolean> => {
  if (user.companyId !== companyId) {
    return false;
  }

  if (user.super || profileAllows(user.profile, action)) {
    return true;
  }

  const rows = await ContentRepositoryPermission.findAll({
    where: {
      companyId,
      resourceType: "repository",
      resourceId,
      principalType: "profile",
      principalId: user.profile,
      active: true
    }
  });

  const required = actionRank[action];
  return rows.some(row => (permissionRank[row.permission] || 0) >= required);
};

export const assertRepositoryPermission = async (
  action: RepositoryPermissionAction,
  companyId: number,
  user: Pick<User, "id" | "profile" | "companyId" | "super">,
  resourceId = 0
): Promise<void> => {
  const allowed = await checkRepositoryPermission(
    action,
    companyId,
    user,
    resourceId
  );
  if (!allowed) {
    throw new AppError("ERR_REPOSITORY_PERMISSION_DENIED", 403);
  }
};
