// Landing publique OLEL — page institutionnelle pour bailleurs, presse, autorités.
// Style : minimal pro slate-900 cohérent avec dashboard + mobile, accents serif
// pour les titres hero (Source Serif 4 italic).

const SERIF: React.CSSProperties = { fontFamily: 'var(--font-display), Georgia, serif' };
const SLATE_900 = '#0F172A';
const SLATE_700 = '#334155';
const SLATE_500 = '#64748B';
const SLATE_400 = '#94A3B8';
const SLATE_200 = '#E5E7EB';
const SLATE_100 = '#F1F5F9';
const SLATE_50 = '#FAFAFA';
const RED_600 = '#DC2626';
const SAND = '#F5EEDD';

export default function LandingPage() {
  return (
    <main>
      <Nav />
      <Hero />
      <StatsStrip />
      <Vision />
      <HowItWorks />
      <LiveDemo />
      <Channels />
      <Showcase />
      <Testimonial />
      <Partners />
      <FinalCTA />
      <Footer />
    </main>
  );
}

// ── 1. Nav sticky ────────────────────────────────────────────────────────────
function Nav() {
  const links = [
    { href: '#vision', label: 'Notre vision' },
    { href: '#how', label: 'Comment ça marche' },
    { href: '#channels', label: 'Canaux' },
    { href: '#partners', label: 'Partenaires' },
    { href: '#contact', label: 'Contact' },
  ];
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(250, 250, 250, 0.85)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${SLATE_100}`,
    }}>
      <div style={container({ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 64 })}>
        <a href="#top" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: SLATE_900 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="OLEL" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <span style={{ fontSize: '0.78rem', color: SLATE_500, fontWeight: 500 }}>Matam</span>
        </a>
        <div style={{ display: 'flex', gap: 4 }}>
          {links.map((l) => (
            <a key={l.href} href={l.href} style={{
              color: SLATE_700, fontSize: '0.86rem', fontWeight: 500, textDecoration: 'none',
              padding: '6px 12px', borderRadius: 6,
            }}>{l.label}</a>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['FR', 'FF', 'WO', 'SN'].map((l) => (
            <span key={l} style={{
              fontSize: '0.74rem', fontWeight: 600, color: l === 'FR' ? SLATE_900 : SLATE_400,
              padding: '4px 8px', borderRadius: 5, background: l === 'FR' ? SLATE_100 : 'transparent',
            }}>{l}</span>
          ))}
        </div>
      </div>
    </nav>
  );
}

// ── 2. Hero ──────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section id="top" style={{ background: 'white', paddingTop: 64, paddingBottom: 80, position: 'relative', overflow: 'hidden' }}>
      <div style={container({ position: 'relative', zIndex: 2, display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 56, alignItems: 'center' })}>
        <div>
          <div style={{
            display: 'inline-block', fontSize: '0.72rem', fontWeight: 600,
            color: RED_600, letterSpacing: '0.14em', textTransform: 'uppercase',
            background: '#FEF2F2', padding: '5px 12px', borderRadius: 6, marginBottom: 28,
          }}>
            Région de Matam · Sénégal · Pilote 2026
          </div>
          <h1 style={{
            ...SERIF, fontSize: 'clamp(2.5rem, 5vw, 4.6rem)', fontWeight: 600,
            letterSpacing: '-0.04em', lineHeight: 1.02, margin: '0 0 24px',
            color: SLATE_900,
          }}>
            Alerter{' '}
            <em style={{ fontStyle: 'italic', fontWeight: 400, color: RED_600 }}>autrement.</em>
          </h1>
          <p style={{
            fontSize: '1.1rem', lineHeight: 1.6, color: SLATE_700,
            margin: '0 0 32px',
          }}>
            OLEL est une plateforme communautaire d&apos;alerte précoce multi-risques pour la
            <strong style={{ color: SLATE_900 }}> région de Matam</strong>, conçue pour fonctionner
            en <strong style={{ color: SLATE_900 }}>4 langues</strong> (français, pulaar, wolof, soninké)
            et sur <strong style={{ color: SLATE_900 }}>tout terminal</strong> — du smartphone à l&apos;USSD,
            en passant par WhatsApp, SMS et la radio.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a href="#how" style={btn('primary')}>Comment ça marche</a>
            <a href="#contact" style={btn('ghost')}>Télécharger le dossier</a>
          </div>
        </div>
        {/* Logo OLEL en grand format à droite */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="OLEL — Système Communautaire Intelligent d'alerte précoce"
            style={{ width: '100%', maxWidth: 360, height: 'auto', objectFit: 'contain' }}
          />
        </div>
      </div>
      {/* halo discret */}
      <div style={{
        position: 'absolute', bottom: -120, right: -120,
        width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(220, 38, 38, 0.06), transparent 70%)',
        pointerEvents: 'none',
      }} />
    </section>
  );
}

// ── 3. Strip stats ───────────────────────────────────────────────────────────
function StatsStrip() {
  const stats = [
    { value: '562k', label: 'Habitants couverts' },
    { value: '4', label: 'Langues supportées' },
    { value: '5', label: 'Familles de risque' },
    { value: '12 mois', label: 'Phase pilote' },
  ];
  return (
    <section style={{ background: SLATE_900, padding: '64px 0', color: 'white' }}>
      <div style={container({ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32 })}>
        {stats.map((s) => (
          <div key={s.label}>
            <div style={{ ...SERIF, fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 400, letterSpacing: '-0.03em', lineHeight: 1, color: 'white' }}>
              {s.value}
            </div>
            <div style={{ fontSize: '0.82rem', color: SLATE_400, marginTop: 8, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 4. Vision ────────────────────────────────────────────────────────────────
function Vision() {
  const values = [
    {
      key: 'Eau', accent: '#0EA5E9',
      title: 'Le fleuve d\'abord',
      body: 'OLEL est ancré dans la réalité hydrologique du bassin du fleuve Sénégal — crues, sécheresses, qualité de l\'eau. Les données OMVS alimentent en continu le système.',
    },
    {
      key: 'Voix', accent: RED_600,
      title: 'La voix compte',
      body: 'Une grand-mère de Soringho doit pouvoir alerter en pulaar à la voix. Le signalement vocal est le canal premier — texte et lecture viennent ensuite.',
    },
    {
      key: 'Lien', accent: '#16A34A',
      title: 'Sentinelle & mairie',
      body: 'Pas d\'alerte sans validation humaine. Les sentinelles formées (ASC, leaders communautaires) vérifient sur le terrain, la mairie valide, le préfet diffuse.',
    },
  ];
  return (
    <section id="vision" style={{ padding: '96px 0', background: 'white' }}>
      <div style={container()}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 64, marginBottom: 56, alignItems: 'start' }}>
          <div>
            <div style={eyebrow()}>Notre vision</div>
            <h2 style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '12px 0 0', color: SLATE_900, lineHeight: 1.1 }}>
              Trois valeurs<br /><em style={{ fontWeight: 400 }}>guident le projet.</em>
            </h2>
          </div>
          <p style={{ fontSize: '1.05rem', color: SLATE_700, lineHeight: 1.7, margin: '8px 0 0', maxWidth: 580 }}>
            OLEL n&apos;est ni une app, ni un produit télécom, ni un outil administratif. C&apos;est l&apos;articulation
            entre une <strong style={{ color: SLATE_900 }}>communauté</strong>, une <strong style={{ color: SLATE_900 }}>autorité</strong>,
            et des <strong style={{ color: SLATE_900 }}>canaux multiples</strong>, dans un environnement où la connectivité
            est rare et la confiance est tout.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {values.map((v) => (
            <div key={v.key} style={{ background: SLATE_50, border: `1px solid ${SLATE_100}`, borderRadius: 14, padding: 28 }}>
              <div style={{ ...SERIF, fontSize: '2.4rem', fontWeight: 400, color: v.accent, lineHeight: 1, letterSpacing: '-0.02em', marginBottom: 16 }}>
                {v.key}
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 600, color: SLATE_900, marginBottom: 10, letterSpacing: '-0.01em' }}>{v.title}</div>
              <p style={{ fontSize: '0.92rem', color: SLATE_700, lineHeight: 1.6, margin: 0 }}>{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 5. Comment ça marche ────────────────────────────────────────────────────
function HowItWorks() {
  const roles = [
    {
      n: '01', title: 'Citoyen', accent: SLATE_900, bg: SLATE_50, border: SLATE_200,
      desc: 'Signale un risque en vocal dans sa langue, par WhatsApp, application mobile, SMS ou USSD.',
      actions: ['Signaler un incident', 'Consulter les alertes de sa zone', 'Recevoir les bulletins'],
      footer: 'WhatsApp · App · SMS · USSD',
    },
    {
      n: '02', title: 'Sentinelle', accent: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0',
      desc: 'Volontaire formé qui vérifie sur le terrain (photo, GPS, gravité) et fait remonter à la mairie.',
      actions: ['Vérifier en moins de 30 min', 'Compléter le signalement', 'Coordonner l\'équipe locale'],
      footer: 'App sentinelle · Formation OLEL',
    },
    {
      n: '03', title: 'Administration', accent: '#0EA5E9', bg: '#F0F9FF', border: '#BAE6FD',
      desc: 'La mairie valide, le préfet escalade si besoin, le gouverneur diffuse à l\'échelle régionale.',
      actions: ['Tableau de bord temps réel', 'Validation multi-niveaux', 'Diffusion multi-canal'],
      footer: 'Dashboard · Carte SIG · Audit',
    },
  ];
  return (
    <section id="how" style={{ padding: '96px 0', background: SLATE_50 }}>
      <div style={container()}>
        <div style={{ marginBottom: 56, maxWidth: 720 }}>
          <div style={eyebrow()}>Comment ça marche</div>
          <h2 style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '12px 0 16px', color: SLATE_900, lineHeight: 1.1 }}>
            Trois rôles,<br /><em style={{ fontWeight: 400 }}>une seule chaîne.</em>
          </h2>
          <p style={{ fontSize: '1.05rem', color: SLATE_700, lineHeight: 1.6, margin: 0 }}>
            Chaque alerte passe par une chaîne de validation humaine traçable du signalement à la diffusion.
            Tous les rôles sont outillés par OLEL.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {roles.map((r) => (
            <div key={r.n} style={{ background: r.bg, border: `1px solid ${r.border}`, borderRadius: 14, padding: 28 }}>
              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: r.accent, letterSpacing: '0.1em', marginBottom: 8 }}>{r.n}</div>
              <h3 style={{ ...SERIF, fontSize: '1.7rem', fontWeight: 600, margin: '0 0 12px', color: SLATE_900, letterSpacing: '-0.02em' }}>{r.title}</h3>
              <p style={{ fontSize: '0.92rem', color: SLATE_700, lineHeight: 1.6, margin: '0 0 18px' }}>{r.desc}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                {r.actions.map((a) => (
                  <li key={a} style={{ fontSize: '0.86rem', color: SLATE_900, padding: '6px 0', borderTop: `1px solid ${r.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: r.accent }} />
                    {a}
                  </li>
                ))}
              </ul>
              <div style={{ fontSize: '0.74rem', color: SLATE_500, fontWeight: 500, paddingTop: 12, borderTop: `1px solid ${r.border}` }}>
                {r.footer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 6. Vue régionale (démo carte) ────────────────────────────────────────────
function LiveDemo() {
  return (
    <section style={{ padding: '96px 0', background: 'white' }}>
      <div style={container()}>
        <div style={{
          background: SLATE_900, borderRadius: 20, overflow: 'hidden',
          color: 'white', padding: 0,
        }}>
          <div style={{ padding: '32px 36px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ ...eyebrow(), color: SLATE_400, marginBottom: 8 }}>Centre de commandement</div>
              <h2 style={{ ...SERIF, fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 600, margin: 0, color: 'white', letterSpacing: '-0.02em' }}>
                Une vue régionale, <em style={{ fontWeight: 400 }}>temps réel.</em>
              </h2>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'rgba(43, 179, 199, 0.15)', borderRadius: 6, fontSize: '0.74rem', fontWeight: 600, color: '#7DD3FC' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2BB3C7', animation: 'pulse 2s ease-in-out infinite' }} />
              En direct
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 0, marginTop: 24 }}>
            {/* Map mock */}
            <div style={{
              background: '#0A1A2C', minHeight: 360,
              backgroundImage: `radial-gradient(circle at 35% 45%, rgba(220, 83, 30, 0.35) 0, transparent 25%),
                                radial-gradient(circle at 65% 60%, rgba(216, 154, 29, 0.25) 0, transparent 22%),
                                radial-gradient(circle at 22% 70%, rgba(43, 179, 199, 0.22) 0, transparent 20%),
                                linear-gradient(135deg, transparent 40%, rgba(43, 179, 199, 0.08) 50%, transparent 60%)`,
              backgroundSize: 'cover',
              padding: 28, position: 'relative',
            }}>
              <div style={{ position: 'absolute', top: 16, left: 16, fontSize: '0.72rem', color: SLATE_400, fontWeight: 500 }}>
                MATAM · Bassin du fleuve Sénégal
              </div>
              {/* Pins */}
              <Pin left="33%" top="44%" color={RED_600} size={20} pulse />
              <Pin left="64%" top="58%" color="#D89A1D" size={16} />
              <Pin left="22%" top="68%" color="#2BB3C7" size={12} />
              <Pin left="78%" top="32%" color="#16A34A" size={10} />
              <Pin left="50%" top="78%" color="#16A34A" size={10} />
              <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: SLATE_400 }}>
                <span>OMVS · Niveau fleuve : <strong style={{ color: '#7DD3FC' }}>4,82 m</strong></span>
                <span>Sentinelles actives : <strong style={{ color: '#86EFAC' }}>23/27</strong></span>
              </div>
            </div>
            {/* Alerts list */}
            <div style={{ padding: '28px 32px', borderLeft: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AlertRow level="urgent" title="Crue · Soringho" zone="Kanel · 2h" />
              <AlertRow level="vigilance" title="Pluie torrentielle" zone="Matam Ville · 4h" />
              <AlertRow level="info" title="Bulletin santé" zone="Région · 1j" />
              <div style={{ fontSize: '0.7rem', color: SLATE_400, marginTop: 'auto', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                Données réelles à la mise en service · automne 2026
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pin({ left, top, color, size, pulse }: { left: string; top: string; color: string; size: number; pulse?: boolean }) {
  return (
    <div style={{
      position: 'absolute', left, top, width: size, height: size,
      borderRadius: '50%', background: color,
      boxShadow: pulse ? `0 0 0 ${size * 0.4}px ${color}33, 0 0 0 ${size * 0.8}px ${color}11` : 'none',
      animation: pulse ? 'ping 2.5s ease-in-out infinite' : 'none',
    }} />
  );
}

function AlertRow({ level, title, zone }: { level: 'urgent' | 'vigilance' | 'info'; title: string; zone: string }) {
  const colors = { urgent: RED_600, vigilance: '#D89A1D', info: '#2BB3C7' };
  const labels = { urgent: 'Urgent', vigilance: 'Vigilance', info: 'Info' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.66rem', color: colors[level], fontWeight: 600, background: `${colors[level]}1f`, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.02em' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: colors[level] }} />
          {labels[level]}
        </span>
      </div>
      <div style={{ fontSize: '0.92rem', fontWeight: 500, color: 'white' }}>{title}</div>
      <div style={{ fontSize: '0.72rem', color: SLATE_400 }}>{zone}</div>
    </div>
  );
}

// ── 7. Canaux ────────────────────────────────────────────────────────────────
function Channels() {
  const items = [
    { code: 'SMS',       num: '21303',         label: 'Numéro court',       desc: 'Signaler par mot-clé depuis n\'importe quel téléphone, même feature phone.' },
    { code: 'USSD',      num: '*123*1#',       label: 'Menu interactif',    desc: 'Pour les téléphones sans data. Menu vocal en 4 langues, accessible gratuitement.' },
    { code: 'IVR',       num: '800 OLEL',      label: 'Vocal gratuit',      desc: 'Appel vocal libre, navigation par touches. Enregistrement de signalements jusqu\'à 60 sec.' },
    { code: 'WhatsApp',  num: '+221 33 OLEL',  label: 'Bot multilingue',    desc: 'Signalement vocal et texte. Traduction IA automatique vers le français pour les agents.' },
    { code: 'Voice',     num: 'Broadcast',     label: 'Appels massifs',     desc: 'Diffusion automatique d\'alertes vocales à toute une zone géographique en moins de 30 min.' },
  ];
  return (
    <section id="channels" style={{ padding: '96px 0', background: SAND }}>
      <div style={container()}>
        <div style={{ marginBottom: 56, maxWidth: 720 }}>
          <div style={eyebrow()}>Canaux de diffusion</div>
          <h2 style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '12px 0 16px', color: SLATE_900, lineHeight: 1.1 }}>
            Cinq canaux,<br /><em style={{ fontWeight: 400 }}>aucun citoyen oublié.</em>
          </h2>
          <p style={{ fontSize: '1.05rem', color: SLATE_700, lineHeight: 1.6, margin: 0 }}>
            Du smartphone Android au feature phone Nokia, OLEL atteint toutes les couches de la population
            par les canaux qu&apos;ils utilisent déjà.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {items.map((it) => (
            <div key={it.code} style={{ background: 'white', borderRadius: 12, padding: 24, border: `1px solid ${SLATE_100}` }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: SLATE_900, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.78rem', fontWeight: 600, marginBottom: 16, letterSpacing: '0.02em' }}>
                {it.code === 'WhatsApp' ? 'WA' : it.code === 'Voice' ? 'VB' : it.code}
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: SLATE_900, marginBottom: 4, letterSpacing: '-0.005em' }}>{it.code}</div>
              <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: '0.86rem', color: RED_600, fontWeight: 600, marginBottom: 10 }}>{it.num}</div>
              <p style={{ fontSize: '0.84rem', color: SLATE_700, lineHeight: 1.55, margin: 0 }}>{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 7b. Showcase (visuels de communication) ─────────────────────────────────
function Showcase() {
  const items = [
    {
      src: '/hero-banner.jpg',
      alt: 'OLEL — L\'alerte précoce au service des communautés',
      caption: 'Vue d\'ensemble OLEL : application citoyen, dashboard autorités, bot WhatsApp, diffusion multi-canal SMS/IVR/WhatsApp.',
    },
    {
      src: '/overview.jpg',
      alt: 'OLEL — L\'alerte précoce, la sécurité de tous',
      caption: 'Du signalement à l\'action : application mobile, tableau de bord temps réel, canaux de notification et bénéfices pour la communauté.',
    },
  ];
  return (
    <section style={{ padding: '96px 0', background: 'white' }}>
      <div style={container()}>
        <div style={{ marginBottom: 40, maxWidth: 720 }}>
          <div style={eyebrow()}>Le système en image</div>
          <h2 style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '12px 0 16px', color: SLATE_900, lineHeight: 1.1 }}>
            Découvrir <em style={{ fontWeight: 400 }}>OLEL en un clin d&apos;œil.</em>
          </h2>
          <p style={{ fontSize: '1.05rem', color: SLATE_700, lineHeight: 1.6, margin: 0 }}>
            Trois interfaces, cinq canaux, une seule mission : prévenir, alerter, protéger.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {items.map((it) => (
            <figure key={it.src} style={{ margin: 0 }}>
              <div style={{
                borderRadius: 18, overflow: 'hidden',
                border: `1px solid ${SLATE_100}`,
                background: SLATE_50,
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={it.src}
                  alt={it.alt}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              <figcaption style={{
                fontSize: '0.86rem', color: SLATE_500, marginTop: 12,
                fontStyle: 'italic', textAlign: 'center', lineHeight: 1.5,
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

// ── 8. Témoignage ────────────────────────────────────────────────────────────
function Testimonial() {
  return (
    <section style={{ padding: '96px 0', background: '#F0FDF4', position: 'relative', overflow: 'hidden' }}>
      <div style={container({ position: 'relative', zIndex: 2 })}>
        <div style={{ maxWidth: 760 }}>
          <div style={{ ...eyebrow(), color: '#16A34A', marginBottom: 16 }}>Voix du terrain</div>
          <blockquote style={{
            ...SERIF, fontStyle: 'italic', fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
            fontWeight: 400, lineHeight: 1.35, color: SLATE_900, margin: '0 0 28px',
            letterSpacing: '-0.02em',
          }}>
            « Quand l&apos;eau monte, on prévient en priorité les voisins âgés et les familles
            avec enfants. OLEL nous donne enfin l&apos;outil pour le faire vite, dans notre langue,
            et que la mairie nous croie. »
          </blockquote>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: '#16A34A', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 600, fontSize: '0.95rem',
            }}>AD</div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: SLATE_900 }}>Aïssatou Diallo</div>
              <div style={{ fontSize: '0.82rem', color: SLATE_500 }}>Sentinelle · Thilogne</div>
            </div>
          </div>
        </div>
        {/* Décor guillemet */}
        <div style={{
          position: 'absolute', top: 40, right: -40, ...SERIF,
          fontSize: '20rem', color: 'rgba(22, 163, 74, 0.08)', fontWeight: 400, lineHeight: 1,
          pointerEvents: 'none', userSelect: 'none',
        }}>«</div>
      </div>
    </section>
  );
}

// ── 9. Partenaires ───────────────────────────────────────────────────────────
function Partners() {
  const partners = ['ANACIM', 'OMVS', 'OIM', 'DPC', 'Orange', 'Free', 'Expresso', 'Radio Matam FM'];
  return (
    <section id="partners" style={{ padding: '96px 0', background: 'white' }}>
      <div style={container()}>
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={eyebrow()}>Partenaires et soutiens</div>
          <h2 style={{ ...SERIF, fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 600, margin: '12px 0 0', color: SLATE_900, letterSpacing: '-0.02em' }}>
            Un écosystème en mouvement.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 1, background: SLATE_100, border: `1px solid ${SLATE_100}`, borderRadius: 12, overflow: 'hidden' }}>
          {partners.map((p) => (
            <div key={p} style={{
              background: 'white', padding: '32px 16px', textAlign: 'center',
              fontSize: '0.92rem', fontWeight: 500, color: SLATE_500, letterSpacing: '-0.005em',
            }}>{p}</div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 10. CTA final ────────────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section id="contact" style={{ padding: '96px 0', background: SLATE_900, color: 'white' }}>
      <div style={container({ textAlign: 'center', maxWidth: 760, margin: '0 auto' })}>
        <h2 style={{ ...SERIF, fontSize: 'clamp(2rem, 4vw, 3.2rem)', fontWeight: 600, letterSpacing: '-0.03em', margin: '0 0 20px', color: 'white', lineHeight: 1.1 }}>
          Rejoignez le <em style={{ fontWeight: 400, color: '#FCD34D' }}>pilote.</em>
        </h2>
        <p style={{ fontSize: '1.05rem', color: SLATE_400, lineHeight: 1.6, margin: '0 0 36px', maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          Bailleurs, journalistes, autorités, sentinelles candidates : contactez l&apos;équipe pour découvrir
          OLEL en détail ou rejoindre le réseau de sentinelles communautaires.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="mailto:contact@olel.app" style={{
            background: '#FCD34D', color: SLATE_900, padding: '14px 28px', borderRadius: 10,
            fontSize: '0.95rem', fontWeight: 600, textDecoration: 'none', letterSpacing: '-0.005em',
          }}>Contacter l&apos;équipe</a>
          <a href="mailto:sentinelle@olel.app" style={{
            background: 'transparent', color: 'white', padding: '14px 28px', borderRadius: 10,
            fontSize: '0.95rem', fontWeight: 500, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)',
          }}>Devenir sentinelle</a>
        </div>
      </div>
    </section>
  );
}

// ── 11. Footer ───────────────────────────────────────────────────────────────
function Footer() {
  const cols = [
    { title: 'Le projet', links: ['Notre vision', 'Comment ça marche', 'Cartographie', 'Rapport pilote'] },
    { title: 'Ressources', links: ['Dossier de cadrage (PDF)', 'Documentation API', 'Charte sentinelle', 'Pack presse'] },
    { title: 'Contact', links: ['contact@olel.app', 'sentinelle@olel.app', 'Matam · Sénégal', '+221 33 OLEL'] },
  ];
  return (
    <footer style={{ background: '#0A1018', color: SLATE_400, padding: '64px 0 32px' }}>
      <div style={container()}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 48, marginBottom: 48 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="OLEL" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(1.4)' }} />
              <span style={{ ...SERIF, fontSize: '1.4rem', fontWeight: 600, color: 'white', letterSpacing: '-0.02em' }}>OLEL</span>
            </div>
            <p style={{ fontSize: '0.86rem', lineHeight: 1.6, margin: 0, color: SLATE_400, maxWidth: 320 }}>
              Plateforme communautaire d&apos;alerte précoce multi-risques pour la région de Matam, Sénégal.
              Multilingue, multi-canal, ancrée local.
            </p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'white', letterSpacing: '0.02em', marginBottom: 14 }}>{c.title}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {c.links.map((l) => (
                  <li key={l} style={{ fontSize: '0.84rem', padding: '5px 0', color: SLATE_400 }}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ fontSize: '0.76rem', color: SLATE_500 }}>
            © 2026 OLEL · Région de Matam, Sénégal
          </div>
          <div style={{ fontSize: '0.76rem', color: SLATE_500 }}>
            Conformité loi 2008-12 · RGPD · CNDP Sénégal
          </div>
        </div>
      </div>
    </footer>
  );
}

// ── Utilitaires ──────────────────────────────────────────────────────────────
function container(extra: React.CSSProperties = {}): React.CSSProperties {
  return { maxWidth: 1200, margin: '0 auto', padding: '0 32px', ...extra };
}

function eyebrow(): React.CSSProperties {
  return {
    fontSize: '0.72rem', fontWeight: 600, color: SLATE_500,
    letterSpacing: '0.14em', textTransform: 'uppercase',
  };
}

function btn(variant: 'primary' | 'ghost'): React.CSSProperties {
  if (variant === 'primary') {
    return {
      background: SLATE_900, color: 'white', padding: '14px 24px',
      borderRadius: 10, fontSize: '0.95rem', fontWeight: 600,
      textDecoration: 'none', display: 'inline-block', letterSpacing: '-0.005em',
    };
  }
  return {
    background: 'white', color: SLATE_900, padding: '14px 24px',
    borderRadius: 10, fontSize: '0.95rem', fontWeight: 500,
    textDecoration: 'none', display: 'inline-block', border: `1px solid ${SLATE_200}`,
  };
}
