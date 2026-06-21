'use client';
import { useState, useEffect, useCallback } from 'react';

/**
 * i18n léger pour l'app mobile citoyen.
 *
 * ⚠️ À FAIRE RELIRE PAR DES LOCUTEURS NATIFS DE MATAM AVANT LE PILOTE.
 * Pulaar (ff), Wolof (wo), Soninké (snk) : base de travail non validée.
 *
 * Règle d'or toponymes :
 *   Les noms de lieux (Soringho, Kanel, Thilogne, Matam…) sont conservés
 *   à l'orthographe locale dans toutes les langues. Ne pas traduire,
 *   ne pas franciser, ne pas translittérer.
 */

export type Lang = 'fr' | 'ff' | 'wo' | 'snk';
export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'ff', label: 'Pulaar', flag: '🌍' },
  { code: 'wo', label: 'Wolof', flag: '🌍' },
  { code: 'snk', label: 'Soninké', flag: '🌍' },
];

/**
 * Salutations natives à afficher à la place d'un « Bonjour » générique :
 * authenticité culturelle, signal fort de respect des langues locales.
 */
export const GREETINGS: Record<Lang, string> = {
  fr: 'Bonjour',
  ff: 'Mballeen',           // Pulaar — salutation collective courante à Matam
  wo: 'Asalaa maalekum',    // Wolof — la plus universelle (salutation islamique)
  snk: 'An salaama',        // Soninké — équivalent
};

type Key =
  | 'appTagline' | 'chooseLang' | 'loginCitizen' | 'loginOperator' | 'phone' | 'password'
  | 'receiveCode' | 'enterCode' | 'codeSent' | 'validate' | 'resendCode' | 'back'
  | 'statusRegion' | 'noAlert' | 'vigilanceZone' | 'alertZone' | 'urgenceZone'
  | 'reportRisk' | 'ofRisk' | 'whichRisk' | 'step1' | 'step2' | 'confirmReport'
  | 'details' | 'optional' | 'describe' | 'gpsAuto' | 'sendReport' | 'sending'
  | 'reportSent' | 'reportSentBody' | 'seeAlerts' | 'alerts' | 'home' | 'report'
  | 'profile' | 'map' | 'logout' | 'language' | 'sos' | 'activeAlerts' | 'recordAudio'
  | 'audioHint' | 'sendAudio' | 'audioRecorded';

const fr: Record<Key, string> = {
  appTagline: 'Alerte précoce multi-risques · Matam',
  chooseLang: 'Choisissez votre langue',
  loginCitizen: '📱 Citoyen — Connexion par SMS',
  loginOperator: '🔒 Opérateur — Mot de passe',
  phone: 'Numéro de téléphone', password: 'Mot de passe',
  receiveCode: 'Recevoir un code SMS →', enterCode: 'Entrez votre code',
  codeSent: 'Code envoyé. Valable 10 minutes.', validate: 'Valider →',
  resendCode: 'Renvoyer le code', back: 'Retour',
  statusRegion: 'Statut — Région Matam', noAlert: 'Aucune alerte en cours',
  vigilanceZone: 'Vigilance dans votre zone', alertZone: 'ALERTE dans votre zone',
  urgenceZone: 'URGENCE — Danger immédiat',
  reportRisk: 'SIGNALER', ofRisk: 'UN RISQUE', whichRisk: 'Quel type de risque ?',
  step1: 'Étape 1 / 2', step2: 'Étape 2 / 2', confirmReport: 'Confirmer le signalement',
  details: 'Précisions', optional: '(facultatif)', describe: 'Décrivez ce que vous observez…',
  gpsAuto: '📍 Votre position GPS sera envoyée automatiquement.',
  sendReport: '🚨 Envoyer le signalement', sending: 'Envoi…',
  reportSent: 'Signalement envoyé !', reportSentBody: 'Votre signalement a été transmis aux autorités.',
  seeAlerts: 'Voir les alertes →', alerts: 'Alertes', home: 'Accueil', report: 'Signaler',
  profile: 'Profil', map: 'Carte', logout: 'Se déconnecter', language: 'Langue', sos: 'SOS',
  activeAlerts: 'Alertes actives', recordAudio: '🎙️ Enregistrer un message vocal',
  audioHint: 'Parlez dans votre langue. Un agent écoutera votre message.',
  sendAudio: 'Envoyer le vocal', audioRecorded: 'Vocal enregistré',
};

