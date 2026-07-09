type ErrorContext = Record<string, unknown>;

declare global {
  interface Window {
    va?: (eventName: string, payload?: Record<string, unknown>) => void;
  }
}

const sentryDsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim() ?? "";

function parseSentryDsn(dsn: string) {
  try {
    const url = new URL(dsn);
    const publicKey = url.username;
    const projectId = url.pathname.replace(/^\//, "");
    if (!publicKey || !projectId) return null;
    return {
      endpoint: `${url.protocol}//${url.host}/api/${projectId}/store/?sentry_key=${publicKey}&sentry_version=7`,
      publicKey,
      projectId
    };
  } catch {
    return null;
  }
}

export function reportError(error: unknown, context: ErrorContext = {}) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error("[Voiceup] Error", error, context);

  if (typeof window !== "undefined" && window.va) {
    window.va("voiceup_error", {
      message,
      path: window.location.pathname,
      ...context
    });
  }

  const sentry = parseSentryDsn(sentryDsn);
  if (!sentry) return;

  void fetch(sentry.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_id: crypto.randomUUID().replace(/-/g, ""),
      platform: "javascript",
      logger: "voiceup-web",
      level: "error",
      message,
      exception: {
        values: [
          {
            type: error instanceof Error ? error.name : "Error",
            value: message,
            stacktrace: stack ? { frames: [{ filename: "browser", function: stack }] } : undefined
          }
        ]
      },
      request: {
        url: typeof window === "undefined" ? "" : window.location.href
      },
      extra: context
    }),
    keepalive: true
  }).catch(() => {
    // Monitoring must never interrupt the user flow.
  });
}

export function initMonitoring() {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, {
      source: "window.error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { source: "unhandledrejection" });
  });
}
