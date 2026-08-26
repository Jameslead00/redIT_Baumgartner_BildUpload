export const REPORTING_ALLOWED_USERS = [
  "sbaumgartner",
  "redadmin",
] as const;

export type ReportingAccountLike = {
  username?: string;
  preferred_username?: string;
  userName?: string;
  name?: string;
};

export function normalizeReportingUserId(account: ReportingAccountLike | null | undefined): string {
  const candidate = account?.username ?? account?.preferred_username ?? account?.userName ?? account?.name ?? "";
  if (!candidate) {
    return "";
  }

  return candidate.toLowerCase().trim().split("@")[0];
}

export function isReportingUserAllowed(account: ReportingAccountLike | null | undefined): boolean {
  const normalized = normalizeReportingUserId(account);
  if (!normalized) {
    return false;
  }

  return REPORTING_ALLOWED_USERS.some((allowedUser) => allowedUser === normalized);
}