// ⚠️ À relire par des natifs
const ff: Record<Key, string> = {
  ...fr,
  appTagline: 'Reentaare bonɗi keewɗi · Matam',
  chooseLang: 'Suɓo ɗemngal maa',
  loginCitizen: '📱 Ɓesngu — Naatugol e SMS',
  loginOperator: '🔒 Gollooɗo — Finnde',
  phone: 'Nimero telefon', password: 'Finnde',
  receiveCode: 'Heɓ kode SMS →', enterCode: 'Naatnu kode maa',
  codeSent: 'Kode neldaama. Newtoo hojomaaji 10.', validate: 'Teeŋtin →',
  resendCode: 'Neldu kode kadi', back: 'Rutto',
  statusRegion: 'Ngonka — Diiwaan Matam', noAlert: 'Alaa reentaare',
  vigilanceZone: 'Reentaare e nokku maa', alertZone: 'REENTAARE e nokku maa',
  urgenceZone: 'HEÑORDE — Bone jooni',
  reportRisk: 'HOLLU', ofRisk: 'BONE', whichRisk: 'Sifaa bone honɗo?',
  step1: 'Tappere 1 / 2', step2: 'Tappere 2 / 2', confirmReport: 'Teeŋtin bone on',
  details: 'Ɓeydooji', optional: '(so a yiɗii)', describe: 'Sifo ko njiyɗaa…',
  gpsAuto: '📍 Nokku maa GPS neldete e jaajol.',
  sendReport: '🚨 Neldu bone on', sending: 'Neldagol…',
  reportSent: 'Bone on neldaama!', reportSentBody: 'Bone maa neldaama laamu.',
  seeAlerts: 'Ƴeew reentaareeji →', alerts: 'Reentaare', home: 'Hoore', report: 'Hollu',
  profile: 'Konngol', map: 'Karte', logout: 'Yaltu', language: 'Ɗemngal', sos: 'SOS',
  activeAlerts: 'Reentaareeji', recordAudio: '🎙️ Hisno konngol sawtuyaŋkol',
  audioHint: 'Haalu e ɗemngal maa. Gardiiɗo heɗoo konngol maa.',
  sendAudio: 'Neldu sawtu', audioRecorded: 'Sawtu hisnaama',
};

// ⚠️ À relire par des natifs
const wo: Record<Key, string> = {
  ...fr,
  appTagline: 'Artu musiba yu bari · Matam',
  chooseLang: 'Tànnal sa làkk',
  loginCitizen: '📱 Jëfandikukat — Dugg ak SMS',
  loginOperator: '🔒 Liggéeykat — Baatu-jàll',
  phone: 'Nimero telefon', password: 'Baatu-jàll',
  receiveCode: 'Jot kode SMS →', enterCode: 'Dugalal sa kode',
  codeSent: 'Kode bi yónnees na. Mën 10 simili.', validate: 'Wóoral →',
  resendCode: 'Yónneeyaat kode bi', back: 'Dellu',
  statusRegion: 'Naka la — Diiwaanu Matam', noAlert: 'Amul artu',
  vigilanceZone: 'Moytabal ci sa gox', alertZone: 'ARTU ci sa gox',
  urgenceZone: 'JAMONO BU TÀNG — Musiba léegi',
  reportRisk: 'YÉGLE', ofRisk: 'MUSIBA', whichRisk: 'Ban xeetu musiba?',
  step1: 'Tëgg 1 / 2', step2: 'Tëgg 2 / 2', confirmReport: 'Wóoral yégle bi',
  details: 'Leeral', optional: '(soo ko bëggee)', describe: 'Waxal la ngay gis…',
  gpsAuto: '📍 Sa bérab GPS dees na ko yónnee ci saa si.',
  sendReport: '🚨 Yónnee yégle bi', sending: 'Yónnee…',
  reportSent: 'Yégle bi yónnees na!', reportSentBody: 'Sa yégle yónnees na autorités yi.',
  seeAlerts: 'Seet artu yi →', alerts: 'Artu', home: 'Kër', report: 'Yégle',
  profile: 'Profil', map: 'Kart', logout: 'Génn', language: 'Làkk', sos: 'SOS',
  activeAlerts: 'Artu yi', recordAudio: '🎙️ Enregistre benn baat',
  audioHint: 'Waxal ci sa làkk. Ab agent dina déglu sa baat.',
  sendAudio: 'Yónnee baat bi', audioRecorded: 'Baat bi enregistrees na',
};

