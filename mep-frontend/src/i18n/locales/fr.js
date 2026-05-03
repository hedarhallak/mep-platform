// src/i18n/locales/fr.js — French (Quebec) translations.
//
// Conventions:
//   - Use Quebec French where it differs from European French
//     (e.g. "Connexion" not "Se connecter" for "Sign in" header).
//   - Keep strings short — UI components are sized for English.
//   - Match mobile (mep-mobile/src/i18n/locales/fr.ts) where the same
//     concept exists, so users see consistent terminology across web + app.

export default {
  common: {
    appName: 'Constrai',
    appTagline: 'ERP de construction',
    loading: 'Chargement…',
    save: 'Enregistrer',
    cancel: 'Annuler',
    submit: 'Soumettre',
    error: 'Erreur',
  },

  language: {
    label: 'Langue',
    en: 'English',
    fr: 'Français',
  },

  login: {
    title: 'Connectez-vous à votre compte',
    username: "Nom d'utilisateur",
    usernamePlaceholder: "Entrez le nom d'utilisateur",
    pin: 'NIP',
    pinPlaceholder: 'Entrez votre NIP',
    submit: 'Se connecter',
    submitLoading: 'Connexion…',
    showPin: 'Afficher le NIP',
    hidePin: 'Masquer le NIP',
    errors: {
      INVALID_CREDENTIALS: "Nom d'utilisateur ou NIP invalide",
      ACCOUNT_SUSPENDED: 'Compte suspendu',
      COMPANY_SUSPENDED: "Compte de l'entreprise suspendu",
      LOGIN_FAILED: 'Échec de la connexion',
    },
  },
};
