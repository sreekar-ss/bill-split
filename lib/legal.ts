/** Shared facts for the privacy policy and terms. Update LEGAL_UPDATED when either page changes. */
export const LEGAL_UPDATED = "November 14, 2026";
/** Where people send privacy requests and questions. Set LEGAL_CONTACT_EMAIL in the environment. */
export const legalContactEmail = () => process.env.LEGAL_CONTACT_EMAIL?.trim() || null;
