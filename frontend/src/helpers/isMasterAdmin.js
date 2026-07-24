const DEFAULT_MASTER_ADMIN_EMAILS = ["fernandofortmax@gmail.com"];

export const isMasterAdminUser = user => {
  if (!user) {
    return false;
  }

  if (user.super || user.profile === "admin") {
    return true;
  }

  const email = String(user.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    return false;
  }

  return DEFAULT_MASTER_ADMIN_EMAILS.includes(email);
};
