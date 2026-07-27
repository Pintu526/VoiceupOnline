import { Camera, ImagePlus, RotateCw, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface PublicSupporterPhotoCopy {
  title: string;
  help: string;
  selfie: string;
  rearCamera: string;
  choosePhoto: string;
  skip: string;
  retake: string;
  rotate: string;
  crop: string;
  lighting: string;
  upload: string;
  uploading: string;
  uploaded: string;
  invalidImage: string;
  uploadFailed: string;
}

interface PublicSupporterPhotoProps {
  copy: PublicSupporterPhotoCopy;
  onUpload: (file: File) => Promise<void>;
  onSkip: () => void;
}

const MAX_PUBLIC_PHOTO_BYTES = 5 * 1024 * 1024;
const OUTPUT_PHOTO_SIZE = 900;

export async function preparePublicSupporterPhoto(
  file: File,
  rotationDegrees: number,
  cropZoom: number
): Promise<File> {
  if (
    typeof document === "undefined"
    || typeof createImageBitmap === "undefined"
    || !file.type.startsWith("image/")
  ) return file;

  const image = await createImageBitmap(file);
  try {
    const zoom = Math.min(2.5, Math.max(1, cropZoom));
    const sourceSize = Math.max(1, Math.min(image.width, image.height) / zoom);
    const sourceX = Math.max(0, (image.width - sourceSize) / 2);
    const sourceY = Math.max(0, (image.height - sourceSize) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PHOTO_SIZE;
    canvas.height = OUTPUT_PHOTO_SIZE;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.translate(OUTPUT_PHOTO_SIZE / 2, OUTPUT_PHOTO_SIZE / 2);
    context.rotate((((rotationDegrees % 360) + 360) % 360 * Math.PI) / 180);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      -OUTPUT_PHOTO_SIZE / 2,
      -OUTPUT_PHOTO_SIZE / 2,
      OUTPUT_PHOTO_SIZE,
      OUTPUT_PHOTO_SIZE
    );

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.84)
    );
    if (!blob) return file;
    return new File([blob], "supporter-profile.jpg", {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } finally {
    image.close();
  }
}

export function PublicSupporterPhoto({
  copy,
  onUpload,
  onSkip
}: PublicSupporterPhotoProps) {
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const rearInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [rotation, setRotation] = useState(0);
  const [cropZoom, setCropZoom] = useState(1);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function chooseFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_PUBLIC_PHOTO_BYTES) {
      setMessage(copy.invalidImage);
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRotation(0);
    setCropZoom(1);
    setProgress(0);
    setMessage("");
  }

  async function uploadPhoto() {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setMessage("");
    setProgress(25);
    try {
      const prepared = await preparePublicSupporterPhoto(selectedFile, rotation, cropZoom);
      setProgress(65);
      await onUpload(prepared);
      setProgress(100);
      setMessage(copy.uploaded);
    } catch {
      setProgress(0);
      setMessage(copy.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="public-supporter-photo" aria-labelledby="public-photo-title">
      <div>
        <span className="eyebrow">{copy.title}</span>
        <h3 id="public-photo-title">{copy.help}</h3>
      </div>
      <p className="public-photo-guidance">{copy.lighting}</p>
      <div className="public-photo-source-actions">
        <button type="button" className="secondary-button" onClick={() => selfieInputRef.current?.click()}>
          <Camera size={18} /> {copy.selfie}
        </button>
        <button type="button" className="secondary-button" onClick={() => rearInputRef.current?.click()}>
          <Camera size={18} /> {copy.rearCamera}
        </button>
        <button type="button" className="secondary-button" onClick={() => uploadInputRef.current?.click()}>
          <ImagePlus size={18} /> {copy.choosePhoto}
        </button>
        <button type="button" className="secondary-button" onClick={onSkip}>{copy.skip}</button>
      </div>
      <input
        ref={selfieInputRef}
        className="visually-hidden-file"
        type="file"
        accept="image/*"
        capture="user"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={rearInputRef}
        className="visually-hidden-file"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={uploadInputRef}
        className="visually-hidden-file"
        type="file"
        accept="image/*"
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {previewUrl && (
        <div className="public-photo-editor">
          <div className="public-photo-preview">
            <img
              src={previewUrl}
              alt={copy.title}
              style={{ transform: `scale(${cropZoom}) rotate(${rotation}deg)` }}
            />
          </div>
          <label>
            <span>{copy.crop}</span>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={cropZoom}
              onChange={(event) => setCropZoom(Number(event.target.value))}
            />
          </label>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setRotation((value) => (value + 90) % 360)}>
              <RotateCw size={18} /> {copy.rotate}
            </button>
            <button type="button" className="secondary-button" onClick={() => uploadInputRef.current?.click()}>
              {copy.retake}
            </button>
            <button type="button" className="primary-button" disabled={uploading} onClick={() => void uploadPhoto()}>
              <UploadCloud size={18} /> {uploading ? copy.uploading : copy.upload}
            </button>
          </div>
        </div>
      )}
      {progress > 0 && <progress max={100} value={progress}>{progress}%</progress>}
      {message && <p className={progress === 100 ? "success-message" : "info-message"}>{message}</p>}
    </section>
  );
}
