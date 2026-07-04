import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Users,
  BarChart3,
  FileText,
  MapPin,
  Zap,
  ArrowRight,
  Star,
  Shield,
  Clock,
  Megaphone,
  Mail,
  ChevronDown,
  TrendingUp,
  PieChart,
  Activity,
  Grid3x3,
  BookOpen,
  Smartphone,
  Lock,
  Globe,
  Share2,
  Landmark,
  Building2,
  Sparkles
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
}

// SVG Hero Illustration Component
function HeroIllustration() {
  return (
    <svg viewBox="0 0 400 400" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Background circle */}
      <circle cx="200" cy="200" r="180" fill="#1e3a8a" opacity="0.1" />
      
      {/* Person with megaphone */}
      <circle cx="200" cy="120" r="25" fill="#3b82f6" />
      <rect x="170" y="150" width="60" height="50" fill="#3b82f6" rx="8" />
      <rect x="165" y="200" width="25" height="60" fill="#3b82f6" rx="6" />
      <rect x="210" y="200" width="25" height="60" fill="#3b82f6" rx="6" />
      
      {/* Megaphone */}
      <ellipse cx="280" cy="100" rx="50" ry="35" fill="#ff9933" opacity="0.8" />
      <path d="M 245 100 L 220 90 L 220 110 Z" fill="#ff9933" />
      
      {/* Rising signatures/pages */}
      <g opacity="0.6">
        <rect x="100" y="280" width="35" height="70" fill="#10b981" rx="4" />
        <rect x="150" y="240" width="35" height="110" fill="#10b981" rx="4" />
        <rect x="200" y="200" width="35" height="150" fill="#10b981" rx="4" />
        <rect x="250" y="160" width="35" height="190" fill="#10b981" rx="4" />
      </g>
      
      {/* Checkmarks */}
      <g fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round">
        <path d="M 320 180 L 330 190 L 345 170" />
        <path d="M 320 260 L 330 270 L 345 250" />
      </g>
    </svg>
  );
}

