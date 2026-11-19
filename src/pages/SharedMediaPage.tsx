import { useEffect, useState } from "react";

export default function SharedMediaPage() {
  const code = window.location.pathname.match(/^\/m\/([0-9a-f]{24})\/?$/)?.[1] ?? "";
  const [media, setMedia] = useState<{ url: string; caption: string; mediaType: string } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const endpoint = import.meta.env.VITE_SUPABASE_URL;
    if (!code || !endpoint || !/^https:\/\//.test(endpoint)) {
      setError("This media link is invalid or unavailable."); return;
    }
    fetch(`${endpoint}/functions/v1/voiceup-media-share?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("This media is no longer available for sharing.");
        return response.json();
      })
      .then((result) => { if (active) setMedia(result); })
      .catch(() => { if (active) setError("This media is no longer available for sharing."); });
    return () => { active = false; };
  }, [code]);
  return <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "clamp(20px,5vw,64px)", fontFamily: "system-ui, sans-serif", color: "#183049" }}>
    <div style={{ maxWidth: 850, margin: "auto", background: "white", borderRadius: 22, padding: "clamp(20px,4vw,40px)", boxShadow: "0 14px 50px #17385b17" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <strong style={{ fontSize: 24 }}>VoiceUp <span style={{ color: "#13866b" }}>Global</span></strong>
        <a href="/" style={{ color: "#126a8b" }}>Visit VoiceUp</a>
      </header>
      <h1 style={{ fontSize: 24 }}>Campaign media</h1>
      {error ? <p role="alert">{error}</p> : !media ? <p>Checking media approval…</p> : <>
        {media.mediaType === "video"
          ? <video src={media.url} controls playsInline style={{ width: "100%", maxHeight: "70vh", borderRadius: 12 }} />
          : <img src={media.url} alt={media.caption || "Approved campaign media"} style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", borderRadius: 12 }} />}
        {media.caption && <p style={{ fontSize: 17 }}>{media.caption}</p>}
        <p style={{ fontSize: 13, color: "#52677d" }}>Shared with permission by a VoiceUp supporter.</p>
      </>}
    </div>
  </main>;
}
