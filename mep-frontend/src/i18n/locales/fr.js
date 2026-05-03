// src/i18n/locales/fr.js — French (Quebec) translations.

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

  nav: {
    dashboard: 'Tableau de bord',
    employees: 'Employés',
    projects: 'Projets',
    suppliers: 'Fournisseurs',
    assignments: 'Affectations',
    attendance: 'Présences',
    reports: 'Rapports',
    standup: 'Réunion quotidienne',
    taskRequest: 'Demande de tâche',
    materialRequest: 'Demande de matériel',
    purchaseOrders: "Bons d'achat",
    myHub: 'Mon Hub',
    bi: "Intelligence d'affaires",
    workforcePlanner: "Planificateur d'effectifs",
    userManagement: 'Gestion des utilisateurs',
    permissions: 'Permissions',
    settings: 'Paramètres',
    logout: 'Déconnexion',
    companyFallback: 'Entreprise',
  },

  layout: {
    offline: 'Vous êtes hors ligne — certaines fonctions peuvent être indisponibles',
    updateAvailable: '🆕 Une nouvelle version est disponible',
    updateNow: 'Mettre à jour',
    installTitle: 'Installer Constrai',
    installSubtitle: "Ajouter à l'écran d'accueil pour un accès rapide",
    installButton: 'Installer',
  },

  dashboard: {
    greetingMorning: 'Bonjour, {{username}} 👋',
    greetingAfternoon: 'Bon après-midi, {{username}} 👋',
    subtitle: "Voici l'activité de vos projets aujourd'hui.",
    activeProjects: 'Projets actifs',
    totalSuffix: '{{count}} au total',
    employees: 'Employés',
    employeesSub: 'avec profils',
    activeAssignments: 'Affectations actives',
    activeAssignmentsSub: 'sur le chantier',
    utilization: 'Utilisation',
    utilizationSub: 'employés affectés',
    recentProjects: 'Projets actifs récents',
    noProjects: 'Aucun projet pour le moment',
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
