export const CAMERA_UNAVAILABLE_MESSAGE =
  "Camera unavailable on this device.\nPlease upload an image.";

export const ENVIRONMENT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: "environment" },
    width: { ideal: 1920 },
    height: { ideal: 1080 }
  }
};

export const DEFAULT_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: true
};

export class CameraUnavailableError extends Error {
  constructor() {
    super(CAMERA_UNAVAILABLE_MESSAGE);
    this.name = "CameraUnavailableError";
  }
}

export async function requestCompatibleCamera(
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) throw new CameraUnavailableError();
  try {
    return await mediaDevices.getUserMedia(ENVIRONMENT_CAMERA_CONSTRAINTS);
  } catch {
    try {
      return await mediaDevices.getUserMedia(DEFAULT_CAMERA_CONSTRAINTS);
    } catch {
      throw new CameraUnavailableError();
    }
  }
}
