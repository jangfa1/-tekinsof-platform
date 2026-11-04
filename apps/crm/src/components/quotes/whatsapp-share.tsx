"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

type ShareResult =
  | { ok: true; data: { url: string; fileName: string; phone: string | null } }
  | { ok: false; error: { message: string } };

// Downloads the PDF and opens the WhatsApp chat with a ready message; the seller attaches the
// file. The chat tab opens before the server call so the browser does not block it as a popup.
export function WhatsappShare({
  quoteId,
  pdfUrl,
  share,
}: {
  quoteId: string;
  pdfUrl: string;
  share: (quoteId: string) => Promise<ShareResult>;
}) {
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick() {
    const chat = window.open("about:blank", "_blank");
    startTransition(async () => {
      const result = await share(quoteId);
      if (!result.ok) {
        chat?.close();
        setMessage({ tone: "error", text: result.error.message });
        return;
      }
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = result.data.fileName;
      link.click();
      if (chat) chat.location.href = result.data.url;
      else window.location.href = result.data.url;
      setMessage({
        tone: "ok",
        text: result.data.phone
          ? "PDF descargado. Adjúntalo en el chat de WhatsApp que se abrió."
          : "PDF descargado. El contacto no tiene celular: elige el chat en WhatsApp y adjunta el PDF.",
      });
    });
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant="ghost" onClick={onClick} disabled={pending}>
        {pending ? "Preparando…" : "Enviar por WhatsApp"}
      </Button>
      <p
        aria-live="polite"
        role={message?.tone === "error" ? "alert" : "status"}
        className={`text-sm ${message?.tone === "error" ? "text-destructive" : "text-fg-muted"}`}
      >
        {message?.text}
      </p>
    </div>
  );
}
