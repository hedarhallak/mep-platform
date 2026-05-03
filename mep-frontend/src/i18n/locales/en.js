// src/i18n/locales/en.js — English translations.
//
// Pilot scope: login flow + language switcher + a small `common` bucket of
// strings reused across pages (signing in, errors). Add new sections here
// (dashboard, hub, materials, etc.) as components get translated.

export default {
  common: {
    appName: 'Constrai',
    appTagline: 'Construction ERP',
    loading: 'Loading…',
    save: 'Save',
    cancel: 'Cancel',
    submit: 'Submit',
    error: 'Error',
  },

  language: {
    label: 'Language',
    en: 'English',
    fr: 'Français',
  },

  login: {
    title: 'Sign in to your account',
    username: 'Username',
    usernamePlaceholder: 'Enter username',
    pin: 'PIN',
    pinPlaceholder: 'Enter PIN',
    submit: 'Sign In',
    submitLoading: 'Signing in…',
    showPin: 'Show PIN',
    hidePin: 'Hide PIN',
    errors: {
      INVALID_CREDENTIALS: 'Invalid username or PIN',
      ACCOUNT_SUSPENDED: 'Account suspended',
      COMPANY_SUSPENDED: 'Company account suspended',
      LOGIN_FAILED: 'Login failed',
    },
  },
};
