import { Link } from 'react-router-dom';
import { useDemoData } from '@/contexts/DemoDataContext';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { ArrowRight, BarChart3, MessageSquare, FileText, Smartphone, Mail } from 'lucide-react';
import { LandingHeader } from '@/components/ui/header';

const T = {
  red: '#FF4242',
  dark: '#0D0D0B',
  white: '#FFFFFF',
  offWhite: '#F8F8F6',
  border: '#E8E8E6',
  borderOnOff: '#DEDEDB',
  muted: '#6B6B65',
  barGrey: '#C8C8C2',
};

// Subtle red radial glow — position varies per section
const redGlow = (pos: string, size = '55% 45%') =>
  `radial-gradient(ellipse ${size} at ${pos}, rgba(255,66,66,0.055) 0%, transparent 65%)`;

// Red rule + uppercase label used above each section heading
const SectionLabel = ({ text, onDark = false }: { text: string; onDark?: boolean }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
    <span style={{ display: 'block', width: '22px', height: '2px', backgroundColor: T.red, borderRadius: '2px' }} />
    <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: onDark ? 'rgba(255,255,255,0.4)' : T.muted }}>{text}</span>
  </div>
);

const Landing = () => {
  const { startDemo } = useDemoData();
  const { start: startTour } = useWalkthrough();

  const handleTryDemo = () => {
    startDemo();
    startTour();
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', backgroundColor: T.white, color: T.dark }}>

      <LandingHeader />

      <main>

        {/* ── Hero — WHITE + red glow top-center ──────────────────────── */}
        <section style={{ padding: '100px 0 88px', textAlign: 'center', background: redGlow('50% 0%', '80% 50%') }}>
          <div className="container" style={{ maxWidth: '820px', margin: '0 auto' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 500, letterSpacing: '0.1em', color: T.muted, textTransform: 'uppercase', border: `1px solid ${T.border}`, borderRadius: '100px', padding: '5px 14px', marginBottom: '36px', backgroundColor: T.white }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: T.red, display: 'inline-block', flexShrink: 0 }} />
              AI-powered invoice & budget management
            </div>
            <h1 style={{ fontSize: 'clamp(40px, 7vw, 76px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', color: T.dark, margin: '0 0 28px' }}>
              One agent to{' '}
              <span style={{ position: 'relative', display: 'inline-block' }}>
                manage
                <svg aria-hidden="true" style={{ position: 'absolute', bottom: '-6px', left: '-2px', width: 'calc(100% + 4px)', height: '8px', overflow: 'visible' }} viewBox="0 0 100 8" preserveAspectRatio="none">
                  <path d="M2,5 C20,1 40,7 60,4 C80,1 95,6 98,4" stroke={T.red} strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </svg>
              </span>
              {' '}your invoices and budget.
            </h1>
            <p style={{ fontSize: '17px', lineHeight: 1.7, color: T.muted, fontWeight: 400, maxWidth: '520px', margin: '0 auto 44px' }}>
              Not another SaaS product. Bert is an AI agent that works the way your team does — reachable on WhatsApp, email, or Slack. Send it an invoice. Ask it a question. It handles the rest.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleTryDemo} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: T.dark, color: '#fff', fontSize: '14px', fontWeight: 500, padding: '13px 26px', borderRadius: '8px', border: 'none', cursor: 'pointer', boxShadow: `0 1px 3px rgba(0,0,0,0.10), 0 6px 20px rgba(0,0,0,0.08)`, transition: 'opacity 140ms ease, transform 140ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.82'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                Try the demo <ArrowRight size={14} />
              </button>
              <a href="https://calendly.com/meetbert-info/30min" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: T.red, color: '#fff', fontSize: '14px', fontWeight: 500, padding: '13px 26px', borderRadius: '8px', border: 'none', textDecoration: 'none', transition: 'opacity 140ms ease, transform 140ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                Get started
              </a>
            </div>
          </div>
        </section>

        {/* ── Features — OFF-WHITE bg, WHITE cards ────────────────────────── */}
        <section id="how-it-works" style={{ padding: '88px 0', borderTop: `1px solid ${T.border}`, backgroundColor: T.offWhite }}>
          <div className="container">
            <div style={{ textAlign: 'center', marginBottom: '52px' }}>
              <SectionLabel text="How it works" />
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.15, color: T.dark, margin: 0 }}>
                Send it. Bert handles the rest.
              </h2>
            </div>
            <div id="features" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>

              {/* Send → Extract */}
              <div style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', backgroundColor: '#FFF0F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={16} color={T.red} /></div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Forward and forget.</h3>
                </div>
                <p style={{ fontSize: '13.5px', color: T.muted, lineHeight: 1.65, margin: 0 }}>Forward an email, send a WhatsApp, or drop a PDF — Bert reads every field and maps the invoice to the right project instantly. No manual entry, ever.</p>
                {/* Incoming message → extracted data */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {/* Incoming message */}
                  <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
                    <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <span style={{ flexShrink: 0, display: 'flex', alignSelf: 'center' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.115 1.528 5.84L0 24l6.335-1.508A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.369l-.36-.214-3.727.887.927-3.634-.234-.374A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                      </span>
                      <div style={{ fontSize: '12px', color: T.dark, lineHeight: 1.4 }}>
                        <div style={{ fontWeight: 600 }}>WhatsApp</div>
                        <div style={{ marginTop: '3px' }}>Here's March equipment invoice 📎 INV-0291.pdf</div>
                      </div>
                    </div>
                  </div>
                  {/* Arrow */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 6px' }}>
                    <div style={{ flex: 1, height: '1px', backgroundColor: T.border }} />
                    <span style={{ fontSize: '11px', color: T.muted, fontWeight: 500 }}>Bert extracts and saves</span>
                    <div style={{ flex: 1, height: '1px', backgroundColor: T.border }} />
                  </div>
                  {/* Extracted fields */}
                  <div style={{ backgroundColor: T.offWhite, borderRadius: '8px', border: `1px solid ${T.borderOnOff}`, overflow: 'hidden' }}>
                    <div style={{ padding: '8px 14px', borderBottom: `1px solid ${T.borderOnOff}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>INV-0291</span>
                      <span style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: '#FFF0F0', color: T.red, borderRadius: '100px', fontWeight: 500 }}>Unpaid</span>
                    </div>
                    {[
                      { label: 'Vendor', value: 'Cinematic Rentals Ltd.' },
                      { label: 'Amount', value: '$4,250.00' },
                      { label: 'Project', value: 'Atlantic Documentary' },
                      { label: 'Category', value: 'Equipment' },
                      { label: 'Due', value: '14 Apr 2025' },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: `1px solid ${T.borderOnOff}`, fontSize: '12px' }}>
                        <span style={{ color: T.muted }}>{row.label}</span>
                        <span style={{ fontWeight: 500 }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Budget tracking */}
              <div style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', backgroundColor: '#FFF0F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BarChart3 size={16} color={T.red} /></div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Project budget tracking</h3>
                </div>
                <p style={{ fontSize: '13.5px', color: T.muted, lineHeight: 1.65, margin: 0 }}>Every invoice is assigned to a budget category automatically. Bert tracks your spend in real time and alerts you before you go over.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: '12px', marginBottom: '-4px' }}>
                    <span style={{ fontWeight: 600 }}>Atlantic Documentary</span>
                    <span style={{ color: T.muted }}>$84,800 / $150,000</span>
                  </div>
                  {[
                    { label: 'Equipment', pct: 72 },
                    { label: 'Crew', pct: 48 },
                    { label: 'Location', pct: 91 },
                    { label: 'Post', pct: 22 },
                  ].map(item => (
                    <div key={item.label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                        <span style={{ color: T.muted }}>{item.label}</span>
                        <span style={{ fontWeight: 500, color: item.pct > 85 ? T.red : T.muted }}>{item.pct}%</span>
                      </div>
                      <div style={{ height: '5px', backgroundColor: T.offWhite, borderRadius: '100px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${item.pct}%`, backgroundColor: item.pct > 85 ? T.red : T.barGrey, borderRadius: '100px' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Works where you work */}
              <div style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', backgroundColor: '#FFF0F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Smartphone size={16} color={T.red} /></div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Works where you work</h3>
                </div>
                <p style={{ fontSize: '13.5px', color: T.muted, lineHeight: 1.65, margin: 0 }}>No onboarding. No new app to learn. Reach Bert on WhatsApp, email, or Slack — wherever your team already communicates.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {[
                    {
                      channel: 'WhatsApp', bg: '#F0FDF4', border: '#BBF7D0',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.556 4.115 1.528 5.84L0 24l6.335-1.508A11.955 11.955 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.369l-.36-.214-3.727.887.927-3.634-.234-.374A9.818 9.818 0 012.182 12C2.182 6.58 6.58 2.182 12 2.182S21.818 6.58 21.818 12 17.42 21.818 12 21.818z"/></svg>
                      ),
                      message: 'Forwarded: Invoice from Cinematic Rentals', reply: 'Got it — logged to Equipment, Atlantic Documentary.',
                    },
                    {
                      channel: 'Email', bg: '#EFF6FF', border: '#BFDBFE',
                      icon: <Mail size={20} color="#4285F4" />,
                      message: "What's our total spend on crew this month?", reply: 'Crew spend is $24,000 — 48% of your $50k budget.',
                    },
                    {
                      channel: 'Slack', bg: '#FAF5FF', border: '#E9D5FF',
                      icon: (
                        <svg width="20" height="20" viewBox="0 0 54 54" xmlns="http://www.w3.org/2000/svg">
                          <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
                          <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
                          <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
                          <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="#E01E5A"/>
                        </svg>
                      ),
                      message: '@bert any overdue invoices?', reply: '2 overdue: Prop Rental ($1,200) and Studio Hire ($3,400).',
                    },
                  ].map(item => (
                    <div key={item.channel} style={{ borderRadius: '8px', border: `1px solid ${item.border}`, backgroundColor: item.bg }}>
                      <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ flexShrink: 0, display: 'flex', alignSelf: 'center' }}>{item.icon}</span>
                        <div style={{ fontSize: '12px', color: T.dark, lineHeight: 1.4 }}>
                          <div>{item.message}</div>
                          <div style={{ color: T.muted, marginTop: '3px' }}><span style={{ color: T.red, fontWeight: 500 }}>Bert: </span>{item.reply}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Ask Bert */}
              <div style={{ backgroundColor: T.white, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '36px', height: '36px', backgroundColor: '#FFF0F0', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MessageSquare size={16} color={T.red} /></div>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>Ask Bert anything</h3>
                </div>
                <p style={{ fontSize: '13.5px', color: T.muted, lineHeight: 1.65, margin: 0 }}>Query spend by vendor, project, or category in plain English. No spreadsheets, no exports, no waiting.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ alignSelf: 'flex-end', backgroundColor: T.dark, color: '#fff', borderRadius: '12px 12px 3px 12px', padding: '9px 13px', fontSize: '13px', maxWidth: '82%', lineHeight: 1.5 }}>What's our total equipment spend this month?</div>
                  <div style={{ alignSelf: 'flex-start', backgroundColor: T.offWhite, border: `1px solid ${T.borderOnOff}`, borderRadius: '12px 12px 12px 3px', padding: '9px 13px', fontSize: '13px', maxWidth: '88%', lineHeight: 1.6, color: T.dark }}>
                    Equipment spend this month is <strong>$36,200</strong> across 8 invoices — <span style={{ color: T.red }}>72% of your $50k budget</span>. Largest: Cinematic Rentals Ltd. ($4,250).
                  </div>
                  <div style={{ alignSelf: 'flex-end', backgroundColor: T.dark, color: '#fff', borderRadius: '12px 12px 3px 12px', padding: '9px 13px', fontSize: '13px', maxWidth: '82%', lineHeight: 1.5 }}>Which vendors have unpaid invoices?</div>
                  <div style={{ alignSelf: 'flex-start', backgroundColor: T.offWhite, border: `1px solid ${T.borderOnOff}`, borderRadius: '12px 12px 12px 3px', padding: '9px 13px', fontSize: '13px', maxWidth: '88%', lineHeight: 1.6, color: T.dark }}>
                    2 vendors with unpaid invoices: <strong>Prop Rentals Co.</strong> ($1,200, due 3 days ago) and <strong>Studio Hire Ltd.</strong> ($3,400, due today). <span style={{ color: T.red }}>Both are overdue.</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* ── Testimonial — WHITE bg, red glow center ─────────────────────── */}
        <section id="testimonial" style={{ padding: '88px 0', borderTop: `1px solid ${T.border}`, background: redGlow('50% 50%', '60% 60%') }}>
          <div className="container" style={{ maxWidth: '660px', margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: '40px', lineHeight: 1, color: T.red, marginBottom: '12px', fontFamily: 'Georgia, serif' }}>&ldquo;</div>
            <blockquote style={{ fontSize: 'clamp(17px, 2vw, 22px)', fontWeight: 400, lineHeight: 1.6, letterSpacing: '-0.01em', color: T.dark, margin: '0 0 28px' }}>
              Bert eliminated an entire day of admin per week. Our production accountant has full visibility before an invoice even hits her desk — and she never had to learn a new tool.
            </blockquote>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: T.offWhite, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: T.muted, flexShrink: 0, border: `1px solid ${T.border}` }}>JM</div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Jamie M.</div>
                <div style={{ fontSize: '13px', color: T.muted }}>Line Producer, NF Films</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Stats — WHITE bg, red glow right ────────────────────────────── */}
        <section style={{ borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: redGlow('100% 50%', '40% 60%') }}>
          <div className="container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[
                { value: '< 30s', label: 'Average processing time per invoice' },
                { value: '0', label: 'Manual uploads or data entry required' },
                { value: '8h', label: 'Admin hours saved per production per week' },
              ].map((stat, i) => (
                <div key={stat.label} style={{ padding: '52px 36px', borderLeft: i > 0 ? `1px solid ${T.border}` : 'none', textAlign: 'center' }}>
                  <div style={{ fontSize: 'clamp(44px, 5vw, 64px)', fontWeight: 800, letterSpacing: '-0.05em', color: T.dark, lineHeight: 1, marginBottom: '10px' }}>{stat.value}</div>
                  <div style={{ fontSize: '13px', color: T.muted, maxWidth: '160px', margin: '0 auto', lineHeight: 1.55 }}>{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA — OFF-WHITE bg, red glow top-right ──────────────────────── */}
        <section style={{ padding: '88px 0', borderTop: `1px solid ${T.border}`, backgroundColor: T.offWhite }}>
          <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '36px' }}>
            <div>
              <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 48px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.08, color: T.dark, margin: 0 }}>
                Discover the full scale<br />
                <span style={{ textDecoration: 'underline', textDecorationColor: T.red, textUnderlineOffset: '5px', textDecorationThickness: '2px' }}>of Bert's capabilities.</span>
              </h2>
              <p style={{ fontSize: '14px', color: T.muted, margin: '14px 0 0', lineHeight: 1.6 }}>No sign-up needed. Explore with real production data.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="https://calendly.com/meetbert-info/30min" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: T.red, color: '#fff', fontSize: '14px', fontWeight: 500, padding: '12px 22px', borderRadius: '8px', border: 'none', textDecoration: 'none', transition: 'opacity 140ms ease, transform 140ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                Get started
              </a>
              <button onClick={handleTryDemo} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: T.dark, color: '#fff', fontSize: '14px', fontWeight: 500, padding: '12px 22px', borderRadius: '8px', border: 'none', cursor: 'pointer', boxShadow: `0 1px 3px rgba(0,0,0,0.12), 0 6px 20px rgba(0,0,0,0.08)`, transition: 'opacity 140ms ease, transform 140ms ease' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.82'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}>
                Try the demo <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer — OFF-WHITE bg ────────────────────────────────────────── */}
      <footer style={{ backgroundColor: T.offWhite, borderTop: `1px solid ${T.border}`, padding: '28px 0' }}>
        <div className="container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <span style={{ fontSize: '18px', fontWeight: 800, color: T.red, letterSpacing: '-0.04em' }}>Bert.</span>
          <p style={{ fontSize: '12px', color: T.muted, margin: 0 }}>© Bert. 2026</p>
        </div>
      </footer>

    </div>
  );
};

export default Landing;
