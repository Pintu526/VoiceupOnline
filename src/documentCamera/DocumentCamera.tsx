import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  analyzeDocumentPixels,
  calculateFrameMotion,
  canCaptureDocument,
  classifyDocumentQuality,
  type DocumentImageQuality,
  type RgbaPixelSource
} from "../documentIntelligence/quality.ts";
import { captureCorrectedDocumentFrame } from "./capture.ts";
import { CAMERA_UNAVAILABLE_MESSAGE, requestCompatibleCamera } from "./compatibility.ts";

interface DocumentCameraProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const STATUS_LABELS = {
  document_not_detected: "Document not detected",
  poor: "Poor quality",
  almost_ready: "Almost ready",
  ready: "Ready to capture"
} as const;

export function DocumentCamera({ onCapture, onClose }: DocumentCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previousFrameRef = useRef<RgbaPixelSource | null>(null);
  const steadyFramesRef = useRef(0);
  const [quality, setQuality] = useState<DocumentImageQuality | null>(null);
  const [steady, setSteady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;
    async function startCamera() {
      try {
        const stream = await requestCompatibleCamera(navigator.mediaDevices);
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        intervalId = window.setInterval(() => {
          if (!video.videoWidth || !video.videoHeight) return;
          const canvas = document.createElement("canvas");
          const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
          canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = context.getImageData(0, 0, canvas.width, canvas.height);
          const nextQuality = analyzeDocumentPixels(frame);
          const motion = calculateFrameMotion(previousFrameRef.current, frame);
          previousFrameRef.current = frame;
          steadyFramesRef.current = motion < 4 ? steadyFramesRef.current + 1 : 0;
          const nextSteady = steadyFramesRef.current >= 3;
          setSteady(nextSteady);
          setQuality({
            ...nextQuality,
            status: classifyDocumentQuality(nextQuality, nextSteady)
          });
        }, 350);
      } catch {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setCameraError(CAMERA_UNAVAILABLE_MESSAGE);
      }
    }
    void startCamera();
    return () => {
      cancelled = true;
      if (intervalId !== undefined) window.clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const status = quality?.status ?? "document_not_detected";
  const captureEnabled = Boolean(quality && quality.corners && canCaptureDocument(quality, steady));
  const guideStyle = quality?.corners ? {
    left: `${quality.corners.topLeft.x * 100}%`,
    top: `${quality.corners.topLeft.y * 100}%`,
    width: `${(quality.corners.topRight.x - quality.corners.topLeft.x) * 100}%`,
    height: `${(quality.corners.bottomLeft.y - quality.corners.topLeft.y) * 100}%`
  } : undefined;

  async function capture() {
    if (!captureEnabled || !quality?.corners || !videoRef.current) return;
    setCapturing(true);
    try {
      const file = await captureCorrectedDocumentFrame(videoRef.current, quality.corners);
      onCapture(file);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Document capture failed.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="document-camera" role="dialog" aria-modal="true" aria-label="VoiceUp Document Camera">
      <div className="document-camera-toolbar">
        <strong>VoiceUp Document Camera</strong>
        <button type="button" className="secondary-button" onClick={onClose} aria-label="Close camera">
          <X size={20} />
        </button>
      </div>
      <div className="document-camera-viewport" data-quality-status={status}>
        <video ref={videoRef} playsInline muted aria-label="Live document camera preview" />
        <div className="document-camera-guide" style={guideStyle} aria-hidden="true" />
      </div>
      <div className="document-camera-quality" data-quality-status={status}>
        <strong>{STATUS_LABELS[status]}</strong>
        <span>Quality {quality?.overallScore ?? 0}%</span>
      </div>
      {quality && (
        <div className="document-camera-metrics">
          <span>Blur {quality.blurScore}%</span>
          <span>Brightness {quality.brightnessScore}%</span>
          <span>Contrast {quality.contrastScore}%</span>
          <span>{quality.pageInsideFrame ? "Page inside frame" : "Position page inside frame"}</span>
          <span>{steady ? "Camera steady" : "Hold camera steady"}</span>
        </div>
      )}
      {quality?.warnings.map((warning) => (
        <p className="warning-message" key={warning}>{warning}</p>
      ))}
      {cameraError && <p className="error-message document-camera-unavailable">{cameraError}</p>}
      <button
        className="document-camera-capture"
        type="button"
        disabled={!captureEnabled || capturing}
        onClick={() => void capture()}
      >
        <Camera size={24} /> {capturing ? "Processing..." : "Capture document"}
      </button>
    </div>
  );
}