// Dashboard Preview Component
function DashboardPreview() {
  return (
    <div className="bg-gradient-to-b from-slate-950 to-slate-900 rounded-lg p-6 border border-slate-700/50 overflow-hidden">
      {/* Mock Dashboard Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg"></div>
          <span className="font-semibold text-sm">Traffic Safety Campaign</span>
        </div>
        <div className="text-xs text-slate-400">Active since Jan 15</div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Signatures", value: "2,451", icon: Users, color: "text-blue-400" },
          { label: "Target", value: "5,000", icon: Target, color: "text-green-400" },
          { label: "Progress", value: "49%", icon: TrendingUp, color: "text-purple-400" },
          { label: "Locations", value: "12", icon: MapPin, color: "text-orange-400" }
        ].map((stat, i) => (
          <div key={i} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-400">{stat.label}</span>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <div className="text-lg font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="text-slate-400">Signature Progress</span>
          <span className="text-blue-400 font-semibold">49% to goal</span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2">
          <div className="bg-gradient-to-r from-blue-500 to-blue-400 h-2 rounded-full" style={{ width: "49%" }}></div>
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <h4 className="text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wide">Recent Activity</h4>
        <div className="space-y-2">
          {[
            { name: "Rajesh Kumar", action: "signed online", time: "2 min ago" },
            { name: "Priya Sharma", action: "signed online", time: "15 min ago" },
            { name: "Batch import", action: "50 signatures scanned", time: "1 hour ago" }
          ].map((activity, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <div>
                  <span className="text-slate-300">{activity.name}</span>
                  <span className="text-slate-500 mx-1">·</span>
                  <span className="text-slate-400">{activity.action}</span>
                </div>
              </div>
              <span className="text-slate-500">{activity.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Add Target icon since it might not be in lucide
const Target = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [openFAQ, setOpenFAQ] = useState<number | null>(0);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Navigation */}
      <nav className="border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Megaphone className="w-8 h-8 text-blue-400" />
              <span className="font-bold text-lg sm:text-xl">Voiceup Bharat</span>
            </div>
            <button
              onClick={onGetStarted}
              className="px-4 sm:px-6 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold transition-colors text-sm sm:text-base"
            >
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section with Illustration */}
      <motion.section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Text Content */}
          <motion.div variants={itemVariants}>
            <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full text-xs sm:text-sm text-blue-300">
              <Zap className="w-4 h-4" />
              <span>Trusted by 500+ organizations across India</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
              Amplify Your Campaign.
              <span className="block text-blue-400 mt-2">
                Collect Signatures That Matter.
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 mb-8 max-w-2xl">
              The all-in-one platform for RWAs, NGOs, and community leaders to run powerful public campaigns, collect digital and hand-written signatures, and route them to the right authorities.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={onGetStarted}
                className="px-8 py-4 bg-blue-500 hover:bg-blue-600 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center justify-center gap-2"
              >
                Start Your Free Campaign
                <ArrowRight className="w-5 h-5" />
              </button>
              <button
                onClick={() => (window.location.href = "/app?ai=1")}
                className="px-8 py-4 bg-white text-slate-900 hover:bg-slate-100 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 inline-flex items-center justify-center gap-2"
              >
                Create with AI
                <Sparkles className="w-5 h-5" />
              </button>
              <button
                onClick={onGetStarted}
                className="px-8 py-4 border border-slate-600 hover:border-slate-400 rounded-lg font-semibold text-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                Watch Demo
                <Play className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-400 mt-6">No credit card required • Setup in 5 minutes</p>
          </motion.div>

          {/* Right: Illustration */}
          <motion.div
            variants={itemVariants}
            className="hidden md:block h-96 lg:h-full"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-3xl"></div>
              <div className="relative z-10">
                <HeroIllustration />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* How It Works Section */}
      <motion.section
        className="bg-slate-800/50 border-t border-b border-slate-700/50 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-center mb-4"
            variants={itemVariants}
          >
            How It Works in 4 Simple Steps
          </motion.h2>
          <motion.p
            className="text-slate-300 text-center mb-12 max-w-2xl mx-auto px-4"
            variants={itemVariants}
          >
            From campaign setup to authority routing, we've simplified the entire process.
          </motion.p>

          <div className="grid md:grid-cols-4 gap-6 sm:gap-8">
            {[
              {
                step: 1,
                icon: Megaphone,
                title: "Create Campaign",
                description: "Set your title, location, goal, and accept message in minutes."
              },
              {
                step: 2,
                icon: Share2,
                title: "Share & Collect",
                description: "Get instant public link + QR code. Share on WhatsApp, email, or print."
              },
              {
                step: 3,
                icon: FileText,
                title: "Signatures Online & Offline",
                description: "Collect digital signatures or scan hand-written forms with AI extraction."
              },
              {
                step: 4,
                icon: Globe,
                title: "Auto Route to Authority",
                description: "System routes signatures to District Collector, CM, or PM automatically."
              }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                className="relative"
                variants={itemVariants}
              >
                {/* Connector line */}
                {idx < 3 && (
                  <div className="hidden md:block absolute top-16 left-full w-6 h-0.5 bg-gradient-to-r from-blue-500/50 to-transparent"></div>
                )}
                <div className="bg-slate-900/50 rounded-lg p-6 border border-slate-700/50 hover:border-blue-500/30 transition-colors">
                  <div className="mb-4 inline-flex items-center justify-center w-12 h-12 bg-blue-500/20 border border-blue-500/50 rounded-lg">
                    <item.icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    <span className="text-blue-400">Step {item.step}:</span> {item.title}
                  </h3>
                  <p className="text-slate-400 text-sm">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Features Grid */}
      <motion.section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-4"
          variants={itemVariants}
        >
          Powerful Features Built for Impact
        </motion.h2>
        <motion.p
          className="text-slate-300 text-center mb-12 max-w-2xl mx-auto px-4"
          variants={itemVariants}
        >
          Everything you need to run successful campaigns and make your voice heard.
        </motion.p>

        <motion.div
          className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8"
          variants={containerVariants}
        >
          {[
            {
              icon: Users,
              title: "Online Signature Collection",
              description: "Beautiful, mobile-first signing page. Perfect on WhatsApp, mobile browsers, and desktops."
            },
            {
              icon: FileText,
              title: "AI-Powered Scanning",
              description: "Upload hand-written petitions. AI automatically extracts signer details with 95%+ accuracy."
            },
            {
              icon: MapPin,
              title: "Smart Authority Routing",
              description: "Auto-route signatures to District Collector, Chief Minister, or PM based on location."
            },
            {
              icon: BarChart3,
              title: "Real-Time Analytics",
              description: "Daily, weekly, and location-wise reports. Track progress toward your goal instantly."
            },
            {
              icon: Smartphone,
              title: "Bulk Messaging",
              description: "Send updates to supporters via WhatsApp, SMS, and email. Keep momentum alive."
            },
            {
              icon: Lock,
              title: "Enterprise Security",
              description: "End-to-end encryption, daily backups, and compliance with Indian privacy standards."
            },
            {
              icon: Grid3x3,
              title: "Custom Branding",
              description: "White-label campaigns with your organization's logo and colors."
            },
            {
              icon: BookOpen,
              title: "Offline Support",
              description: "Print QR codes and forms. Scan and upload later. Perfect for field campaigns."
            },
            {
              icon: Activity,
              title: "Integration Ready",
              description: "API access for custom integrations with your existing tools and workflows."
            }
          ].map((feature, idx) => (
            <motion.div
              key={idx}
              className="group bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 hover:border-blue-500/50 hover:bg-slate-800/80 transition-all duration-300"
              variants={itemVariants}
            >
              <div className="mb-4 inline-flex items-center justify-center w-12 h-12 bg-blue-500/10 group-hover:bg-blue-500/20 rounded-lg transition-colors">
                <feature.icon className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-slate-400 text-sm">{feature.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </motion.section>

      {/* Who Uses Voiceup Section */}
      <motion.section
        className="bg-slate-800/50 border-t border-b border-slate-700/50 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-center mb-4"
            variants={itemVariants}
          >
            Who Uses Voiceup Bharat
          </motion.h2>
          <motion.p
            className="text-slate-300 text-center mb-12 max-w-2xl mx-auto px-4"
            variants={itemVariants}
          >
            Trusted by community leaders, NGOs, and organizations driving real change.
          </motion.p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[
              {
                icon: Building2,
                title: "Residential Associations (RWAs)",
                description: "Run local campaigns for infrastructure, safety, and community improvement.",
                examples: ["Traffic safety petitions", "Water/sanitation issues", "Parking regulations"],
                color: "from-blue-500/20 to-blue-600/20"
              },
              {
                icon: Users,
                title: "Non-Profits & NGOs",
                description: "Scale your advocacy with digital signature collection and batch scanning.",
                examples: ["Environmental campaigns", "Healthcare access", "Education advocacy"],
                color: "from-green-500/20 to-green-600/20"
              },
              {
                icon: Landmark,
                title: "Civic Groups",
                description: "Mobilize citizens and present evidence-backed petitions to authorities.",
                examples: ["Public health", "Urban planning", "Government accountability"],
                color: "from-purple-500/20 to-purple-600/20"
              },
              {
                icon: Building2,
                title: "Religious & Social Organizations",
                description: "Coordinate large-scale campaigns with offline-first communities.",
                examples: ["Community welfare", "Cultural initiatives", "Charitable causes"],
                color: "from-orange-500/20 to-orange-600/20"
              },
              {
                icon: Globe,
                title: "Political & Advocacy Groups",
                description: "Build grassroots support with transparent, auditable signature collection.",
                examples: ["Policy advocacy", "Social movements", "Public awareness"],
                color: "from-pink-500/20 to-pink-600/20"
              },
              {
                icon: Megaphone,
                title: "Community Leaders",
                description: "Amplify your voice locally with mobile-first campaign tools.",
                examples: ["Local petitions", "Neighborhood issues", "Community organizing"],
                color: "from-yellow-500/20 to-yellow-600/20"
              }
            ].map((segment, idx) => (
              <motion.div
                key={idx}
                className={`bg-gradient-to-br ${segment.color} border border-slate-700/50 rounded-lg p-6 hover:border-slate-600 transition-colors`}
                variants={itemVariants}
              >
                <div className="mb-4">
                  <segment.icon className="w-10 h-10 text-blue-300" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{segment.title}</h3>
                <p className="text-slate-300 text-sm mb-4">{segment.description}</p>
                <ul className="text-xs text-slate-400 space-y-1">
                  {segment.examples.map((ex, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{ex}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Dashboard Preview Section */}
      <motion.section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="grid md:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Text */}
          <motion.div variants={itemVariants}>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">
              Monitor Your Campaign in Real-Time
            </h2>
            <p className="text-lg text-slate-300 mb-6">
              Get instant insights with our intuitive dashboard. Track signatures, analyze geographic distribution, and measure your campaign's impact.
            </p>
            <ul className="space-y-3">
              {[
                "Live signature counter and progress tracking",
                "Location-wise breakdown of supporters",
                "Activity feed and recent engagement",
                "Export reports in CSV, PDF formats",
                "Mobile app for on-the-go monitoring"
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-slate-300">{item}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          {/* Right: Dashboard Mock */}
          <motion.div variants={itemVariants}>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-3xl"></div>
              <div className="relative z-10">
                <DashboardPreview />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Pricing Section */}
      <motion.section
        className="bg-slate-800/50 border-t border-b border-slate-700/50 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-center mb-4"
            variants={itemVariants}
          >
            Simple, Transparent Pricing
          </motion.h2>
          <motion.p
            className="text-slate-300 text-center mb-12 max-w-2xl mx-auto px-4"
            variants={itemVariants}
          >
            Choose the right plan for your campaign. All plans include online signatures, scanning, and basic reports.
          </motion.p>

          <motion.div
            className="grid md:grid-cols-3 gap-6 sm:gap-8"
            variants={containerVariants}
          >
            {[
              {
                name: "Starter",
                price: "₹999",
                period: "/month",
                description: "Perfect for local RWAs and small campaigns",
                features: [
                  "1 active campaign",
                  "1,000 online signatures/month",
                  "100 scans/month",
                  "Basic reports",
                  "CSV export"
                ],
                cta: "Get Started"
              },
              {
                name: "Professional",
                price: "₹4,999",
                period: "/month",
                description: "For NGOs running multiple campaigns",
                features: [
                  "Unlimited campaigns",
                  "25,000 signatures/month",
                  "2,000 scans/month",
                  "Advanced analytics",
                  "Authority routing",
                  "Custom branding",
                  "Priority support"
                ],
                cta: "Get Started",
                recommended: true
              },
              {
                name: "Enterprise",
                price: "Custom",
                period: "quote",
                description: "For campaign agencies and large organizations",
                features: [
                  "Unlimited everything",
                  "100,000+ signatures/month",
                  "White-label platform",
                  "Custom domain",
                  "API access",
                  "Dedicated support",
                  "Advanced integrations"
                ],
                cta: "Contact Sales"
              }
            ].map((plan, idx) => (
              <motion.div
                key={idx}
                className={`rounded-lg p-6 sm:p-8 border transition-all ${
                  plan.recommended
                    ? "bg-blue-500/10 border-blue-500/50 ring-2 ring-blue-500/20 md:transform md:scale-105"
                    : "bg-slate-900/50 border-slate-700/50 hover:border-slate-600"
                }`}
                variants={itemVariants}
              >
                {plan.recommended && (
                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 bg-blue-500 text-white text-xs font-semibold rounded-full">
                      Recommended
                    </span>
                  </div>
                )}
                <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
                <p className="text-slate-300 text-sm mb-4">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-slate-400 text-sm">/{plan.period}</span>
                </div>
                <button
                  onClick={onGetStarted}
                  className={`w-full py-2 sm:py-3 rounded-lg font-semibold transition-colors mb-6 text-sm sm:text-base ${
                    plan.recommended
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-slate-700 hover:bg-slate-600 text-white"
                  }`}
                >
                  {plan.cta}
                </button>
                <ul className="space-y-3">
                  {plan.features.map((feature, fidx) => (
                    <li
                      key={fidx}
                      className="flex items-center gap-2 text-slate-300 text-xs sm:text-sm"
                    >
                      <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.section>

      {/* Testimonials Section - MARKED AS EXAMPLES */}
      <motion.section
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <motion.h2
          className="text-3xl sm:text-4xl font-bold text-center mb-4"
          variants={itemVariants}
        >
          Trusted by Community Leaders
        </motion.h2>
        <motion.p
          className="text-slate-300 text-center mb-12 px-4 text-sm text-slate-400"
          variants={itemVariants}
        >
          ✨ Example testimonials - Actual customer stories coming soon ✨
        </motion.p>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {[
            {
              name: "[Example] Priya Sharma",
              title: "RWA Secretary, Delhi",
              quote:
                "We collected 2,000 signatures in 3 weeks for our traffic safety petition. The mobile-first design meant everyone could sign from WhatsApp.",
              rating: 5
            },
            {
              name: "[Example] Rajesh Patel",
              title: "NGO Coordinator, Maharashtra",
              quote:
                "Scanning hard-copy signatures saved us weeks of manual data entry. The AI extraction is incredibly accurate.",
              rating: 5
            },
            {
              name: "[Example] Meena Gupta",
              title: "Community Leader, Karnataka",
              quote:
                "The authority routing feature automatically sent our petition to the right officials. Made a real difference.",
              rating: 5
            },
            {
              name: "[Example] Vikram Singh",
              title: "Social Organization, Punjab",
              quote:
                "The SMS and WhatsApp integration kept our supporters engaged throughout the campaign. Highly recommend!",
              rating: 5
            }
          ].map((testimonial, idx) => (
            <motion.div
              key={idx}
              className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6 sm:p-8 hover:border-blue-500/30 transition-colors"
              variants={itemVariants}
            >
              <div className="flex gap-1 mb-4">
                {Array(testimonial.rating)
                  .fill(0)
                  .map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 sm:w-5 sm:h-5 fill-yellow-400 text-yellow-400"
                    />
                  ))}
              </div>
              <p className="text-slate-300 mb-4 italic text-sm sm:text-base">"{testimonial.quote}"</p>
              <div>
                <p className="font-semibold text-sm sm:text-base">{testimonial.name}</p>
                <p className="text-xs sm:text-sm text-slate-400">{testimonial.title}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* FAQ Section */}
      <motion.section
        className="bg-slate-800/50 border-t border-b border-slate-700/50 py-16 sm:py-20"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold text-center mb-12"
            variants={itemVariants}
          >
            Frequently Asked Questions
          </motion.h2>

          <div className="space-y-4">
            {[
              {
                q: "Is there a free trial?",
                a: "Yes! Start with 1 free campaign and collect up to 100 signatures. No credit card required. Upgrade anytime."
              },
              {
                q: "Can I use this for offline signature collection?",
                a: "Absolutely. Print QR codes and forms, collect signatures on paper, then upload them for AI extraction and automatic data population."
              },
              {
                q: "How secure is my signature data?",
                a: "All data is encrypted at rest and in transit using industry-standard protocols. Daily backups to secure cloud storage with compliance to Indian privacy standards."
              },
              {
                q: "Do you integrate with SMS/WhatsApp?",
                a: "Yes! Set up WhatsApp Business and SMS providers in your settings to send campaign updates and signature confirmations to supporters."
              },
              {
                q: "What payment methods do you accept?",
                a: "All major Indian payment methods: UPI, credit/debit cards, net banking, NEFT, and more. Invoice/purchase order payments available for Enterprise plans."
              },
              {
                q: "Can I export my signature data?",
                a: "Yes! Export in CSV, Excel, PDF, and JSON formats. Download anytime for your records, analysis, or submission to authorities."
              },
              {
                q: "How does authority routing work?",
                a: "Based on signer location (district, state), our system automatically routes signatures to the appropriate authority. Requires initial address mapping."
              },
              {
                q: "Can I customize the campaign appearance?",
                a: "Professional and Enterprise plans support custom branding with your logo, colors, and domain. Starter plan has Voiceup branding."
              }
            ].map((faq, idx) => (
              <motion.div
                key={idx}
                className="border border-slate-700/50 rounded-lg overflow-hidden"
                variants={itemVariants}
              >
                <button
                  onClick={() => setOpenFAQ(openFAQ === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-4 sm:p-6 bg-slate-900/50 hover:bg-slate-900/70 transition-colors text-left"
                >
                  <span className="font-semibold text-slate-100 pr-4">{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-blue-400 flex-shrink-0 transition-transform ${
                      openFAQ === idx ? "transform rotate-180" : ""
                    }`}
                  />
                </button>
                {openFAQ === idx && (
                  <div className="px-4 sm:px-6 py-4 bg-slate-800/30 border-t border-slate-700/50 text-slate-300 text-sm sm:text-base">
                    {faq.a}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Final CTA Section */}
      <motion.section
        className="bg-gradient-to-r from-blue-600 to-blue-700 py-12 sm:py-16"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={containerVariants}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.h2
            className="text-3xl sm:text-4xl font-bold mb-4 sm:mb-6"
            variants={itemVariants}
          >
            Ready to Amplify Your Campaign?
          </motion.h2>
          <motion.p
            className="text-blue-100 text-base sm:text-lg mb-6 sm:mb-8"
            variants={itemVariants}
          >
            Join RWAs, NGOs, and community leaders across India who are using Voiceup to create real impact.
          </motion.p>
          <motion.button
            onClick={onGetStarted}
            className="px-6 sm:px-10 py-3 sm:py-4 bg-white text-blue-600 rounded-lg font-bold text-base sm:text-lg hover:bg-blue-50 transition-colors transform hover:scale-105"
            variants={itemVariants}
          >
            Create Free Campaign Today
          </motion.button>
        </div>
      </motion.section>

      {/* Premium Footer */}
      <footer className="bg-slate-950 border-t border-slate-700/50 py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Footer Grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-8 mb-8 sm:mb-12">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <Megaphone className="w-6 h-6 text-blue-400" />
                <span className="font-bold text-lg">Voiceup Bharat</span>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Amplifying citizen voices across India.
              </p>
              {/* Social Links */}
              <div className="flex gap-4 mt-6">
                <a
                  href="#"
                  className="w-10 h-10 bg-slate-800 hover:bg-blue-500/20 border border-slate-700 hover:border-blue-500/50 rounded-lg flex items-center justify-center transition-all"
                  title="Twitter"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 9 2.25 9 2.25z" />
                  </svg>
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-slate-800 hover:bg-blue-500/20 border border-slate-700 hover:border-blue-500/50 rounded-lg flex items-center justify-center transition-all"
                  title="Facebook"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 2h-3a6 6 0 00-6 6v3H7v4h2v8h4v-8h3l1-4h-4V8a1 1 0 011-1h3z" />
                  </svg>
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-slate-800 hover:bg-blue-500/20 border border-slate-700 hover:border-blue-500/50 rounded-lg flex items-center justify-center transition-all"
                  title="LinkedIn"
                >
                  <svg className="w-5 h-5 text-slate-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                    <circle cx="4" cy="4" r="2" />
                  </svg>
                </a>
              </div>
            </div>

            {/* Product */}
            <div>
              <h4 className="font-semibold mb-4 text-slate-100">Product</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <a href="#features" className="hover:text-blue-400 transition-colors">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#pricing" className="hover:text-blue-400 transition-colors">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Roadmap
                  </a>
                </li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="font-semibold mb-4 text-slate-100">Company</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold mb-4 text-slate-100">Resources</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Documentation
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    API Reference
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Help Center
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Contact
                  </a>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="font-semibold mb-4 text-slate-100">Legal</h4>
              <ul className="space-y-3 text-sm text-slate-400">
                <li>
                  <a href="/privacy" className="hover:text-blue-400 transition-colors">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="/terms" className="hover:text-blue-400 transition-colors">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="/refund" className="hover:text-blue-400 transition-colors">
                    Refund Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-blue-400 transition-colors">
                    Cookies
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-700/50 pt-8">
            {/* Newsletter Signup */}
            <div className="mb-8 max-w-md">
              <h4 className="font-semibold mb-4 text-slate-100">Stay Updated</h4>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
                />
                <button className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white text-sm font-semibold transition-colors flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  <span className="hidden sm:inline">Subscribe</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">We'll never spam you. Unsubscribe anytime.</p>
            </div>

            {/* Copyright and Credits */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-slate-400 text-xs sm:text-sm">
              <p>© 2026 Voiceup Bharat. All rights reserved. Made for India, by Indians.</p>
              <p>Designed for impact. Built for scale.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Add Play icon since it might not be in lucide
const Play = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);
