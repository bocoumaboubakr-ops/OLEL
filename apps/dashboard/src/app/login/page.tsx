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

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f0f4f8' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: '#1a3c5e', borderRadius: 16, fontSize: '1.8rem', marginBottom: 16 }}>🚨</div>
            <h1 style={{ margin: '0 0 6px', fontSize: '1.6rem', fontWeight: 800, color: '#1a3c5e', letterSpacing: '-0.5px' }}>OLEL</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem' }}>
              Plateforme d'alerte précoce multi-risques<br />
              <span style={{ fontSize: '0.8rem' }}>Région de Matam · Sénégal</span>
            </p>
          </div>

          {mfa ? (
          <div style={{ background: 'white', borderRadius: 16, padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#1a3c5e', fontWeight: 700 }}>
              {mfa.setupRequired ? '🔐 Activer la double authentification' : '🔐 Code de vérification'}
            </h2>

            {mfa.setupRequired && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: '0.85rem', color: '#374151', margin: '0 0 12px' }}>
                  Votre rôle exige la double authentification (TOTP). Ajoutez ce compte dans une
                  application comme <strong>Google Authenticator</strong> ou <strong>FreeOTP</strong> :
                </p>
                <div style={{ background: '#f1f5f9', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>CLÉ SECRÈTE À SAISIR</p>
                  <code style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: 1, wordBreak: 'break-all', color: '#1a3c5e' }}>{mfa.secret}</code>
                </div>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>
                  Puis saisissez le code à 6 chiffres généré par l'application.
                </p>
              </div>
            )}

            {!mfa.setupRequired && (
              <p style={{ fontSize: '0.85rem', color: '#374151', margin: '0 0 16px' }}>
                Saisissez le code à 6 chiffres de votre application d'authentification.
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
                style={{ width: '100%', padding: '13px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '1.4rem', textAlign: 'center', letterSpacing: 8, fontWeight: 700, boxSizing: 'border-box', outline: 'none', marginBottom: 16 }}
              />

              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.88rem', borderLeft: '3px solid #dc2626' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || totpCode.length !== 6}
                style={{ width: '100%', background: loading || totpCode.length !== 6 ? '#93c5fd' : '#1a3c5e', color: 'white', border: 'none', padding: '13px', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 10 }}>
                {loading ? '⏳ Vérification…' : mfa.setupRequired ? 'Activer et se connecter →' : 'Vérifier →'}
              </button>
              <button type="button" onClick={cancelMfa}
                style={{ width: '100%', background: 'none', color: '#64748b', border: 'none', padding: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                ← Retour
              </button>
            </form>
          </div>
          ) : (
          <div style={{ background: 'white', borderRadius: 16, padding: '32px 28px', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.05rem', color: '#1a3c5e', fontWeight: 700 }}>Connexion</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>
                  📱 Numéro de téléphone
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); validatePhone(e.target.value); }}
                    placeholder="+221700000000"
                    required
                    autoComplete="tel"
                    style={{ width: '100%', padding: '11px 40px 11px 14px', border: `1.5px solid ${phoneError ? '#dc2626' : phone && !phoneError ? '#16a34a' : '#e2e8f0'}`, borderRadius: 10, fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
                  />
                  {phone && !phoneError && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#16a34a' }}>✓</span>}
                </div>
                {phoneError && <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#dc2626' }}>{phoneError}</p>}
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>🔒 Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    style={{ width: '100%', padding: '11px 42px 11px 14px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: '1rem', boxSizing: 'border-box', outline: 'none' }}
                  />
                  <button type="button" onClick={() => setShowPwd((v) => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}>
                    {showPwd ? '🙈' : '👁'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.88rem', borderLeft: '3px solid #dc2626' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading || !!phoneError}
                style={{ width: '100%', background: loading ? '#93c5fd' : '#1a3c5e', color: 'white', border: 'none', padding: '13px', borderRadius: 10, fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? '⏳ Connexion…' : 'Se connecter →'}
              </button>
            </form>
          </div>
          )}

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: '0.76rem', color: '#94a3b8' }}>
            Accès réservé aux agents OLEL · Matam
          </p>
        </div>
      </div>
    </div>
  );
}
