import "server-only";

/** One transactional email layout for everything we send (DESIGN.md colours, plain-text twin). */
export interface EmailContent {
  to: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  notes?: string[];
  /** Notification emails: unsubscribe page linked in the footer… */
  unsubscribeUrl?: string;
  /** …and the RFC 8058 one-click endpoint sent in List-Unsubscribe headers (defaults to unsubscribeUrl). */
  oneClickUrl?: string;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(c: EmailContent) {
  const text = [
    c.greeting,
    "",
    ...c.paragraphs.flatMap((p) => [p, ""]),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    ...(c.notes ?? []).flatMap((n) => [n, ""]),
    ...(c.unsubscribeUrl ? [`Unsubscribe from these emails: ${c.unsubscribeUrl}`] : []),
  ]
    .join("\n")
    .trim();

  const para = (p: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5">${esc(p)}</p>`;
  const note = (n: string) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.5;color:#55627a">${esc(n)}</p>`;
  const button = c.button
    ? `<p style="margin:4px 0 20px"><a href="${esc(c.button.url)}" style="display:inline-block;background:#13213f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${esc(c.button.label)}</a></p>`
    : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#13213f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #d3dcd4;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:18px;font-weight:700">BillSplit</p>
${para(c.greeting)}${c.paragraphs.map(para).join("")}${button}${(c.notes ?? []).map(note).join("")}
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#55627a">Sent to ${esc(c.to)}${c.unsubscribeUrl ? ` · <a href="${esc(c.unsubscribeUrl)}" style="color:#55627a">Unsubscribe from these emails</a>` : ""}</p>
</td></tr></table></body></html>`;
  const headers = c.unsubscribeUrl
    ? { "List-Unsubscribe": `<${c.oneClickUrl ?? c.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;
  return { to: c.to, subject: c.subject, text, html, ...(headers ? { headers } : {}) };
}
