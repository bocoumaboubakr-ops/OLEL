'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login, loading, error, user, initialized, mfa, submitTotp, cancelMfa } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [totpCode, setTotpCode] = useState('');

  useEffect(() => {
    if (initialized && user) window.location.href = '/';
  }, [initialized, user]);

  const validatePhone = (v: string) => {
    if (v && !/^\+\d{8,15}$/.test(v)) setPhoneError('Format attendu : +221XXXXXXXXX');
    else setPhoneError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneError) return;
    await login(phone, password);
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totpCode.length !== 6) return;
    await submitTotp(totpCode);
  };

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid #E5E7EB',
    borderRadius: 8,
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    background: 'white',
  };

  const primaryBtn = (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    background: disabled ? '#94A3B8' : '#0F172A',
    color: 'white',
    border: 'none',
    padding: '12px',
    borderRadius: 8,
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '-0.01em',
  });

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FAFAFA' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ margin: '0 0 4px', fontSize: '1.8rem', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.03em' }}>OLEL</h1>
            <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>
              Alerte précoce · Matam, Sénégal
            </p>
          </div>

          {mfa ? (
            <div style={{ background: 'white', borderRadius: 12, padding: '28px 24px', border: '1px solid #F1F5F9' }}>
              <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>
                {mfa.setupRequired ? 'Activer la double authentification' : 'Code de vérification'}
              </h2>

              {mfa.setupRequired && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 12px', lineHeight: 1.55 }}>
                    Votre rôle exige la double authentification (TOTP). Ajoutez ce compte dans <strong>Google Authenticator</strong> ou <strong>FreeOTP</strong> :
                  </p>
                  <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Clé secrète à saisir</p>
                    <code style={{ fontSize: '0.9rem', fontWeight: 600, letterSpacing: 0.5, wordBreak: 'break-all', color: '#0F172A' }}>{mfa.secret}</code>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#94A3B8', margin: 0 }}>
                    Puis saisissez le code à 6 chiffres généré par l&apos;application.
                  </p>
                </div>
              )}

              {!mfa.setupRequired && (
                <p style={{ fontSize: '0.85rem', color: '#475569', margin: '0 0 16px', lineHeight: 1.55 }}>
                  Saisissez le code à 6 chiffres de votre application d&apos;authentification.
                </p>
              )}

              <form onSubmit={handleTotpSubmit}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  style={{ ...inp, padding: '14px', fontSize: '1.3rem', textAlign: 'center', letterSpacing: '0.4em', fontWeight: 600, marginBottom: 14 }}
                />

                {error && (
                  <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.85rem' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || totpCode.length !== 6} style={primaryBtn(loading || totpCode.length !== 6)}>
                  {loading ? 'Vérification…' : mfa.setupRequired ? 'Activer et se connecter' : 'Vérifier'}
                </button>
                <button type="button" onClick={cancelMfa}
                  style={{ width: '100%', background: 'none', color: '#64748B', border: 'none', padding: '10px 0 0', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500 }}>
                  Retour
                </button>
              </form>
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 12, padding: '28px 24px', border: '1px solid #F1F5F9' }}>
              <h2 style={{ margin: '0 0 22px', fontSize: '1.05rem', color: '#0F172A', fontWeight: 600, letterSpacing: '-0.01em' }}>Connexion</h2>
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.82rem', color: '#475569' }}>
                    Numéro de téléphone
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); validatePhone(e.target.value); }}
                    placeholder="+221700000000"
                    required
                    autoComplete="tel"
                    style={{ ...inp, borderColor: phoneError ? '#DC2626' : '#E5E7EB' }}
                  />
                  {phoneError && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#DC2626' }}>{phoneError}</p>}
                </div>

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: '0.82rem', color: '#475569' }}>Mot de passe</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      style={{ ...inp, paddingRight: 60 }}
                    />
                    <button type="button" onClick={() => setShowPwd((v) => !v)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.78rem', fontWeight: 500, padding: '4px 8px' }}>
                      {showPwd ? 'Masquer' : 'Afficher'}
                    </button>
                  </div>
                </div>

                {error && (
                  <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '0.85rem' }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={loading || !!phoneError} style={primaryBtn(loading || !!phoneError)}>
                  {loading ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.76rem', color: '#94A3B8' }}>
            Accès réservé aux agents OLEL
          </p>
        </div>
      </div>
    </div>
  );
}
