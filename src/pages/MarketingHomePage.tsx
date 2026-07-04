import { motion } from "framer-motion";
import { Megaphone, Moon, Sparkles, Sun } from "lucide-react";

interface MarketingHomePageProps {
  theme: "light" | "dark";
  setTheme: React.Dispatch<React.SetStateAction<"light" | "dark">>;
}

function MarketingFeature({ title, text }: { title: string; text: string }) {
  return (
    <div className="marketing-feature">
      <Sparkles size={22} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

export function MarketingHomePage({ theme, setTheme }: MarketingHomePageProps) {
  return (
    <main className="marketing-home">
      <header className="marketing-nav">
        <div className="brand">
          <div className="brand-mark">
            <Megaphone size={24} />
          </div>
          <div>
            <strong>Voiceup Bharat</strong>
            <span>Campaigns that move people</span>
          </div>
        </div>
        <div className="button-row">
          <button
            className="secondary-button icon-button"
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <a className="secondary-link-button" href="/app">
            SaaS admin login
          </a>
        </div>
      </header>

      <motion.section
        className="marketing-hero"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <span className="eyebrow">Voice Up to make your campaign successful</span>
          <h1>
            Launch public appeals, collect verified support, and keep every participant engaged.
          </h1>
          <p>
            Voiceup Bharat helps NGOs, RWAs, associations, unions, and campaign agencies publish
            public campaigns, collect signups, scan hard-copy support, route appeals to the right
            authority, and report campaign progress.
          </p>
          <div className="button-row">
            <a className="primary-link-button" href="/app?ai=1">
              Create with AI
            </a>
            <a className="primary-link-button" href="/app">
              Start campaign workspace
            </a>
            <a className="secondary-link-button" href="#features">
              View features
            </a>
          </div>
        </div>
        <div className="marketing-hero-card">
          <span className="status-pill">India-ready SaaS</span>
          <h2>Public link stays public. Admin stays protected.</h2>
          <ul>
            <li>Public campaign pages at /c/campaign-slug</li>
            <li>Protected campaign admin at /admin/campaign-slug</li>
            <li>Global SaaS workspace at /app</li>
            <li>Supabase shared storage for WhatsApp/mobile links</li>
          </ul>
        </div>
      </motion.section>

      <section className="marketing-section" id="features">
        <span className="eyebrow">Platform modules</span>
        <div className="marketing-grid">
          <MarketingFeature
            title="Campaign publishing"
            text="Create branded appeal pages with images, video, authority target, and public signup forms."
          />
          <MarketingFeature
            title="India location hierarchy"
            text="State, district, block, panchayat/ward, and PIN-code based reporting for local campaigns."
          />
          <MarketingFeature
            title="Participant engagement"
            text="Thank-you flows, WhatsApp/SMS links, social sharing, and participant progress updates."
          />
          <MarketingFeature
            title="Reports and exports"
            text="Daily, weekly, state, district, block, and panchayat counts with PDF/CSV exports."
          />
          <MarketingFeature
            title="Hard-copy scanning"
            text="OCR-assisted import for scanned forms and review queue for paper signups."
          />
          <MarketingFeature
            title="SaaS subscriptions"
            text="Plans, limits, custom branding, custom domain, and organization-level setup."
          />
        </div>
      </section>

      <section className="marketing-section marketing-cta">
        <h2>Ready to run a campaign on Voiceup Bharat?</h2>
        <p>Login to the protected SaaS workspace to create campaigns and publish public links.</p>
        <a className="primary-link-button" href="/app">
          Login to SaaS admin
        </a>
      </section>

      <footer className="marketing-footer">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/refund">Refund policy</a>
        <a href="/data-deletion">Data deletion</a>
      </footer>
    </main>
  );
}
