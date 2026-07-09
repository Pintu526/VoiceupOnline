import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "../monitoring";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, {
      source: "react-error-boundary",
      componentStack: info.componentStack
    });
  }

  render() {
    if (this.state.error) {
      return (
        <main
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            justifyContent: "center",
            minHeight: "100vh",
            padding: "32px",
            textAlign: "center"
          }}
        >
          <strong style={{ fontSize: "1.4rem" }}>Something went wrong</strong>
          <p style={{ color: "#667085", maxWidth: "480px" }}>
            An unexpected error occurred. Please reload the page. If the problem persists,
            clear your browser storage and try again.
          </p>
          <pre
            style={{
              background: "#0f172a",
              borderRadius: "12px",
              color: "#e2e8f0",
              fontSize: "0.82rem",
              maxWidth: "600px",
              overflow: "auto",
              padding: "16px",
              textAlign: "left",
              whiteSpace: "pre-wrap",
              width: "100%"
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            style={{
              background: "#123a8c",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 700,
              padding: "12px 24px"
            }}
            type="button"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