// ⚠️ À relire par des natifs
const snk: Record<Key, string> = {
  ...fr,
  appTagline: 'Tana xibaare · Matam',
  chooseLang: 'Tànnal sa làkk',
  loginCitizen: '📱 Jamaanen — SMS naxa',
  loginOperator: '🔒 Golliŋo — Baatu',
  phone: 'Telefon nimero', password: 'Baatu',
  receiveCode: 'Kode SMS heɲa →', enterCode: 'Kode safa',
  codeSent: 'Kode neldani. Simili 10.', validate: 'Wóoral →',
  resendCode: 'Kode neldi koota', back: 'Kompe',
  statusRegion: 'Ngonka — Matam jamaane', noAlert: 'Xibaare nta',
  vigilanceZone: 'Korinte n jamaane', alertZone: 'XIBAARE n jamaane',
  urgenceZone: 'TANPINTE — Tana yiga',
  reportRisk: 'XIBAARE', ofRisk: 'TANA', whichRisk: 'Tana sifa be?',
  step1: 'Tappe 1 / 2', step2: 'Tappe 2 / 2', confirmReport: 'Xibaare wóoral',
  details: 'Doroni', optional: '(an ŋa ñiŋe)', describe: 'Xibaare an ŋa ña…',
  gpsAuto: '📍 An GPS nelldi a yere.',
  sendReport: '🚨 Xibaare nelli', sending: 'Nelldi…',
  reportSent: 'Xibaare neldani!', reportSentBody: 'An xibaare neldani saxuruyen.',
  seeAlerts: 'Xibaarini ña →', alerts: 'Xibaare', home: 'Kompe', report: 'Xibaare',
  profile: 'Profil', map: 'Karte', logout: 'Yanqa', language: 'Làkk', sos: 'SOS',
  activeAlerts: 'Xibaarini', recordAudio: '🎙️ Audio safa',
  audioHint: 'Safa an làkk di. Agent ke a yittan.',
  sendAudio: 'Audio nelli', audioRecorded: 'Audio safani',
};

const DICT: Record<Lang, Record<Key, string>> = { fr, ff, wo, snk };

export function translate(lang: Lang, key: Key): string {
  return (DICT[lang] && DICT[lang][key]) || DICT.fr[key] || key;
}

/** Hook : langue courante (localStorage) + fonction t(). */
export function useI18n() {
  const [lang, setLangState] = useState<Lang>('fr');

  useEffect(() => {
    const stored = (localStorage.getItem('olel_lang') as Lang) || 'fr';
    setLangState(stored);
  }, []);

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('olel_lang', l);
    setLangState(l);
    // Best-effort : propager au backend si connecté
    const token = localStorage.getItem('olel_token');
    if (token) {
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
      fetch(`${API}/users/me/language`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ language: l }),
      }).catch(() => {});
    }
  }, []);

  const t = useCallback((key: Key) => translate(lang, key), [lang]);
  return { lang, setLang, t };
}
