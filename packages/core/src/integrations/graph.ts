import { err, ok, type Result } from "../result.ts";

// Mail goes out of each seller's Outlook through Microsoft Graph (application permission scoped by
// Exchange RBAC to the commercial mailboxes). The `log` driver keeps every gate offline.

export type MailAttachment = { name: string; contentType: string; contentBase64: string };

export type MailMessage = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
};

export type SentMessage = MailMessage;

export type MailerConfig = {
  driver: "graph" | "log";
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
};

export type Mailer = {
  send(message: MailMessage): Promise<Result<void>>;
  getAccountEnabled(email: string): Promise<Result<boolean | null>>;
  outbox: SentMessage[];
};

const GRAPH = "https://graph.microsoft.com/v1.0";

export function createMailer(config: MailerConfig): Mailer {
  const outbox: SentMessage[] = [];
  if (config.driver === "log") {
    return {
      outbox,
      async send(message) {
        outbox.push(message);
        console.info(
          JSON.stringify({
            mail: "log",
            from: message.from,
            to: message.to,
            subject: message.subject,
          }),
        );
        return ok(undefined);
      },
      async getAccountEnabled() {
        return ok(true);
      },
    };
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  let cached: { token: string; expiresAt: number } | undefined;

  async function token(): Promise<Result<string>> {
    if (cached && cached.expiresAt > Date.now()) return ok(cached.token);
    const { tenantId, clientId, clientSecret } = config;
    if (!tenantId || !clientId || !clientSecret) return err("INTERNAL", "Graph no configurado");
    try {
      const res = await fetchImpl(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        {
          method: "POST",
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            scope: "https://graph.microsoft.com/.default",
            grant_type: "client_credentials",
          }),
        },
      );
      if (!res.ok) return err("INTERNAL", `Graph token ${res.status}`);
      const body = (await res.json()) as { access_token: string; expires_in: number };
      // Refresh 60 seconds before Entra says the token expires.
      cached = { token: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
      return ok(body.access_token);
    } catch (error) {
      return err("INTERNAL", `Graph token: ${(error as Error).message}`);
    }
  }

  return {
    outbox,
    async send(message) {
      const auth = await token();
      if (!auth.ok) return auth;
      const payload = {
        message: {
          subject: message.subject,
          body: { contentType: "HTML", content: message.html },
          toRecipients: message.to.map((address) => ({ emailAddress: { address } })),
          ...(message.replyTo ? { replyTo: [{ emailAddress: { address: message.replyTo } }] } : {}),
          ...(message.attachments?.length
            ? {
                attachments: message.attachments.map((a) => ({
                  "@odata.type": "#microsoft.graph.fileAttachment",
                  name: a.name,
                  contentType: a.contentType,
                  contentBytes: a.contentBase64,
                })),
              }
            : {}),
        },
        saveToSentItems: true,
      };
      try {
        const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(message.from)}/sendMail`, {
          method: "POST",
          headers: { authorization: `Bearer ${auth.data}`, "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.status !== 202) return err("INTERNAL", `Graph sendMail ${res.status}`);
        outbox.push(message);
        return ok(undefined);
      } catch (error) {
        return err("INTERNAL", `Graph sendMail: ${(error as Error).message}`);
      }
    },
    async getAccountEnabled(email) {
      const auth = await token();
      if (!auth.ok) return auth;
      try {
        const res = await fetchImpl(
          `${GRAPH}/users/${encodeURIComponent(email)}?$select=accountEnabled`,
          { headers: { authorization: `Bearer ${auth.data}` } },
        );
        if (res.status === 404) return ok(null);
        if (!res.ok) return err("INTERNAL", `Graph users ${res.status}`);
        const body = (await res.json()) as { accountEnabled?: boolean };
        return ok(body.accountEnabled === true);
      } catch (error) {
        return err("INTERNAL", `Graph users: ${(error as Error).message}`);
      }
    },
  };
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
