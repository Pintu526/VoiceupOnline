import { useEffect, useState } from "react";
import { CheckCircle2, SearchX, ShieldCheck, XCircle } from "lucide-react";
import { LanguageSwitcher, useTranslation } from "../i18n";
import { verifyPublicCertificate } from "./api";
import { certificateCopy } from "./copy";
import type { PublicCertificateVerification } from "./types";
export function CertificateVerificationPage({ certificateId, verificationReference }: { certificateId: string; verificationReference: string }) {
  const { language } = useTranslation(), copy = certificateCopy[language]; const [result, setResult] = useState<PublicCertificateVerification | null>(null);
  useEffect(() => { let active = true; void verifyPublicCertificate(certificateId, verificationReference).then((next) => { if (active) setResult(next); }).catch(() => { if (active) setResult({ status: "not_found" }); }); return () => { active = false; }; }, [certificateId, verificationReference]);
  const Icon = !result ? ShieldCheck : result.status === "valid" ? CheckCircle2 : result.status === "revoked" ? XCircle : SearchX;
  return <main className="certificate-verification-page"><header><a className="brand" href="/"><strong>VoiceUp</strong><small>Campaign Management</small></a><LanguageSwitcher /></header><section className={`certificate-verification-card certificate-verification-${result?.status ?? "loading"}`}><Icon size={48} /><span className="eyebrow">VoiceUp public verification</span><h1>{copy.verifyTitle}</h1>{!result ? <p>{copy.verifying}</p> : <><h2>{result.status === "valid" ? copy.verified : result.status === "revoked" ? copy.revokedMessage : copy.notFound}</h2>{result.status !== "not_found" && <dl><div><dt>{copy.campaign}</dt><dd>{result.campaignName}</dd></div><div><dt>{copy.certificateId}</dt><dd>{result.certificateId}</dd></div><div><dt>{copy.participation}</dt><dd>{result.participationDate ? new Date(result.participationDate).toLocaleDateString() : "—"}</dd></div><div><dt>{copy.issuance}</dt><dd>{result.issuedAt ? new Date(result.issuedAt).toLocaleDateString() : "—"}</dd></div></dl>}<p className="certificate-public-safe"><ShieldCheck size={16} /> {copy.publicSafe}</p></>}</section></main>;
}

