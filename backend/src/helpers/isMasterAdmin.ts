import User from "../models/User";
import AppError from "../errors/AppError";

const DEFAULT_MASTER_ADMIN_EMAILS = ["fernandofortmax@gmail.com"];

export const getMasterAdminEmails = (): string[] => {
  const fromEnv = process.env.MASTER_ADMIN_EMAILS;
  if (fromEnv?.trim()) {
    return fromEnv
      .split(",")
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);
  }
  return DEFAULT_MASTER_ADMIN_EMAILS;
};

type MasterAdminCandidate = {
  email?: string | null;
  super?: boolean | null;
  profile?: string | null;
};

export const isMasterAdminUser = (
  user?: MasterAdminCandidate | null
): boolean => {
  if (!user) {
    return false;
  }

  if (user.super || user.profile === "admin") {
    return true;
  }

  const email = (user.email || "").trim().toLowerCase();
  if (!email) {
    return false;
  }

  return getMasterAdminEmails().includes(email);
};

export const loadMasterAdminUser = async (
  userId: string | number
): Promise<User | null> =>
  User.findByPk(userId, {
    attributes: ["id", "email", "profile", "super", "companyId"]
  });

export const assertMasterAdmin = async (
  userId: string | number
): Promise<User> => {
  const user = await loadMasterAdminUser(userId);
  if (!user || !isMasterAdminUser(user)) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }
  return user;
};
