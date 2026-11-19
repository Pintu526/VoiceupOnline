import { useEffect, useRef, useState } from "react";
import type { Language } from "../i18n";
import { renderCertificateCanvas } from "./render";
import type { ParticipationCertificate } from "./types";
import "./certificate.css";

interface CertificatePreviewProps {
  certificate: ParticipationCertificate;
  language: Language;
  verificationUrl: string;
  compact?: boolean;
}

export function CertificatePreview({ certificate, language, verificationUrl, compact = false }: CertificatePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"rendering" | "ready" | "error">("rendering");

  useEffect(() => {
    let active = true;
    setStatus("rendering");
    void renderCertificateCanvas(certificate, language, verificationUrl)
      .then((rendered) => {
        if (!active || !canvasRef.current) return;
        const preview = canvasRef.current;
        preview.width = rendered.width;
        preview.height = rendered.height;
        preview.getContext("2d")?.drawImage(rendered, 0, 0);
        setStatus("ready");
      })
      .catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [certificate, language, verificationUrl]);

  return (
    <figure
      className={`certificate-preview${compact ? " certificate-preview-compact" : ""}`}
      style={{ aspectRatio: `${certificate.artwork.width} / ${certificate.artwork.height}` }}
    >
      <canvas
        ref={canvasRef}
        aria-label={`${certificate.campaignName} participation certificate in ${language}`}
        role="img"
      />
      {status === "rendering" && <figcaption className="certificate-preview-status">Rendering certificate…</figcaption>}
      {status === "error" && <figcaption className="certificate-preview-status certificate-preview-error">Certificate preview unavailable.</figcaption>}
    </figure>
  );
}

