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

  nav: {
    dashboard: 'Dashboard',
    employees: 'Employees',
    projects: 'Projects',
    suppliers: 'Suppliers',
    assignments: 'Assignments',
    attendance: 'Attendance',
    reports: 'Reports',
    standup: 'Daily Standup',
    taskRequest: 'Task Request',
    materialRequest: 'Material Request',
    purchaseOrders: 'Purchase Orders',
    myHub: 'My Hub',
    bi: 'Business Intelligence',
    workforcePlanner: 'Workforce Planner',
    userManagement: 'User Management',
    permissions: 'Permissions',
    settings: 'Settings',
    logout: 'Logout',
    companyFallback: 'Company',
  },

  layout: {
    offline: "You're offline — some features may be unavailable",
    updateAvailable: '🆕 A new version is available',
    updateNow: 'Update now',
    installTitle: 'Install Constrai',
    installSubtitle: 'Add to home screen for quick access',
    installButton: 'Install',
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
