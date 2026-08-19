"use client";

import { useEffect, useState } from "react";

/**
 * Dojo Storm Software marketing landing page.
 *
 * Single-scrolling page with:
 *  Nav → Hero → Features → How it works → Pricing → Contact → Footer.
 *
 * All CTAs to "start / sign in" send visitors to the app subdomain
 * (app.dojostormsoftware.com). Contact form POSTs to
 * /api/marketing/contact, which emails the platform inbox via Resend.
 */
export default function MarketingHome() {
  return (
    <>
      <TopNav />
      <Hero />
      <FeaturesGrid />
      <HowItWorks />
      <Pricing />
      <Contact />
      <Footer />
    </>
  );
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

function TopNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
        <a href="#top" className="flex items-center gap-2 font-bold text-lg">
          <span className="inline-block w-7 h-7 rounded-md bg-primary text-white grid place-items-center text-sm">DS</span>
          <span>Dojo Storm</span>
        </a>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <a href="#features" className="text-gray-600 hover:text-gray-900">Features</a>
          <a href="#how" className="text-gray-600 hover:text-gray-900">How it works</a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-900">Pricing</a>
          <a href="#contact" className="text-gray-600 hover:text-gray-900">Contact</a>
          <a
            href="https://app.dojostormsoftware.com/login"
            className="text-gray-700 font-semibold hover:text-primary"
          >
            Sign in
          </a>
          <a
            href="#contact"
            className="rounded-md bg-primary text-white text-sm font-semibold px-4 py-2 hover:bg-primaryDark"
          >
            Get in touch
          </a>
        </nav>
        <button
          type="button"
          className="md:hidden p-2 -mr-2 text-gray-600"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
          </svg>
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-3 space-y-2 text-sm bg-white">
          {[
            ["Features", "#features"],
            ["How it works", "#how"],
            ["Pricing", "#pricing"],
            ["Contact", "#contact"],
            ["Sign in", "https://app.dojostormsoftware.com/login"],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="block py-2 text-gray-700 hover:text-primary"
            >
              {label}
            </a>
          ))}
          <a
            href="#contact"
            onClick={() => setOpen(false)}
            className="block mt-2 rounded-md bg-primary text-white text-center font-semibold px-4 py-2 hover:bg-primaryDark"
          >
            Get in touch
          </a>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* Subtle diagonal band -- keeps the hero from feeling like a
          flat white block without adding distracting imagery. */}
      <div
        className="absolute inset-x-0 top-0 h-[520px] -z-10"
        style={{
          background:
            "linear-gradient(180deg, rgba(196,17,17,0.05) 0%, rgba(196,17,17,0) 100%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 sm:pb-24">
        <div className="max-w-3xl">
          <div className="inline-block rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary mb-4">
            Built for martial arts schools
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-gray-900 leading-tight">
            Run every part of your dojo in one place.
          </h1>
          <p className="mt-5 text-lg text-gray-600 max-w-2xl">
            Members, memberships, curriculum, testing, promotions, POS, and a
            mobile portal for your students — designed around how a martial
            arts school actually works, not a generic gym.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#contact"
              className="rounded-md bg-primary text-white px-5 py-3 text-sm font-semibold hover:bg-primaryDark shadow-sm"
            >
              Get in touch
            </a>
            <a
              href="#features"
              className="rounded-md border border-gray-300 bg-white text-gray-800 px-5 py-3 text-sm font-semibold hover:bg-gray-50"
            >
              See what&apos;s inside
            </a>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            30-day free evaluation · no credit card required
          </p>
        </div>

        {/* Quick stats row */}
        <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            ["1", "Login for your whole gym"],
            ["6+", "Roles + granular permissions"],
            ["Zero", "Extra software required"],
            ["24/7", "Your students' portal access"],
          ].map(([value, label]) => (
            <div key={label}>
              <dt className="text-3xl font-bold text-primary">{value}</dt>
              <dd className="mt-1 text-sm text-gray-600">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features grid
// ---------------------------------------------------------------------------

function FeaturesGrid() {
  const features: Array<{ title: string; blurb: string; icon: React.ReactNode }> = [
    {
      title: "Members & Memberships",
      blurb: "Family relationships, styles per member, contract signing, recurring plans, prorated billing, and family discounts — without spreadsheets.",
      icon: <IconUsers />,
    },
    {
      title: "Curriculum & Testing",
      blurb: "Build your rank progression once. Grade tests on a phone with a stopwatch, workout bundles, and pass/fail per item. Auto-generate the grading sheet.",
      icon: <IconBook />,
    },
    {
      title: "Point of Sale",
      blurb: "Sell memberships, products, and services from one screen. Card + cash + check + account credit + gift certificates. Card entry stays on-device — no processor lock-in.",
      icon: <IconCart />,
    },
    {
      title: "Auto-billing & Dunning",
      blurb: "Recurring plans auto-charge on schedule. Failed payments retry on a smart schedule with escalating emails. Members can self-serve their card on file.",
      icon: <IconCard />,
    },
    {
      title: "Member Portal (PWA)",
      blurb: "A phone app your students install from the browser. Class booking, attendance, messages, waivers, portal magic-link login. Coaches can even sign in others from theirs.",
      icon: <IconPhone />,
    },
    {
      title: "Reports & Insights",
      blurb: "Every column you actually want on a member list — belt, coach, styles, class counts since last promotion — with CSV + printable PDF export.",
      icon: <IconChart />,
    },
  ];
  return (
    <section id="features" className="py-20 sm:py-24 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading eyebrow="Features" title="Every tool your dojo needs, tuned for how you actually run it." />
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary grid place-items-center mb-4">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{f.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Sign up for your gym",
      body: "You get your own subdomain and a private database. Import members from a spreadsheet or start fresh.",
    },
    {
      n: "2",
      title: "Configure your setup",
      body: "Pick your styles, build your rank progressions, price your memberships, invite coaches, print QR codes for the kiosk.",
    },
    {
      n: "3",
      title: "Run every day from one screen",
      body: "Members sign in on the kiosk, cards auto-bill overnight, coaches grade tests on their phones, you see the whole gym on the dashboard.",
    },
  ];
  return (
    <section id="how" className="py-20 sm:py-24 bg-gray-50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading eyebrow="How it works" title="Live in an afternoon. Runs itself after that." />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl bg-white border border-gray-200 p-6">
              <div className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center font-bold">
                {s.n}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{s.title}</h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

type ApiTier = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  billingPeriod: string;
  maxMembers: number;
  maxStyles: number;
  maxUsers: number;
  maxLocations: number;
  maxReports: number;
  maxPOSItems: number;
  allowStripe: boolean;
  allowPaypal: boolean;
  allowSquare: boolean;
};

function Pricing() {
  const [tiers, setTiers] = useState<ApiTier[] | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    fetch("/api/marketing/tiers")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((j) => setTiers(Array.isArray(j.tiers) ? j.tiers : []))
      .catch(() => setErrored(true));
  }, []);

  // Highlight the middle tier (by count) as "Most popular" -- a
  // pure display heuristic so the operator doesn't have to flag one
  // in the DB. When there's one tier, no highlight; two tiers,
  // highlight the second (the paid one, usually); three+ tiers,
  // highlight the middle. Only ranges over what came back from the
  // API, so hidden founderOnly / inviteOnly tiers never affect it.
  function isHighlight(index: number, total: number): boolean {
    if (total <= 1) return false;
    if (total === 2) return index === 1;
    return index === Math.floor(total / 2);
  }

  return (
    <section id="pricing" className="py-20 sm:py-24 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading eyebrow="Pricing" title="Simple monthly pricing. No per-member fees." />
        <p className="mt-4 max-w-2xl text-gray-600">
          Card processing fees pass through to your own Stripe (or PayPal / Square) account — we don&apos;t skim your revenue.
        </p>

        {tiers === null && !errored && (
          <div className="mt-12 text-sm text-gray-500">Loading pricing…</div>
        )}
        {errored && (
          <div className="mt-12 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Couldn&apos;t load current pricing. Please <a className="underline" href="#contact">get in touch</a> and we&apos;ll send it over.
          </div>
        )}
        {tiers && tiers.length === 0 && !errored && (
          <div className="mt-12 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            Pricing is currently being finalized. <a className="underline" href="#contact">Contact us</a> for a tailored quote.
          </div>
        )}

        {tiers && tiers.length > 0 && (
          <div
            className={`mt-12 grid gap-6 ${
              tiers.length === 1
                ? "md:grid-cols-1 max-w-md mx-auto"
                : tiers.length === 2
                  ? "md:grid-cols-2"
                  : tiers.length === 3
                    ? "md:grid-cols-3"
                    : "md:grid-cols-2 lg:grid-cols-4"
            }`}
          >
            {tiers.map((t, i) => {
              const highlight = isHighlight(i, tiers.length);
              const features = buildFeatureList(t);
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl p-6 flex flex-col ${
                    highlight
                      ? "border-2 border-primary bg-primary/[0.03] shadow-lg"
                      : "border border-gray-200 bg-white"
                  }`}
                >
                  {highlight && (
                    <div className="inline-block self-start rounded-full bg-primary text-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide mb-2">
                      Most popular
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-gray-900">{t.name}</h3>
                  {t.description && (
                    <p className="mt-1 text-sm text-gray-500">{t.description}</p>
                  )}
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-bold text-gray-900">
                      {t.priceCents === 0 ? "Free" : `$${(t.priceCents / 100).toFixed(0)}`}
                    </span>
                    {t.priceCents > 0 && (
                      <span className="ml-1 text-gray-500">/{shortPeriod(t.billingPeriod)}</span>
                    )}
                  </div>
                  <ul className="mt-6 space-y-2 text-sm text-gray-700 flex-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <svg className="w-4 h-4 mt-0.5 text-primary shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href="#contact"
                    className={`mt-6 block text-center rounded-md py-2.5 text-sm font-semibold ${
                      highlight
                        ? "bg-primary text-white hover:bg-primaryDark"
                        : "border border-gray-300 text-gray-800 hover:bg-gray-50"
                    }`}
                  >
                    Get in touch
                  </a>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-8 text-xs text-gray-500 text-center">
          Not sure which tier fits? <a className="underline" href="#contact">Talk to us</a> and we&apos;ll help pick the right one.
        </p>
      </div>
    </section>
  );
}

/** Human-readable feature bullets derived from the tier's caps + toggles.
 *  Keeps the marketing page in step with what's actually configured in
 *  /admin/pricing without asking the operator to write bullet copy. */
function buildFeatureList(t: ApiTier): string[] {
  const bullets: string[] = [];
  bullets.push(memberBullet(t.maxMembers));
  if (t.maxStyles > 0) bullets.push(styleBullet(t.maxStyles));
  if (t.maxUsers > 0) bullets.push(userBullet(t.maxUsers));
  if (t.maxLocations > 1) bullets.push(`${t.maxLocations} locations`);
  if (t.maxReports > 0) bullets.push(`${t.maxReports === 999 ? "Unlimited" : t.maxReports} custom reports`);
  if (t.maxPOSItems > 0) bullets.push(`${t.maxPOSItems === 999 ? "Unlimited" : t.maxPOSItems} POS items`);
  const processors: string[] = [];
  if (t.allowStripe) processors.push("Stripe");
  if (t.allowPaypal) processors.push("PayPal");
  if (t.allowSquare) processors.push("Square");
  if (processors.length > 0) bullets.push(`Card processing: ${processors.join(" · ")}`);
  return bullets;
}
function memberBullet(n: number): string {
  if (n >= 999) return "Unlimited members";
  return `Up to ${n.toLocaleString()} active members`;
}
function styleBullet(n: number): string {
  if (n >= 999) return "Unlimited styles";
  return `${n} style${n === 1 ? "" : "s"}`;
}
function userBullet(n: number): string {
  if (n >= 999) return "Unlimited admin users";
  return `${n} admin user${n === 1 ? "" : "s"}`;
}
function shortPeriod(period: string): string {
  const p = period.toLowerCase();
  if (p === "monthly") return "mo";
  if (p === "yearly" || p === "annual" || p === "annually") return "yr";
  if (p === "weekly") return "wk";
  return period;
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

function Contact() {
  const [form, setForm] = useState({ name: "", email: "", gymName: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/marketing/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to send");
      }
      setStatus("sent");
      setForm({ name: "", email: "", gymName: "", message: "" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send");
    }
  }

  return (
    <section id="contact" className="py-20 sm:py-24 bg-gray-50 border-t border-gray-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <SectionHeading eyebrow="Get in touch" title="Tell us about your gym." />
        <p className="mt-4 text-gray-600">
          Questions, quote requests, setup help — send us a note and we&apos;ll usually reply the same day.
        </p>
        <form onSubmit={submit} className="mt-10 grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Your name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Email" required type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
          </div>
          <Field label="Gym name" value={form.gymName} onChange={(v) => setForm({ ...form, gymName: v })} />
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              What are you trying to solve? <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Ditching Mindbody, need family billing, coaches want to grade tests on their phones..."
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-md bg-primary text-white px-6 py-2.5 text-sm font-semibold hover:bg-primaryDark disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send message"}
            </button>
            {status === "sent" && (
              <span className="text-sm text-green-700">Thanks — we'll be in touch shortly.</span>
            )}
            {status === "error" && (
              <span className="text-sm text-red-700">Couldn't send: {errorMsg}. Email <a className="underline" href="mailto:hello@dojostormsoftware.com">hello@dojostormsoftware.com</a> directly.</span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-primary"> *</span>}
      </label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-t border-gray-100 py-8 text-sm text-gray-500">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div>© {new Date().getFullYear()} Dojo Storm Software. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <a href="#features" className="hover:text-gray-700">Features</a>
          <a href="#pricing" className="hover:text-gray-700">Pricing</a>
          <a href="#contact" className="hover:text-gray-700">Contact</a>
          <a href="https://app.dojostormsoftware.com/login" className="hover:text-gray-700">Sign in</a>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
      <h2 className="mt-2 text-3xl sm:text-4xl font-bold text-gray-900">{title}</h2>
    </div>
  );
}

// Tiny inline icons -- no external icon library, keeps the bundle small.
function IconUsers() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M9 11a4 4 0 100-8 4 4 0 000 8z" /></svg>); }
function IconBook() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 006.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z" /></svg>); }
function IconCart() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.6 4h13.2M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z" /></svg>); }
function IconCard() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M2 6h20v12H2zM2 10h20" /></svg>); }
function IconPhone() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 2h10a2 2 0 012 2v16a2 2 0 01-2 2H7a2 2 0 01-2-2V4a2 2 0 012-2zM11 18h2" /></svg>); }
function IconChart() { return (<svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3v18h18M8 17V9m4 8V5m4 12v-6" /></svg>); }
