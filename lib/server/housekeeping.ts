import "server-only";
import { db } from "./db";

/**
 * Data minimisation, run daily by the cron route:
 * - throttling counters (keys contain IP addresses and emails) a day after their window ends;
 * - emailed links (password reset, verify, invite) 30 days after they were used or expired.
 */
export async function purgeExpiredRecords(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 86400000);
  const monthAgo = new Date(now.getTime() - 30 * 86400000);
  const [rateLimits, resetTokens, emailTokens] = await Promise.all([
    db.rateLimit.deleteMany({ where: { resetAt: { lt: dayAgo } } }),
    db.passwordResetToken.deleteMany({ where: { OR: [{ usedAt: { lt: monthAgo } }, { expiresAt: { lt: monthAgo } }] } }),
    db.emailToken.deleteMany({ where: { OR: [{ usedAt: { lt: monthAgo } }, { expiresAt: { lt: monthAgo } }] } }),
  ]);
  return { rateLimits: rateLimits.count, resetTokens: resetTokens.count, emailTokens: emailTokens.count };
}
