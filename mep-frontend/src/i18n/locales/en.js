// src/i18n/locales/en.js — English translations.

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

  dashboard: {
    greetingMorning: 'Good morning, {{username}} 👋',
    greetingAfternoon: 'Good afternoon, {{username}} 👋',
    subtitle: "Here's what's happening with your projects today.",
    activeProjects: 'Active Projects',
    totalSuffix: '{{count}} total',
    employees: 'Employees',
    employeesSub: 'with profiles',
    activeAssignments: 'Active Assignments',
    activeAssignmentsSub: 'currently on site',
    utilization: 'Utilization',
    utilizationSub: 'employees assigned',
    recentProjects: 'Recent Active Projects',
    noProjects: 'No projects yet',
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
