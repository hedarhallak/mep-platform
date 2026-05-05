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

  trades: {
    all: 'Tous les métiers',
    plumbing: 'Plomberie',
    electrical: 'Électricité',
    hvac: 'CVAC',
    carpentry: 'Charpenterie',
    elevatorTech: "Mécanicien d'ascenseur",
    general: 'Général',
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

  employees: {
    title: 'Employés',
    subtitleActive: '{{count}} actifs',
    subtitleInactiveSuffix: ' · {{count}} inactifs',
    subtitleIncompleteSuffix: ' · {{count}} profils incomplets',
    inviteButton: 'Inviter un employé',

    searchPlaceholder: 'Rechercher des employés...',
    allRoles: 'Tous les rôles',
    allTrades: 'Tous les métiers',
    showInactive: 'Afficher les inactifs ({{count}})',

    th: {
      employee: 'Employé',
      role: 'Rôle',
      trade: 'Métier',
      level: 'Niveau',
      contact: 'Contact',
      status: 'Statut',
      profile: 'Profil',
    },

    status: {
      inactive: 'Inactif',
      active: 'Actif',
      invited: 'Invité',
    },
    profileStatus: {
      complete: 'Complet',
      incomplete: 'Incomplet',
    },

    empty: 'Aucun employé trouvé',
    emptyFiltered: "Essayez d'ajuster vos filtres",
    emptyDefault: 'Ajoutez votre premier employé',

    loadError: 'Échec du chargement des employés : {{message}}',

    roleShort: {
      COMPANY_ADMIN: 'Admin co.',
      TRADE_ADMIN: 'Admin métier',
      TRADE_PROJECT_MANAGER: 'Gérant projet',
      PROJECT_MANAGER: 'GP',
      FOREMAN: 'Contremaître',
      JOURNEYMAN: 'Compagnon',
      APPRENTICE_4: 'Apprenti 4',
      APPRENTICE_3: 'Apprenti 3',
      APPRENTICE_2: 'Apprenti 2',
      APPRENTICE_1: 'Apprenti 1',
      WORKER: 'Ouvrier',
      DRIVER: 'Chauffeur',
      PURCHASING: 'Achats',
    },

    roleFull: {
      COMPANY_ADMIN: "Administrateur de l'entreprise",
      TRADE_PROJECT_MANAGER: 'Gérant de projet de métier',
      TRADE_ADMIN: 'Administrateur de métier',
      PROJECT_MANAGER: 'Gérant de projet',
      FOREMAN: 'Contremaître',
      JOURNEYMAN: 'Compagnon',
      APPRENTICE_4: 'Apprenti 4',
      APPRENTICE_3: 'Apprenti 3',
      APPRENTICE_2: 'Apprenti 2',
      APPRENTICE_1: 'Apprenti 1',
      WORKER: 'Ouvrier',
      DRIVER: 'Chauffeur',
    },

    invite: {
      title: 'Inviter un employé',
      sentTitle: 'Invitation envoyée !',
      sentBody: 'Un courriel a été envoyé à {{email}}',
      emailFailed: "Le courriel n'a pas pu être envoyé. Partagez ce lien manuellement :",
      close: 'Fermer',
      inviteAnother: 'Inviter un autre',
      intro: "L'employé recevra un courriel pour compléter la configuration de son compte.",
      firstName: 'Prénom *',
      lastName: 'Nom *',
      firstNamePlaceholder: 'Prénom',
      lastNamePlaceholder: 'Nom',
      workEmail: 'Courriel professionnel *',
      emailPlaceholder: 'employe@courriel.com',
      trade: 'Métier',
      noTrade: 'Aucun métier',
      level: 'Niveau',
      noLevel: 'Aucun niveau',
      role: 'Rôle',
      employeeCode: "Code d'employé",
      optional: '(optionnel)',
      employeeCodePlaceholder: 'ex. W-2001',
      cancel: 'Annuler',
      sending: 'Envoi…',
      sendInvite: "Envoyer l'invitation",
      errors: {
        firstNameRequired: 'Le prénom est requis',
        lastNameRequired: 'Le nom est requis',
        emailRequired: 'Le courriel est requis',
        EMAIL_ALREADY_REGISTERED: 'Ce courriel est déjà enregistré',
        INVALID_EMAIL: 'Adresse courriel invalide',
        FIRST_NAME_REQUIRED: 'Le prénom est requis',
        LAST_NAME_REQUIRED: 'Le nom est requis',
        EMAIL_REQUIRED: 'Le courriel est requis',
        sendFailed: "Échec de l'envoi de l'invitation",
      },
    },

    edit: {
      title: "Modifier l'employé",
      updated: 'Mis à jour avec succès',
      firstName: 'Prénom *',
      lastName: 'Nom *',
      email: 'Courriel',
      phone: 'Téléphone',
      phonePlaceholder: '+1 514 000 0000',
      role: 'Rôle',
      trade: 'Métier',
      noTrade: 'Aucun métier',
      level: 'Niveau',
      noLevel: 'Aucun niveau',
      accountInfo: 'Informations du compte',
      username: "Nom d'utilisateur :",
      active: 'Actif',
      deactivated: 'Désactivé',
      deactivate: 'Désactiver',
      confirmDeactivate: 'Confirmer la désactivation',
      reactivate: 'Réactiver',
      cancel: 'Annuler',
      saveChanges: 'Enregistrer les modifications',
      updateFailed: "Échec de la mise à jour de l'employé",
    },
  },

  purchaseOrders: {
    title: "Bons d'achat",
    subtitle: 'Historique de toutes les demandes envoyées',
    searchPlaceholder: 'Rechercher par référence, projet, contremaître…',

    empty: "Aucun bon d'achat",
    emptyHint: 'Les demandes envoyées apparaîtront ici',

    th: {
      ref: 'Réf.',
      poNumber: 'N° BC',
      date: 'Date',
      project: 'Projet',
      foreman: 'Contremaître',
      sentTo: 'Envoyé à',
      items: 'Articles',
    },

    procurement: 'Approvisionnement',
    itemsCount: '{{count}} articles',
    reprint: 'Réimprimer',

    pdf: {
      printButton: '🖨 Imprimer / Sauvegarder en PDF',
      heading: "Bon d'achat",
      refLabel: 'Réf. :',
      dateLabel: 'Date :',
      poNumber: 'N° BC',
      deliveryLocation: '📦 Lieu de livraison',
      project: 'Projet',
      noSiteAddress: "Pas d'adresse de chantier au dossier",
      onSiteContact: 'Contact sur le chantier (contremaître)',
      toSupplier: 'À — Fournisseur',
      toInternal: 'À — Interne',
      procurementDept: "Département d'approvisionnement",
      itemDescription: "Description de l'article",
      qty: 'Qté',
      unit: 'Unité',
      notes: 'Notes',
      generatedBy: 'Généré par Constrai',
    },
  },

  materials: {
    title: 'Demande de matériel',
    subtitle: 'Demandez du matériel pour votre projet',

    tabs: {
      new: 'Nouvelle demande',
      my: 'Mes demandes',
    },

    statusBadge: {
      PENDING: 'En attente',
      REVIEWED: 'Examinée',
      MERGED: 'Fusionnée',
      SENT: 'Envoyée',
      CANCELLED: 'Annulée',
    },

    new: {
      project: 'Projet',
      todayAssignmentSuffix: "Affectation d'aujourd'hui",
      selectProject: 'Sélectionner un projet…',

      items: 'Articles',
      colName: 'Nom',
      colQty: 'Quantité',
      colUnit: 'Unité',
      addNote: '+ Ajouter une note',
      removeNote: '− Retirer la note',
      addItem: 'Ajouter un article',

      generalNote: 'Note générale (optionnel)',
      generalNotePlaceholder: 'Contexte additionnel pour le contremaître…',

      itemNamePlaceholder: 'ex. Tuyau en cuivre 3/4 po',
      itemNotePlaceholder: 'Note (optionnel)',
      qtyPlaceholder: 'Qté',
      catalogUsed: 'utilisé {{count}}×',

      itemCount_one: '{{count}} article',
      itemCount_other: '{{count}} articles',

      submit: 'Soumettre la demande',

      errors: {
        selectProject: 'Sélectionnez un projet',
        addItem: 'Ajoutez au moins un article avec un nom et une quantité',
      },
    },

    success: {
      title: 'Demande soumise !',
      body: 'Votre contremaître la révisera bientôt.',
      newRequest: 'Nouvelle demande',
      myRequests: 'Mes demandes',
    },

    my: {
      backToList: '← Retour à Mes demandes',
      allProjects: 'Tous les projets',
      allStatuses: 'Tous les statuts',
      requestsCount_one: '{{count}} demande',
      requestsCount_other: '{{count}} demandes',
      empty: 'Aucune demande trouvée',

      th: {
        date: 'Date',
        project: 'Projet',
        items: 'Articles',
        status: 'Statut',
        index: 'N°',
        item: 'Article',
        qty: 'Qté',
        unit: 'Unité',
        note: 'Note',
      },

      moreSuffix: '+{{count}} de plus',
    },
  },

  assignments: {
    title: 'Affectations',
    subtitle: "Gérer les affectations de la main-d'œuvre sur tous les projets",

    assignButton: 'Affecter un employé',
    repeatButton: "Répéter aujourd'hui sur demain",

    tabs: {
      list: 'Liste des affectations',
      map: 'Affectation géographique',
    },

    success: {
      assigned: 'Affectation réussie !',
      moved: 'Déplacement réussi !',
      repeated: 'Répétition réussie !',
    },

    role: {
      WORKER: 'Ouvrier',
      FOREMAN: 'Contremaître',
      JOURNEYMAN: 'Compagnon',
    },

    list: {
      filterProject: 'Filtrer par projet…',
      filterEmployee: 'Filtrer par employé…',
      clear: 'Effacer',
      countSuffix: '{{count}} affectations',
      countSuffix_one: '{{count}} affectation',
      countOf: ' sur {{total}}',
      empty: 'Aucune affectation trouvée',
      emptyHintFiltered: "Essayez d'ajuster les filtres",
      emptyHintDefault: 'Utilisez la vue carte pour affecter des employés',
      assignedSuffix: '{{count}} affectés',
      onSiteSuffix: '{{count}} sur le chantier',
      th: {
        employee: 'Employé',
        trade: 'Métier',
        role: 'Rôle',
        period: 'Période',
        actions: 'Actions',
      },
      todayBadge: "AUJOURD'HUI",
      move: 'Déplacer',
    },

    map: {
      tokenMissing: 'Jeton Mapbox non configuré',
      loading: 'Chargement…',
      selectProjectHint: 'Sélectionnez un projet pour voir la carte',
      legend: 'Légende',
      legendProjectSite: 'Site du chantier',
      legendAvailable: 'Disponible · Cliquer pour affecter',
      legendBusy: 'Occupé cette période',
      hoverHint: 'Cliquer pour affecter',
      sidebarHeader: 'Disponibles à affecter',
      countOfTotal: '{{available}} sur {{total}}',
      assign: 'Affecter',
      noAvailable: 'Aucun employé disponible pour cette période',
      assignedSection: 'Affectés',
      modify: 'Modifier',
      popupAvailable: '✓ Disponible',
      popupBusy: '✗ Occupé cette période',
      selectProject: 'Sélectionner un projet',
      dateStart: 'Début',
      dateEnd: 'Fin',
    },

    repeat: {
      title: "Répéter aujourd'hui",
      targetDate: 'Date cible',
      preview: 'Aperçu',
      willBeAssigned: 'Sera affecté',
      alreadyAssigned: 'Déjà affecté — ignoré',
      allDone: 'Tous les employés ont déjà des affectations pour cette date.',
      willCreate: '{{count}} affectations seront créées',
      confirm: 'Confirmer',
      doneTitle: 'Terminé !',
      doneBody: "Affectations d'aujourd'hui répétées pour {{date}}",
      close: 'Fermer',
    },

    newModal: {
      title: 'Nouvelle affectation',
      project: 'Projet',
      selectProject: 'Sélectionner un projet…',
      employee: 'Employé',
      employeeSearchPlaceholder: 'Tapez pour rechercher un employé…',
      roleOnProject: 'Rôle sur le projet',
      startDate: 'Date de début',
      endDate: 'Date de fin',
      shiftStart: 'Début du quart',
      shiftEnd: 'Fin du quart',
      notes: 'Notes (optionnel)',
      notesPlaceholder: 'Instructions spéciales…',
      cancel: 'Annuler',
      assign: 'Affecter',
      errors: {
        selectProject: 'Sélectionnez un projet',
        selectEmployee: 'Sélectionnez un employé',
        startDate: 'Indiquez la date de début',
        endDate: 'Indiquez la date de fin',
      },
    },

    moveModal: {
      title: 'Déplacer vers un projet',
      subtitle: 'Déplacement de {{employee}} depuis {{project}}',
      empty: "Aucun autre projet actif",
    },
  },

  attendance: {
    title: 'Présences',
    subtitle: 'Suivez les pointages quotidiens de votre équipe',

    todaysAssignment: "Affectation d'aujourd'hui",
    noProjects: 'Aucun projet actif pour cette date',
    noAssignmentToday: "Aucune affectation aujourd'hui",

    summary: {
      total: 'Total',
      onSite: 'Sur le chantier',
      checkedOut: 'Sortis',
      confirmed: 'Confirmés',
    },

    th: {
      employee: 'Employé',
      status: 'Statut',
      checkIn: 'Entrée',
      checkOut: 'Sortie',
      regular: 'Régulières',
      overtime: 'Heures supp.',
      confirmedBy: 'Confirmé par',
      actions: 'Actions',
    },

    statusBadge: {
      OPEN: 'Absent',
      CHECKED_IN: 'Sur place',
      CHECKED_OUT: 'En attente',
      CONFIRMED: 'Confirmé',
      ADJUSTED: 'Ajusté',
    },

    row: {
      shiftSuffix: 'quart',
      pending: 'En attente',
      checkIn: 'Pointer entrée',
      checkOut: 'Pointer sortie',
      confirm: 'Confirmer',
      adjust: 'Ajuster',
    },

    empty: 'Aucune affectation pour cette date',
    emptyHint: 'Choisissez une autre date ou un autre projet',

    success: {
      checkedIn: 'Pointage entrée enregistré !',
      checkedOut: 'Pointage sortie enregistré !',
      hoursConfirmed: 'Heures confirmées !',
    },

    modal: {
      title: 'Confirmer les heures',
      checkIn: 'Entrée',
      checkOut: 'Sortie',
      systemCalculated: 'Calculé par le système',
      otSuffix: 'supp.',
      finalHours: 'Heures finales (décision du contremaître)',
      regularHours: 'Heures régulières',
      overtimeHours: 'Heures supplémentaires',
      note: 'Note (optionnel)',
      notePlaceholder: 'ex. Conditions routières ont causé un retard de 15 min…',
      cancel: 'Annuler',
      confirm: 'Confirmer',
    },
  },

  suppliers: {
    title: 'Fournisseurs',
    subtitle: 'Gérez votre répertoire de fournisseurs',
    addButton: 'Ajouter un fournisseur',

    searchPlaceholder: 'Rechercher des fournisseurs...',

    empty: 'Aucun fournisseur trouvé',
    emptyHint: 'Ajoutez votre premier fournisseur pour commencer',

    confirmDelete: 'Désactiver ce fournisseur ?',
    successAdded: 'Fournisseur ajouté ✓',
    successUpdated: 'Fournisseur mis à jour ✓',
    successRemoved: 'Fournisseur supprimé',

    modal: {
      titleNew: 'Nouveau fournisseur',
      titleEdit: 'Modifier le fournisseur',
      name: 'Nom du fournisseur',
      namePlaceholder: 'ex. ABC Plomberie Inc.',
      email: 'Courriel',
      emailPlaceholder: 'fournisseur@exemple.com',
      phone: 'Téléphone',
      phonePlaceholder: '+1 514 000 0000',
      address: 'Adresse',
      addressPlaceholder: 'Optionnel — pour ramassage',
      trade: 'Métier',
      note: 'Note (optionnel)',
      notePlaceholder: 'Notes sur ce fournisseur...',
      cancel: 'Annuler',
      update: 'Mettre à jour',
      add: 'Ajouter le fournisseur',
      errors: {
        nameRequired: 'Le nom est requis',
        emailRequired: 'Le courriel est requis',
        phoneRequired: 'Le téléphone est requis',
      },
    },
  },

  bi: {
    workforcePlanner: {
      title: "Planificateur d'effectifs",
      subtitle: "Optimisation des affectations géographiques · Effectif actif aujourd'hui",
      refresh: 'Actualiser',

      summary: {
        activeToday: "Actifs aujourd'hui",
        beyondKm: 'Au-delà de {{km}} km',
        canOptimize: 'À optimiser',
        totalSavingKm: 'Économies totales (km)',
      },

      filter: {
        all: 'Tous ({{count}})',
        beyondKm: 'Au-delà de {{km}} km ({{count}})',
        optimizable: 'Optimisables ({{count}})',
      },

      empty: {
        title: 'Toutes les affectations semblent optimales',
        subtitle: 'Aucune amélioration trouvée pour ce filtre',
      },

      badge: {
        beyondThreshold: 'Au-delà du seuil de {{km}} km',
        canOptimize: 'Optimisation disponible',
        optimal: 'Placement optimal',
      },

      now: 'Actuel :',
      suggested: 'Suggéré :',
      apply: 'Appliquer',
      confirmMove: 'Déplacer {{employee}} de {{currentProject}} vers {{suggestedProject}} ?',
      successMove: '{{employee}} déplacé vers {{suggestedProject}} ✓',
    },
  },

  projects: {
    title: 'Projets',
    subtitle: '{{count}} projets au total',
    newButton: 'Nouveau projet',

    searchPlaceholder: 'Rechercher des projets...',
    allStatuses: 'Tous les statuts',

    th: {
      code: 'Code',
      projectName: 'Nom du projet',
      trade: 'Métier',
      status: 'Statut',
      dates: 'Dates',
      address: 'Adresse',
    },

    empty: 'Aucun projet trouvé',
    emptyFiltered: "Essayez d'ajuster vos filtres",
    emptyDefault: 'Créez votre premier projet',
    noAddress: 'Aucune adresse',

    modal: {
      titleNew: 'Nouveau projet',
      titleEdit: 'Modifier le projet',
      projectName: 'Nom du projet *',
      projectNamePlaceholder: 'Entrer le nom du projet',
      ccqSector: 'Secteur CCQ',
      ccqSectorHint: "(pour le calcul de l'allocation de déplacement)",
      ccqSectorIC: 'Institutionnel / Commercial (IC)',
      ccqSectorIndustrial: 'Industriel (I)',
      ccqSectorResidential: 'Résidentiel (R)',
      tradeType: 'Type de métier *',
      selectTrade: 'Sélectionner un métier',
      status: 'Statut',
      selectStatus: 'Sélectionner un statut',
      siteAddress: 'Adresse du chantier',
      addressPlaceholder: 'Rechercher une adresse...',
      coordinatesSaved: 'Coordonnées enregistrées ({{lat}}, {{lng}})',
      startDate: 'Date de début',
      endDate: 'Date de fin',
      client: 'Client',
      noClient: 'Aucun client',
      cancel: 'Annuler',
      saveChanges: 'Enregistrer les modifications',
      createProject: 'Créer le projet',
      errors: {
        projectNameRequired: 'Le nom du projet est requis',
        tradeTypeRequired: 'Le type de métier est requis',
        saveFailed: "Échec de l'enregistrement du projet",
      },
    },
  },
};
