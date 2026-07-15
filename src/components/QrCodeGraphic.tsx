import { createQrMatrix, QR_QUIET_ZONE_MODULES } from "../utils/qr";
import { useTranslation } from "../i18n";
import "./QrCodeGraphic.css";

interface QrCodeGraphicProps {
  value: string;
  label: string;
  className?: string;
}

export function QrCodeGraphic({ value, label, className = "" }: QrCodeGraphicProps) {
  const { t } = useTranslation();
  const matrix = createQrMatrix(value);
  if (!matrix) {
    return (
      <div className={`qr-code-error ${className}`.trim()} role="status">
        {t("campaignAdmin.links.slugRequired")}
      </div>
    );
  }

  const totalModules = matrix.size + QR_QUIET_ZONE_MODULES * 2;
  return (
    <svg
      aria-label={label}
      className={`qr-code-graphic ${className}`.trim()}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${totalModules} ${totalModules}`}
    >
      <rect width={totalModules} height={totalModules} fill="#ffffff" />
      <g fill="#071f4e" transform={`translate(${QR_QUIET_ZONE_MODULES} ${QR_QUIET_ZONE_MODULES})`}>
        {matrix.cells.map((dark, index) => {
          if (!dark) return null;
          const row = Math.floor(index / matrix.size);
          const column = index % matrix.size;
          return <rect height="1" key={index} width="1" x={column} y={row} />;
        })}
      </g>
    </svg>
  );
}
