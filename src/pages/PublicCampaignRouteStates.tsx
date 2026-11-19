import { useTranslation } from "../i18n";
export function PublicCampaignNotFound({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">{t("public.notFound.eyebrow")}</span>
        <h1>{t("public.notFound.title")}</h1>
        <p>{t("public.notFound.description")}</p>
        <div className="button-row">
          <button
            className="primary-button"
            type="button"
            onClick={onRetry ?? (() => window.location.reload())}
          >
            {t("public.notFound.retry")}
          </button>
          <a className="secondary-link-button" href="/">
            {t("public.notFound.home")}
          </a>
        </div>
      </section>
    </main>
  );
}

export function PublicCampaignLoading({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <main className="public-only-shell">
      <section className="empty-state public-not-found">
        <span className="eyebrow">{t("public.loading.eyebrow")}</span>
        <h1>{t("public.loading.title")}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
