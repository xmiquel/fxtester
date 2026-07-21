const CLIENT_EVENT_URL = "/api/client-events";

const CLIENT_EVENT_KIND = {
  API_FAILURE: "api_failure",
  UNHANDLED_ERROR: "unhandled_error",
  UNHANDLED_REJECTION: "unhandled_rejection",
} as const;

type ClientEventKind = (typeof CLIENT_EVENT_KIND)[keyof typeof CLIENT_EVENT_KIND];

interface ClientEventPayload {
  kind: ClientEventKind;
  message: string;
  path: string;
}

function messageFrom(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export function reportClientEvent(kind: ClientEventKind, reason: unknown): void {
  const payload: ClientEventPayload = {
    kind,
    message: messageFrom(reason).slice(0, 1000),
    path: window.location.pathname,
  };

  void fetch(CLIENT_EVENT_URL, {
    body: JSON.stringify(payload),
    headers: { "content-type": "application/json" },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
}

export function installClientObservability(): void {
  window.addEventListener("error", (event) => {
    reportClientEvent(CLIENT_EVENT_KIND.UNHANDLED_ERROR, event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientEvent(CLIENT_EVENT_KIND.UNHANDLED_REJECTION, event.reason);
  });
}

export { CLIENT_EVENT_KIND };
