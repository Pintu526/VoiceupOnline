const DEVELOPMENT_PREVIEW_ORIGIN = "https://voiceup-development.vercel.app";
const DEVELOPMENT_PREVIEW_HOST = /^voiceup-development-[a-z0-9]+-debasish1\.vercel\.app$/i;

export function getSaasAdminPasswordRecoveryRedirectTo(origin: string): string {
  const parsedOrigin = new URL(origin);
  const redirectOrigin = DEVELOPMENT_PREVIEW_HOST.test(parsedOrigin.hostname)
    ? DEVELOPMENT_PREVIEW_ORIGIN
    : parsedOrigin.origin;
  return new URL("/admin/reset-password", redirectOrigin).toString();
}
