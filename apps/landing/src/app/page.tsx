// Landing publique OLEL — version éditoriale sobre.
// Inspiration : Anthropic, Linear, Stripe. Pas de gradient, pas de section
// colorée, palette mono-accent slate-900, blancs généreux, typographie soignée.
// Les visuels (logo + 2 bannières) sont les seuls éléments graphiques.

const SERIF: React.CSSProperties = { fontFamily: 'var(--font-display), Georgia, serif' };

const INK    = '#0F172A';   // texte principal
const INK_2  = '#1E293B';   // titres secondaires
const MUTED  = '#475569';   // texte secondaire
const MUTED_2 = '#64748B';
const FADED  = '#94A3B8';   // labels
const LINE   = '#E5E7EB';   // bordures fines
const LINE_2 = '#F1F5F9';   // bordures très douces
const BG     = '#FFFFFF';
const BG_2   = '#FAFAFA';   // background page

export default function LandingPage() {
  return (
    <main style={{ background: BG_2 }}>
      <Nav />
      <Hero />
      <Stats />
      <Vision />
      <HowItWorks />
      <Showcase />
      <Channels />
      <Testimonial />
      <Partners />
      <FinalCTA />
      <Footer />
    </main>
  );
}

// ── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const links = [
    { href: '#vision', label: 'Vision' },
    { href: '#how', label: 'Fonctionnement' },
    { href: '#channels', label: 'Canaux' },
    { href: '#partners', label: 'Partenaires' },
  ];
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(255, 255, 255, 0.92)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${LINE_2}`,
    }}>
      <div style={{ ...container(), display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 }}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: INK }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OLEL" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span style={{ ...SERIF, fontSize: '1.05rem', fontWeight: 600, letterSpacing: '-0.015em' }}>OLEL</span>
        </a>
        <div style={{ display: 'flex', gap: 4 }}>
          {links.map((l) => (
            <a key={l.href} href={l.href} style={{
              color: MUTED, fontSize: '0.86rem', fontWeight: 500, textDecoration: 'none',
              padding: '8px 14px', borderRadius: 6,
            }}>{l.label}</a>
          ))}
        </div>
        <a href="#contact" style={{
          background: INK, color: 'white',
          padding: '8px 16px', borderRadius: 6, fontSize: '0.84rem', fontWeight: 500,
          textDecoration: 'none', letterSpacing: '-0.005em',
        }}>Nous contacter</a>
      </div>
    </nav>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section id="top" style={{ background: BG, padding: '120px 0 96px', borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container({ textAlign: 'center' })}>
        <div style={eyebrow({ marginBottom: 36, justifyContent: 'center' })}>
          Région de Matam · Sénégal · Pilote 2026
        </div>
        <h1 style={{
          ...SERIF, fontSize: 'clamp(2.8rem, 6vw, 5.2rem)', fontWeight: 500,
          letterSpacing: '-0.035em', lineHeight: 1.04, margin: '0 auto 32px',
          color: INK, maxWidth: 920,
        }}>
          Une alerte précoce qui parle votre langue,<br />
          <span style={{ color: MUTED_2 }}>par le canal que vous utilisez déjà.</span>
        </h1>
        <p style={{
          fontSize: '1.15rem', lineHeight: 1.7, color: MUTED,
          maxWidth: 640, margin: '0 auto 44px',
        }}>
          OLEL est la plateforme communautaire d&apos;alerte multi-risques pour la
          région de Matam. Quatre langues — français, pulaar, wolof, soninké — et
          cinq canaux complémentaires, du smartphone à l&apos;USSD.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="#how" style={btn('primary')}>Découvrir le fonctionnement</a>
          <a href="#contact" style={btn('ghost')}>Télécharger le dossier</a>
        </div>
      </div>
    </section>
  );
}

// ── Stats ───────────────────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: '562 000', label: 'Habitants couverts' },
    { value: '4', label: 'Langues supportées' },
    { value: '5', label: 'Canaux de diffusion' },
    { value: '12 mois', label: 'Phase pilote' },
  ];
  return (
    <section style={{ background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={{ ...container(), display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', padding: '56px 32px' }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{
            padding: '0 32px',
            borderRight: i < stats.length - 1 ? `1px solid ${LINE_2}` : 'none',
          }}>
            <div style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 500, letterSpacing: '-0.025em', color: INK, lineHeight: 1 }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.82rem', color: FADED, marginTop: 12, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Vision ──────────────────────────────────────────────────────────────────
function Vision() {
  const values = [
    {
      title: 'Le fleuve d\'abord',
      body: 'OLEL est ancré dans la réalité hydrologique du bassin du fleuve Sénégal — crues, sécheresses, qualité de l\'eau. Les données OMVS alimentent en continu le système.',
    },
    {
      title: 'La voix compte',
      body: 'Une grand-mère de Soringho doit pouvoir alerter en pulaar à la voix. Le signalement vocal est le canal premier — texte et lecture viennent ensuite.',
    },
    {
      title: 'Sentinelle et mairie',
      body: 'Pas d\'alerte sans validation humaine. Les sentinelles formées vérifient sur le terrain, la mairie valide, le préfet diffuse à l\'échelle régionale.',
    },
  ];
  return (
    <section id="vision" style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container()}>
        <SectionHeader eyebrow="Vision" title="Trois principes qui guident le projet." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 0, marginTop: 64, borderTop: `1px solid ${LINE_2}` }}>
          {values.map((v, i) => (
            <div key={v.title} style={{
              padding: '40px 32px 0',
              borderRight: i < values.length - 1 ? `1px solid ${LINE_2}` : 'none',
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: FADED, letterSpacing: '0.08em', marginBottom: 16 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 style={{ ...SERIF, fontSize: '1.4rem', fontWeight: 500, color: INK, margin: '0 0 14px', letterSpacing: '-0.02em' }}>
                {v.title}
              </h3>
              <p style={{ fontSize: '0.94rem', color: MUTED, lineHeight: 1.65, margin: 0 }}>{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      role: 'Citoyen',
      desc: 'Signale un risque dans sa langue, par WhatsApp, application mobile, SMS ou USSD. Le signalement vocal est privilégié pour les populations peu alphabétisées.',
      actions: ['Signaler un incident', 'Consulter les alertes de sa zone', 'Recevoir les bulletins hebdomadaires'],
    },
    {
      role: 'Sentinelle',
      desc: 'Volontaire formé qui vérifie sur le terrain (photo, GPS, gravité) et fait remonter à la mairie en moins de trente minutes.',
      actions: ['Vérifier rapidement sur place', 'Compléter le signalement', 'Coordonner l\'équipe locale'],
    },
    {
      role: 'Administration',
      desc: 'La mairie valide localement, le préfet escalade si besoin, le gouverneur décide de la diffusion à l\'échelle régionale.',
      actions: ['Tableau de bord temps réel', 'Validation multi-niveaux', 'Diffusion multi-canal'],
    },
  ];
  return (
    <section id="how" style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container()}>
        <SectionHeader
          eyebrow="Fonctionnement"
          title="Une chaîne courte, traçable, humaine."
          lede="Chaque alerte passe par une chaîne de validation humaine. Toutes les actions sont horodatées, attribuées et auditables."
        />
        <div style={{ marginTop: 72 }}>
          {steps.map((s, i) => (
            <div key={s.role} style={{
              display: 'grid', gridTemplateColumns: '80px 1fr 2fr', gap: 48,
              padding: '40px 0', borderTop: `1px solid ${LINE_2}`,
              ...(i === steps.length - 1 ? { borderBottom: `1px solid ${LINE_2}` } : {}),
              alignItems: 'start',
            }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: FADED, letterSpacing: '0.08em', paddingTop: 6 }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <div>
                <h3 style={{ ...SERIF, fontSize: '1.5rem', fontWeight: 500, color: INK, margin: 0, letterSpacing: '-0.02em' }}>
                  {s.role}
                </h3>
              </div>
              <div>
                <p style={{ fontSize: '1rem', color: MUTED, lineHeight: 1.65, margin: '0 0 20px' }}>{s.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {s.actions.map((a) => (
                    <li key={a} style={{
                      fontSize: '0.88rem', color: INK_2, padding: '8px 0',
                      borderTop: `1px solid ${LINE_2}`,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}>
                      <span style={{ color: FADED }}>—</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Showcase (les 2 visuels uploadés) ───────────────────────────────────────
function Showcase() {
  const items = [
    {
      src: '/hero-banner.jpg',
      alt: 'OLEL — L\'alerte précoce au service des communautés',
      caption: 'Application citoyen, dashboard autorités, bot WhatsApp et diffusion multi-canal.',
    },
    {
      src: '/overview.jpg',
      alt: 'OLEL — L\'alerte précoce, la sécurité de tous',
      caption: 'Du signalement à l\'action : interface mobile, tableau de bord temps réel, canaux de notification.',
    },
  ];
  return (
    <section style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container()}>
        <SectionHeader eyebrow="Aperçu" title="Le système en image." />
        <div style={{ marginTop: 64, display: 'flex', flexDirection: 'column', gap: 48 }}>
          {items.map((it) => (
            <figure key={it.src} style={{ margin: 0 }}>
              <div style={{
                borderRadius: 12, overflow: 'hidden',
                border: `1px solid ${LINE_2}`,
                background: BG_2,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.src} alt={it.alt} style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
              <figcaption style={{
                fontSize: '0.84rem', color: FADED, marginTop: 14,
                textAlign: 'center', lineHeight: 1.5, maxWidth: 640, margin: '14px auto 0',
              }}>
                {it.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Channels ────────────────────────────────────────────────────────────────
function Channels() {
  const items = [
    { code: 'SMS',       num: '21303',         desc: 'Signalement par mot-clé depuis n\'importe quel téléphone, y compris feature phone.' },
    { code: 'USSD',      num: '*123*1#',       desc: 'Menu interactif gratuit en 4 langues, sans connexion internet.' },
    { code: 'IVR',       num: '800 OLEL',      desc: 'Vocal libre, navigation par touches, enregistrement jusqu\'à soixante secondes.' },
    { code: 'WhatsApp',  num: '+221 33 OLEL',  desc: 'Bot multilingue, signalement vocal et texte, traduction IA vers le français.' },
    { code: 'Voice',     num: 'Broadcast',     desc: 'Diffusion automatique d\'appels vocaux à toute une zone en moins de trente minutes.' },
  ];
  return (
    <section id="channels" style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container()}>
        <SectionHeader
          eyebrow="Canaux"
          title="Cinq canaux, aucun citoyen oublié."
          lede="Du smartphone Android au feature phone Nokia, OLEL atteint toutes les couches de la population par les canaux qu'elles utilisent déjà."
        />
        <div style={{ marginTop: 64 }}>
          {items.map((it, i) => (
            <div key={it.code} style={{
              display: 'grid', gridTemplateColumns: '120px 200px 1fr', gap: 32,
              padding: '24px 0', borderTop: `1px solid ${LINE_2}`,
              ...(i === items.length - 1 ? { borderBottom: `1px solid ${LINE_2}` } : {}),
              alignItems: 'baseline',
            }}>
              <div style={{ fontSize: '0.94rem', fontWeight: 600, color: INK, letterSpacing: '-0.005em' }}>
                {it.code}
              </div>
              <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: '0.86rem', color: MUTED_2 }}>
                {it.num}
              </div>
              <p style={{ margin: 0, fontSize: '0.92rem', color: MUTED, lineHeight: 1.6 }}>{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Testimonial ─────────────────────────────────────────────────────────────
function Testimonial() {
  return (
    <section style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container({ maxWidth: 800 })}>
        <div style={eyebrow({ marginBottom: 32 })}>Voix du terrain</div>
        <blockquote style={{
          ...SERIF, fontSize: 'clamp(1.5rem, 2.6vw, 2.1rem)',
          fontWeight: 400, lineHeight: 1.4, color: INK, margin: '0 0 32px',
          letterSpacing: '-0.015em', fontStyle: 'normal',
        }}>
          « Quand l&apos;eau monte, on prévient en priorité les voisins âgés et les
          familles avec enfants. OLEL nous donne enfin l&apos;outil pour le faire vite,
          dans notre langue, et que la mairie nous croie. »
        </blockquote>
        <div style={{ fontSize: '0.88rem', color: MUTED }}>
          <span style={{ color: INK, fontWeight: 600 }}>Aïssatou Diallo</span> · Sentinelle, Thilogne
        </div>
      </div>
    </section>
  );
}

// ── Partners ────────────────────────────────────────────────────────────────
function Partners() {
  const partners = ['ANACIM', 'OMVS', 'OIM', 'DPC', 'Orange', 'Free', 'Expresso', 'Radio Matam FM'];
  return (
    <section id="partners" style={{ padding: '120px 0', background: BG, borderBottom: `1px solid ${LINE_2}` }}>
      <div style={container()}>
        <SectionHeader eyebrow="Partenaires et soutiens" title="Un écosystème en mouvement." />
        <div style={{
          marginTop: 56,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 0,
          borderTop: `1px solid ${LINE_2}`,
        }}>
          {partners.map((p, i) => (
            <div key={p} style={{
              padding: '28px 16px', textAlign: 'center',
              fontSize: '0.9rem', fontWeight: 500, color: MUTED,
              borderBottom: `1px solid ${LINE_2}`,
              borderRight: (i % 4 !== 3) ? `1px solid ${LINE_2}` : 'none',
            }}>{p}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ───────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section id="contact" style={{ padding: '120px 0', background: BG }}>
      <div style={container({ maxWidth: 720, textAlign: 'center' })}>
        <div style={eyebrow({ marginBottom: 32, justifyContent: 'center' })}>Rejoindre le pilote</div>
        <h2 style={{
          ...SERIF, fontSize: 'clamp(2.2rem, 4.5vw, 3.4rem)', fontWeight: 500,
          letterSpacing: '-0.03em', margin: '0 0 24px', color: INK, lineHeight: 1.1,
        }}>
          Travaillons ensemble.
        </h2>
        <p style={{ fontSize: '1.05rem', color: MUTED, lineHeight: 1.65, margin: '0 0 40px' }}>
          Bailleurs internationaux, journalistes, autorités sénégalaises, sentinelles
          candidates : contactez l&apos;équipe pour découvrir OLEL en détail ou rejoindre
          le réseau communautaire.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="mailto:contact@olel.app" style={btn('primary')}>Contacter l&apos;équipe</a>
          <a href="mailto:sentinelle@olel.app" style={btn('ghost')}>Devenir sentinelle</a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    { title: 'Projet', links: ['Vision', 'Fonctionnement', 'Cartographie', 'Rapport pilote'] },
    { title: 'Ressources', links: ['Dossier de cadrage', 'Documentation API', 'Charte sentinelle', 'Pack presse'] },
    { title: 'Contact', links: ['contact@olel.app', 'sentinelle@olel.app', 'Matam · Sénégal'] },
  ];
  return (
    <footer style={{ background: BG, borderTop: `1px solid ${LINE}`, padding: '64px 0 32px' }}>
      <div style={container()}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 56 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="OLEL" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <span style={{ ...SERIF, fontSize: '1.05rem', fontWeight: 600, color: INK, letterSpacing: '-0.015em' }}>OLEL</span>
            </div>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.65, margin: 0, color: MUTED, maxWidth: 360 }}>
              Plateforme communautaire d&apos;alerte précoce multi-risques pour la région
              de Matam, Sénégal. Multilingue, multi-canal, ancrée local.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: INK, letterSpacing: '0.04em', marginBottom: 16, textTransform: 'uppercase' }}>{c.title}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {c.links.map((l) => (
                  <li key={l} style={{ fontSize: '0.86rem', padding: '6px 0', color: MUTED }}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${LINE_2}`, paddingTop: 28, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: '0.78rem', color: FADED }}>
            © 2026 OLEL · Région de Matam, Sénégal
          </div>
          <div style={{ fontSize: '0.78rem', color: FADED }}>
            Conformité loi 2008-12 · RGPD · CNDP Sénégal
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Utilitaires ─────────────────────────────────────────────────────────────
function container(extra: React.CSSProperties = {}): React.CSSProperties {
  return { maxWidth: 1100, margin: '0 auto', padding: '0 32px', ...extra };
}

function eyebrow(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    fontSize: '0.74rem', fontWeight: 600, color: FADED,
    letterSpacing: '0.12em', textTransform: 'uppercase',
    ...extra,
  };
}

function btn(variant: 'primary' | 'ghost'): React.CSSProperties {
  if (variant === 'primary') {
    return {
      background: INK, color: 'white', padding: '13px 22px',
      borderRadius: 8, fontSize: '0.92rem', fontWeight: 500,
      textDecoration: 'none', display: 'inline-block', letterSpacing: '-0.005em',
    };
  }
  return {
    background: BG, color: INK, padding: '13px 22px',
    borderRadius: 8, fontSize: '0.92rem', fontWeight: 500,
    textDecoration: 'none', display: 'inline-block', border: `1px solid ${LINE}`,
  };
}

// ── Section header partagé (eyebrow + titre serif + lede optionnel) ─────────
function SectionHeader({ eyebrow: eb, title, lede }: { eyebrow: string; title: string; lede?: string }) {
  return (
    <div>
      <div style={eyebrow({ marginBottom: 24 })}>{eb}</div>
      <h2 style={{
        ...SERIF, fontSize: 'clamp(2rem, 4vw, 2.8rem)', fontWeight: 500,
        letterSpacing: '-0.025em', margin: '0 0 20px', color: INK, lineHeight: 1.1,
        maxWidth: 680,
      }}>
        {title}
      </h2>
      {lede && (
        <p style={{ fontSize: '1.05rem', color: MUTED, lineHeight: 1.65, margin: 0, maxWidth: 620 }}>
          {lede}
        </p>
      )}
    </div>
  );
}
