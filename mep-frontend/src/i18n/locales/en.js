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

  trades: {
    all: 'All Trades',
    plumbing: 'Plumbing',
    electrical: 'Electrical',
    hvac: 'HVAC',
    carpentry: 'Carpentry',
    elevatorTech: 'Elevator Technician',
    general: 'General',
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
    subscription: 'Subscription',
    logout: 'Logout',
    companyFallback: 'Company',
  },

  subscription: {
    title: 'Subscription',
    loadError: 'Could not load subscription details',
    currentPlan: 'Current plan',
    bracketLine: '{{label}} ({{price}}/seat/month)',
    seatUsage: 'Seat usage',
    seatsUsedOfSubscribed: 'seats used',
    atCapacity: 'At capacity',
    withinCapacity: 'Within capacity',
    atCapacityHelp: 'New invites will be rejected with HTTP 402 until seats are added.',
    seatsRemainingHelp: '{{count}} seats remaining before the limit.',
    trialEndsAt: 'Trial ends',
    nextBillingAt: 'Next billing',
    cancelAtPeriodEnd: 'Your subscription is set to cancel at the end of the current billing period.',
    requestChanges: 'Request changes',
    requestExplanation:
      'Submit a request below. Your request will be recorded in our audit log and your email client will open with a pre-filled message to billing@constrai.ca for you to send. We process all requests within one business day.',
    actions: {
      requestSeatChange: 'Request seat change',
      requestPlanUpgrade: 'Request plan upgrade',
      requestCancel: 'Request cancellation',
    },
    forms: {
      newSeatCount: 'New seat count',
      reasonOptional: 'Reason (optional)',
      submitAndEmail: 'Submit + open email',
      cancelImmediately: 'Cancel immediately (not at end of billing period)',
      targetPlan: 'Target plan',
    },
    plans: {
      BASIC: 'Basic',
      MONTHLY: 'Monthly',
      ANNUAL: 'Annual',
      ENTERPRISE: 'Enterprise',
    },
    statuses: {
      ACTIVE: 'Active',
      TRIAL: 'Trial',
      PAST_DUE: 'Past due',
      SUSPENDED: 'Suspended',
      CANCELLED: 'Cancelled',
      DELETED: 'Deleted',
    },
    errors: {
      INVALID_REQUESTED_SEATS: 'Please enter a valid seat count between 1 and 10000.',
      NO_CHANGE: 'The requested value matches your current value — nothing to change.',
      REASON_TOO_LONG: 'Reason is too long (max 1000 characters).',
      SUBSCRIPTION_NOT_FOUND: 'No subscription is attached to your company.',
      INVALID_PLAN_TYPE: 'Please choose a valid plan type.',
      SERVER_ERROR: 'Something went wrong. Please try again or contact billing@constrai.ca.',
    },
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
    email: 'Email',
    emailPlaceholder: 'Enter your email',
    pin: 'PIN',
    pinPlaceholder: 'Enter PIN',
    submit: 'Sign In',
    submitLoading: 'Signing in…',
    showPin: 'Show PIN',
    hidePin: 'Hide PIN',
    rememberMe: 'Remember me',
    logoAlt: 'Company logo',
    errors: {
      INVALID_CREDENTIALS: 'Invalid email or PIN',
      ACCOUNT_SUSPENDED: 'Account suspended',
      COMPANY_SUSPENDED: 'Company account suspended',
      LOGIN_FAILED: 'Login failed',
    },
  },

  employees: {
    title: 'Employees',
    subtitleActive: '{{count}} active',
    subtitleInactiveSuffix: ' · {{count}} inactive',
    subtitleIncompleteSuffix: ' · {{count}} incomplete profiles',
    inviteButton: 'Invite Employee',

    searchPlaceholder: 'Search employees...',
    allRoles: 'All Roles',
    allTrades: 'All Trades',
    showInactive: 'Show inactive ({{count}})',

    th: {
      employee: 'Employee',
      role: 'Role',
      trade: 'Trade',
      level: 'Level',
      contact: 'Contact',
      status: 'Status',
      profile: 'Profile',
    },

    status: {
      inactive: 'Inactive',
      active: 'Active',
      invited: 'Invited',
    },
    profileStatus: {
      complete: 'Complete',
      incomplete: 'Incomplete',
    },

    empty: 'No employees found',
    emptyFiltered: 'Try adjusting your filters',
    emptyDefault: 'Add your first employee',

    loadError: 'Failed to load employees: {{message}}',

    roleShort: {
      COMPANY_ADMIN: 'Co. Admin',
      TRADE_ADMIN: 'Trade Admin',
      TRADE_PROJECT_MANAGER: 'Project Mgr',
      PROJECT_MANAGER: 'PM',
      FOREMAN: 'Foreman',
      JOURNEYMAN: 'Journeyman',
      APPRENTICE_4: 'Apprentice 4',
      APPRENTICE_3: 'Apprentice 3',
      APPRENTICE_2: 'Apprentice 2',
      APPRENTICE_1: 'Apprentice 1',
      WORKER: 'Worker',
      DRIVER: 'Driver',
      PURCHASING: 'Purchasing',
    },

    roleFull: {
      COMPANY_ADMIN: 'Company Admin',
      TRADE_PROJECT_MANAGER: 'Trade Project Manager',
      TRADE_ADMIN: 'Trade Admin',
      PROJECT_MANAGER: 'Project Manager',
      FOREMAN: 'Foreman',
      JOURNEYMAN: 'Journeyman',
      APPRENTICE_4: 'Apprentice 4',
      APPRENTICE_3: 'Apprentice 3',
      APPRENTICE_2: 'Apprentice 2',
      APPRENTICE_1: 'Apprentice 1',
      WORKER: 'Worker',
      DRIVER: 'Driver',
    },

    invite: {
      title: 'Invite Employee',
      sentTitle: 'Invitation Sent!',
      sentBody: 'An email has been sent to {{email}}',
      emailFailed: 'Email could not be sent. Share this link manually:',
      close: 'Close',
      inviteAnother: 'Invite Another',
      intro: 'The employee will receive an email to complete their account setup.',
      firstName: 'First Name *',
      lastName: 'Last Name *',
      firstNamePlaceholder: 'First name',
      lastNamePlaceholder: 'Last name',
      workEmail: 'Work Email *',
      emailPlaceholder: 'employee@email.com',
      trade: 'Trade',
      noTrade: 'No trade',
      level: 'Level',
      noLevel: 'No level',
      role: 'Role',
      employeeCode: 'Employee Code',
      optional: '(optional)',
      employeeCodePlaceholder: 'e.g. W-2001',
      cancel: 'Cancel',
      sending: 'Sending...',
      sendInvite: 'Send Invite',
      errors: {
        firstNameRequired: 'First name is required',
        lastNameRequired: 'Last name is required',
        emailRequired: 'Email is required',
        EMAIL_ALREADY_REGISTERED: 'This email is already registered',
        INVALID_EMAIL: 'Invalid email address',
        FIRST_NAME_REQUIRED: 'First name is required',
        LAST_NAME_REQUIRED: 'Last name is required',
        EMAIL_REQUIRED: 'Email is required',
        sendFailed: 'Failed to send invite',
      },
    },

    edit: {
      title: 'Edit Employee',
      updated: 'Updated Successfully',
      firstName: 'First Name *',
      lastName: 'Last Name *',
      email: 'Email',
      phone: 'Phone',
      phonePlaceholder: '+1 514 000 0000',
      role: 'Role',
      trade: 'Trade',
      noTrade: 'No trade',
      level: 'Level',
      noLevel: 'No level',
      accountInfo: 'Account Info',
      username: 'Username:',
      active: 'Active',
      deactivated: 'Deactivated',
      deactivate: 'Deactivate',
      confirmDeactivate: 'Confirm Deactivate',
      reactivate: 'Reactivate',
      cancel: 'Cancel',
      saveChanges: 'Save Changes',
      updateFailed: 'Failed to update employee',
    },
  },

  purchaseOrders: {
    title: 'Purchase Orders',
    subtitle: 'History of all sent material requests',
    searchPlaceholder: 'Search by ref, project, foreman...',

    empty: 'No purchase orders yet',
    emptyHint: 'Sent requests will appear here',

    th: {
      ref: 'Ref',
      poNumber: 'PO #',
      date: 'Date',
      project: 'Project',
      foreman: 'Foreman',
      sentTo: 'Sent To',
      items: 'Items',
    },

    procurement: 'Procurement',
    itemsCount: '{{count}} items',
    reprint: 'Reprint',

    pdf: {
      printButton: '🖨 Print / Save as PDF',
      heading: 'Purchase Order',
      refLabel: 'Ref:',
      dateLabel: 'Date:',
      poNumber: 'PO #',
      deliveryLocation: '📦 Delivery Location',
      project: 'Project',
      noSiteAddress: 'No site address on file',
      onSiteContact: 'On-Site Contact (Foreman)',
      toSupplier: 'To — Supplier',
      toInternal: 'To — Internal',
      procurementDept: 'Procurement Department',
      itemDescription: 'Item Description',
      qty: 'Qty',
      unit: 'Unit',
      notes: 'Notes',
      generatedBy: 'Generated by Constrai',
    },
  },

  materials: {
    title: 'Material Request',
    subtitle: 'Request materials for your project',

    tabs: {
      new: 'New Request',
      my: 'My Requests',
    },

    statusBadge: {
      PENDING: 'Pending',
      REVIEWED: 'Reviewed',
      MERGED: 'Merged',
      SENT: 'Sent',
      CANCELLED: 'Cancelled',
    },

    new: {
      project: 'Project',
      todayAssignmentSuffix: "Today's assignment",
      selectProject: 'Select project...',

      items: 'Items',
      colName: 'Name',
      colQty: 'Quantity',
      colUnit: 'Unit',
      addNote: '+ Add note',
      removeNote: '− Remove note',
      addItem: 'Add Item',

      generalNote: 'General Note (optional)',
      generalNotePlaceholder: 'Any additional context for the foreman...',

      itemNamePlaceholder: 'e.g. Copper pipe 3/4 inch',
      itemNotePlaceholder: 'Note (optional)',
      qtyPlaceholder: 'Qty',
      catalogUsed: 'used {{count}}×',

      itemCount_one: '{{count}} item',
      itemCount_other: '{{count}} items',

      submit: 'Submit Request',

      errors: {
        selectProject: 'Select a project',
        addItem: 'Add at least one item with name and quantity',
      },
    },

    success: {
      title: 'Request Submitted!',
      body: 'Your foreman will review it shortly.',
      newRequest: 'New Request',
      myRequests: 'My Requests',
    },

    my: {
      backToList: '← Back to My Requests',
      allProjects: 'All Projects',
      allStatuses: 'All Statuses',
      requestsCount_one: '{{count}} request',
      requestsCount_other: '{{count}} requests',
      empty: 'No requests found',

      th: {
        date: 'Date',
        project: 'Project',
        items: 'Items',
        status: 'Status',
        index: '#',
        item: 'Item',
        qty: 'Qty',
        unit: 'Unit',
        note: 'Note',
      },

      moreSuffix: '+{{count}} more',
    },
  },

  assignments: {
    title: 'Assignments',
    subtitle: 'Manage workforce assignments across all projects',

    assignButton: 'Assign Employee',
    repeatButton: 'Assign Tomorrow as Today',

    tabs: {
      list: 'Assignments List',
      map: 'Geographical Assignment',
    },

    success: {
      assigned: 'Assigned successfully!',
      moved: 'Moved successfully!',
      repeated: 'Repeated successfully!',
    },

    role: {
      WORKER: 'Worker',
      FOREMAN: 'Foreman',
      JOURNEYMAN: 'Journeyman',
    },

    list: {
      filterProject: 'Filter by project...',
      filterEmployee: 'Filter by employee...',
      clear: 'Clear',
      countSuffix: '{{count}} assignments',
      countSuffix_one: '{{count}} assignment',
      countOf: ' of {{total}}',
      empty: 'No assignments found',
      emptyHintFiltered: 'Try adjusting the filters',
      emptyHintDefault: 'Use Map View to assign employees',
      assignedSuffix: '{{count}} assigned',
      onSiteSuffix: '{{count}} on site',
      th: {
        employee: 'Employee',
        trade: 'Trade',
        role: 'Role',
        period: 'Period',
        actions: 'Actions',
      },
      todayBadge: 'TODAY',
      move: 'Move',
    },

    map: {
      tokenMissing: 'Mapbox token not configured',
      loading: 'Loading...',
      selectProjectHint: 'Select a project to view the map',
      legend: 'Legend',
      legendProjectSite: 'Project site',
      legendAvailable: 'Available · Click to assign',
      legendBusy: 'Busy this period',
      hoverHint: 'Click to assign',
      sidebarHeader: 'Available to Assign',
      countOfTotal: '{{available}} of {{total}}',
      assign: 'Assign',
      noAvailable: 'No available employees for this period',
      assignedSection: 'Assigned',
      modify: 'Modify',
      // For inline Mapbox marker popup HTML
      popupAvailable: '✓ Available',
      popupBusy: '✗ Busy this period',
      // Sidebar project list
      selectProject: 'Select Project',
      dateStart: 'Start',
      dateEnd: 'End',
    },

    repeat: {
      title: 'Repeat Today',
      targetDate: 'Target Date',
      preview: 'Preview',
      willBeAssigned: 'Will be assigned',
      alreadyAssigned: 'Already assigned — skipped',
      allDone: 'All employees already have assignments for this date.',
      willCreate: '{{count}} assignments will be created',
      confirm: 'Confirm',
      doneTitle: 'Done!',
      doneBody: "Today's assignments repeated for {{date}}",
      close: 'Close',
    },

    newModal: {
      title: 'New Assignment',
      project: 'Project',
      selectProject: 'Select project...',
      employee: 'Employee',
      employeeSearchPlaceholder: 'Type to search for an employee...',
      roleOnProject: 'Role on Project',
      startDate: 'Start Date',
      endDate: 'End Date',
      shiftStart: 'Shift Start',
      shiftEnd: 'Shift End',
      notes: 'Notes (optional)',
      notesPlaceholder: 'Any special instructions...',
      cancel: 'Cancel',
      assign: 'Assign',
      errors: {
        selectProject: 'Select a project',
        selectEmployee: 'Select an employee',
        startDate: 'Set start date',
        endDate: 'Set end date',
      },
    },

    moveModal: {
      title: 'Move to Project',
      subtitle: 'Moving {{employee}} from {{project}}',
      empty: 'No other active projects',
    },
  },

  attendance: {
    title: 'Attendance',
    subtitle: 'Track daily check-in / check-out for your team',

    todaysAssignment: "Today's assignment",
    noProjects: 'No active projects for this date',
    noAssignmentToday: 'No assignment today',

    summary: {
      total: 'Total',
      onSite: 'On Site',
      checkedOut: 'Checked Out',
      confirmed: 'Confirmed',
    },

    th: {
      employee: 'Employee',
      status: 'Status',
      checkIn: 'Check In',
      checkOut: 'Check Out',
      regular: 'Regular',
      overtime: 'Overtime',
      confirmedBy: 'Confirmed By',
      actions: 'Actions',
    },

    statusBadge: {
      OPEN: 'Absent',
      CHECKED_IN: 'On Site',
      CHECKED_OUT: 'Pending',
      CONFIRMED: 'Confirmed',
      ADJUSTED: 'Adjusted',
    },

    row: {
      shiftSuffix: 'shift',
      pending: 'Pending',
      checkIn: 'Check In',
      checkOut: 'Check Out',
      confirm: 'Confirm',
      adjust: 'Adjust',
    },

    empty: 'No assignments for this date',
    emptyHint: 'Select a different date or project',

    success: {
      checkedIn: 'Checked in successfully!',
      checkedOut: 'Checked out successfully!',
      hoursConfirmed: 'Hours confirmed!',
    },

    modal: {
      title: 'Confirm Hours',
      checkIn: 'Check In',
      checkOut: 'Check Out',
      systemCalculated: 'System Calculated',
      otSuffix: 'OT',
      finalHours: 'Final Hours (Foreman Decision)',
      regularHours: 'Regular Hours',
      overtimeHours: 'Overtime Hours',
      note: 'Note (optional)',
      notePlaceholder: 'e.g. Road conditions caused 15min delay...',
      cancel: 'Cancel',
      confirm: 'Confirm',
    },
  },

  suppliers: {
    title: 'Suppliers',
    subtitle: 'Manage your supplier directory',
    addButton: 'Add Supplier',

    searchPlaceholder: 'Search suppliers...',

    empty: 'No suppliers found',
    emptyHint: 'Add your first supplier to get started',

    confirmDelete: 'Deactivate this supplier?',
    successAdded: 'Supplier added ✓',
    successUpdated: 'Supplier updated ✓',
    successRemoved: 'Supplier removed',

    modal: {
      titleNew: 'New Supplier',
      titleEdit: 'Edit Supplier',
      name: 'Supplier Name',
      namePlaceholder: 'e.g. ABC Plumbing Supply',
      email: 'Email',
      emailPlaceholder: 'supplier@example.com',
      phone: 'Phone',
      phonePlaceholder: '+1 514 000 0000',
      address: 'Address',
      addressPlaceholder: 'Optional — for pickup',
      trade: 'Trade',
      note: 'Note (optional)',
      notePlaceholder: 'Any notes about this supplier...',
      cancel: 'Cancel',
      update: 'Update',
      add: 'Add Supplier',
      errors: {
        nameRequired: 'Name is required',
        emailRequired: 'Email is required',
        phoneRequired: 'Phone is required',
      },
    },
  },

  myHub: {
    title: 'My Hub',
    subtitle: 'Your daily tasks, approvals and requests',

    tabs: {
      attendance: 'Attendance',
      materials: 'Materials',
      tasks: 'My Tasks',
    },

    attendance: {
      confirmAll: 'Confirm All ({{count}})',
      noRecords: 'No records for {{date}}',
      groupCount: '{{count}} employees',
      th: {
        employee: 'Employee',
        in: 'In',
        out: 'Out',
        regular: 'Regular',
        ot: 'OT',
        status: 'Status',
      },
      status: {
        absent: 'Absent',
        onSite: 'On Site',
        pending: 'Pending',
        confirmed: 'Confirmed',
        adjusted: 'Adjusted',
      },
      confirm: 'Confirm',
      toast: {
        confirmed: 'Confirmed ✓',
        bulkConfirmed: '{{count}} records confirmed ✓',
      },
    },

    send: {
      heading: 'Tasks & Blueprints',
      sentSuffix: '{{count}} sent',
      newTask: 'New Task',
      cancel: 'Cancel',
      types: {
        TASK: 'Task',
        BLUEPRINT: 'Blueprint',
        NOTE: 'Note',
      },
      titlePlaceholder: 'Task title *',
      bodyPlaceholder: 'Instructions for the worker (optional)...',
      noProject: 'No project',
      attachFile: 'Attach file',
      recipients: 'Recipients',
      selectedCount: '{{count}} selected',
      searchPlaceholder: 'Search...',
      selectAll: 'All',
      clearAll: 'Clear',
      noWorkers: 'No workers found',
      footer: {
        empty: 'Select at least one recipient',
        ready_one: 'Ready to send to {{count}} worker',
        ready_other: 'Ready to send to {{count}} workers',
      },
      send: 'Send Task',
      sending: 'Sending...',
      errors: {
        titleRequired: 'Title is required',
        recipientsRequired: 'Select at least one recipient',
        sendFailed: 'Failed to send',
      },
      sentToast: 'Sent to {{count}} worker(s) ✓',
      sentToastPending: 'Sent to {{count}} worker(s) ✓ — {{pending}} pending assignment',
      empty: 'No tasks sent yet',
      emptyHint: 'Create a task to send to your team',
      doneSuffix: 'done',
      recipientsLabel: 'Recipients',
      status: {
        done: '✓ Done',
        awaiting: '⏳ Awaiting assignment',
        seen: '👁 Seen',
        sent: '📬 Sent',
      },
      pendingBanner_one: '{{count}} recipient will receive this task once assigned to the project',
      pendingBanner_other: '{{count}} recipients will receive this task once assigned to the project',
      attachedHasFile: 'File',
      dueLabel: 'Due {{date}}',
      recipientsSuffix_one: '{{count}} recipient',
      recipientsSuffix_other: '{{count}} recipients',
    },

    inbox: {
      heading: 'My Tasks',
      unreadSuffix: '{{count}} new',
      empty: 'No tasks yet',
      emptyHint: 'Tasks from your foreman will appear here',
      status: {
        done: 'Done',
        new: 'New',
        read: 'Read',
      },
      from: 'From {{sender}}',
      dueLabel: 'Due {{date}}',
      instructions: 'Instructions',
      attachedFile: 'Attached File',
      clickToOpen: 'Click to open',
      completionPlaceholder: 'Completion notes (optional)...',
      addPhoto: 'Add completion photo (optional)',
      markComplete: 'Mark Complete',
      completing: 'Completing...',
      completedOn: 'Completed {{date}}',
    },

    materials: {
      heading: 'Material Requests',
      pendingSuffix: '{{count}} pending',
      mergeReview: 'Merge & Review',
      sent: 'Sent ✓',
      poNumberRequired: 'PO Number is required when sending to a supplier.',
      merged: 'Merged — {{items}} items from {{requests}} requests',
      cancel: 'Cancel',
      sendRequest: 'Send Request',
      th: {
        item: 'Item',
        qty: 'Qty',
        unit: 'Unit',
        sources: 'Sources',
        surplus: 'Surplus',
        note: 'Note',
      },
      none: 'None',
      empty: 'No material requests',
      itemsCount_one: '{{count}} item',
      itemsCount_other: '{{count}} items',

      modal: {
        title: 'Send Request To',
        procurement: 'Procurement Department',
        internal: 'Internal',
        suppliers: 'Suppliers',
        poNumber: 'PO Number',
        poNumberRequired: '*required for supplier',
        poNumberOptional: '(optional)',
        poPlaceholder: 'e.g. PO-2026-001',
        notesPlaceholder: 'Notes (optional)',
        cancel: 'Cancel',
        confirmSend: 'Confirm Send',
      },
    },
  },

  reports: {
    title: 'Reports',
    subtitle: 'Workforce analytics — hours, attendance, travel & assignments',

    tabs: {
      my: 'My Report',
      hours: 'Work Hours',
      attendance: 'Attendance',
      assignments: 'Assignments',
      travel: 'Travel Allowance',
      distance: 'Distance 41km+',
    },

    filterBar: {
      thisWeek: 'This Week',
      thisMonth: 'This Month',
      from: 'From',
      to: 'To',
      run: 'Run',
    },

    empty: {
      adjustFilters: 'Adjust the filters and run the report',
    },

    exportCsv: 'Export CSV',
    recordsCount: '{{count}} records',

    hours: {
      stats: {
        daysWorked: 'Days Worked',
        regular: 'Regular Hours',
        overtime: 'Overtime',
        total: 'Total Hours',
      },
      th: {
        employee: 'Employee',
        trade: 'Trade',
        project: 'Project',
        days: 'Days',
        regular: 'Regular',
        overtime: 'Overtime',
        total: 'Total',
        confirmed: 'Confirmed',
        late: 'Late',
      },
      lateSuffix: '{{count}}x late',
      empty: 'No hours data for this period',
    },

    attendance: {
      summary: '{{records}} assignments · {{groups}} projects',
      groupCount: '{{count}} employees',
      th: {
        employee: 'Employee',
        trade: 'Trade',
        role: 'Role',
        scheduled: 'Scheduled',
        present: 'Present',
        absent: 'Absent',
        late: 'Late',
      },
      empty: 'No attendance data for this period',
    },

    travel: {
      totalLabel: 'Total Allowance: {{amount}}',
      zoneLegendTitle: 'CCQ Zone Reference (ACQ Schedule)',
      th: {
        employee: 'Employee',
        trade: 'Trade',
        project: 'Project',
        distance: 'Distance',
        zone: 'Zone',
        ratePerDay: 'Rate/Day',
        days: 'Days',
        total: 'Total',
      },
      formOnly: 'Form only',
      zonePrefix: 'Zone {{zone}}',
      empty: 'No travel allowance data',
      emptyHint: 'Only assignments with calculated distance will appear here',
    },

    assignments: {
      summary: '{{records}} assignments · {{groups}} projects',
      th: {
        employee: 'Employee',
        trade: 'Trade',
        role: 'Role',
        period: 'Period',
        shift: 'Shift',
        distance: 'Distance',
      },
      empty: 'No assignments for this period',
    },

    distance: {
      stats: {
        needsT2200: 'Needs T2200 Form',
        needsT2200Sub: '41–65 km employees',
        companyAllowance: 'Company Allowance',
        companyAllowanceSub: '65km+ employees',
        totalAllowance: 'Total Allowance',
        totalAllowanceSub: 'this period',
      },
      filter: {
        allEmployees: 'All Employees',
        allProjects: 'All Projects',
        clearFilters: 'Clear filters',
      },
      summarySuffix: '{{count}} employees 41km+',
      th: {
        employee: 'Employee',
        trade: 'Trade',
        project: 'Project',
        distance: 'Distance',
        actionRequired: 'Action Required',
        ratePerDay: 'Rate/Day',
        days: 'Days',
        total: 'Total',
      },
      action: {
        t2200Form: 'T2200 Form',
        payAllowance: 'Pay Allowance',
      },
      empty: 'No employees at 41km+ for this period',
      emptyHint: 'Distance is calculated at assignment time via Mapbox',
    },

    my: {
      filter: {
        allDays: 'All Days',
        only41plus: '🚗 41km+ (T2200)',
      },
      banner41plus: 'Showing only days where your worksite was 41km+ from home — eligible for T2200 tax declaration or company travel allowance.',
      stats: {
        daysWorked: 'Days Worked',
        regular: 'Regular Hours',
        overtime: 'Overtime',
        travelAllowance: 'Travel Allowance',
      },
      th: {
        date: 'Date',
        project: 'Project',
        checkIn: 'Check In',
        checkOut: 'Check Out',
        regular: 'Regular',
        overtime: 'Overtime',
        status: 'Status',
        distance: 'Distance',
        travelAllowance: 'Travel Allowance',
      },
      status: {
        confirmed: '✓ Confirmed',
        adjusted: '✓ Adjusted',
        pending: 'Pending',
      },
      empty41plus: 'No days with 41km+ distance for this period',
      emptyAll: 'No attendance records for this period',
      promptRun: 'Select a date range and press Run',
      disclaimer: 'This report is generated from your confirmed attendance records. Hours marked as "Pending" may still be adjusted by your foreman. For official documentation, please contact your HR department.',
    },
  },

  standup: {
    title: 'Daily Standup',
    subtitlePrefix: "Review tomorrow's plan —",
    reviewedSuffix: 'reviewed',
    loading: "Loading tomorrow's plan...",
    loadFailed: 'Failed to load standup data',

    empty: {
      title: 'No projects scheduled for tomorrow',
      hint: 'Assignments for tomorrow will appear here',
    },

    project: {
      workersTomorrow_one: '{{count}} worker tomorrow',
      workersTomorrow_other: '{{count}} workers tomorrow',
      reviewed: '✓ Reviewed',
    },

    team: {
      heading: 'Team Tomorrow',
      empty: 'No workers assigned yet',
    },

    materials: {
      heading: 'Materials for Tomorrow',
      addCta: '+ Add materials',
      noneYet: 'No material request yet for tomorrow',
      empty: 'No items — add what you need',
    },

    addItem: {
      cta: 'Add item',
      namePlaceholder: 'e.g. Copper pipe 3/4 inch',
      qtyPlaceholder: 'Qty *',
      notePlaceholder: 'Note (optional)',
      catalogUsed: 'used {{count}}×',
      cancel: 'Cancel',
      add: 'Add',
      errors: {
        nameRequired: 'Item name required',
        qtyAtLeast1: 'Quantity must be at least 1',
        addFailed: 'Failed to add item',
      },
    },

    review: {
      notePlaceholder: 'Any notes or blockers? (optional)',
      cancel: 'Cancel',
      complete: 'Complete Standup',
      markReviewed: 'Mark as Reviewed',
    },
  },

  permissions: {
    title: 'Permissions Matrix',
    subtitle: 'Role-based access control · Changes apply company-wide',

    auditLog: 'Audit Log',
    resetDefaults: 'Reset to Defaults',
    discard: 'Discard',
    save: 'Save Changes',
    saving: 'Saving…',

    confirmReset: 'Reset "{{role}}" to system defaults?',
    unsavedBanner: 'Unsaved changes for {{role}} — click "Save Changes" to apply.',
    recentChanges: 'Recent Permission Changes',

    audit: {
      loading: 'Loading audit log…',
      empty: 'No permission changes recorded yet.',
      updatedFor: 'updated permissions for',
    },

    sidebar: {
      heading: 'Roles',
      locked: 'locked',
    },

    matrix: {
      readOnly: 'Read-only',
      toggleColumn: 'Toggle column:',
      module: 'Module',
      all: 'All',
      loading: 'Loading matrix…',
      partial: 'partial',
      footerCount: '{{enabled}} / {{total}} permissions enabled',
    },

    actions: {
      view: 'View',
      create: 'Create',
      edit: 'Edit',
      delete: 'Delete',
      approve: 'Approve',
      lockedSuffix: '(locked)',
    },

    modules: {
      dashboard: 'Dashboard',
      projects: 'Projects',
      employees: 'Employees',
      assignments: 'Assignments',
      attendance: 'Attendance',
      material_requests: 'Material Requests',
      purchase_orders: 'Purchase Orders',
      suppliers: 'Suppliers',
      workforce_planner: 'Workforce Planner',
      reports: 'Reports / BI',
      permissions: 'Permissions',
      settings: 'Settings',
    },

    roles: {
      SUPER_ADMIN: 'Super Admin',
      IT_ADMIN: 'IT Admin',
      COMPANY_ADMIN: 'Company Admin',
      TRADE_PROJECT_MANAGER: 'Project Manager',
      TRADE_ADMIN: 'Trade Admin',
      FOREMAN: 'Foreman',
      JOURNEYMAN: 'Journeyman',
      APPRENTICE_4: 'Apprentice 4',
      APPRENTICE_3: 'Apprentice 3',
      APPRENTICE_2: 'Apprentice 2',
      APPRENTICE_1: 'Apprentice 1',
      WORKER: 'Worker',
      DRIVER: 'Driver',
    },

    toast: {
      saved: 'Permissions saved for {{role}}',
      resetDone: '"{{role}}" reset to defaults',
      loadFailed: 'Failed to load permissions matrix',
      auditLoadFailed: 'Failed to load audit log',
      saveFailed: 'Save failed',
      resetFailed: 'Reset failed',
    },
  },

  taskRequest: {
    title: 'Task Request',
    subtitle: 'Send tasks and blueprints to your workers',

    tabs: {
      new: 'New Task',
      sent: 'Sent Tasks',
    },

    new: {
      titleLabel: 'Title *',
      titlePlaceholder: 'e.g. Install main water line — Section A',
      instructions: 'Instructions',
      instructionsOptional: '(optional)',
      instructionsPlaceholder: 'Describe the task in detail...',
      priority: 'Priority',
      priorities: {
        LOW: 'Low',
        NORMAL: 'Normal',
        HIGH: 'High',
        URGENT: 'Urgent',
      },
      project: 'Project',
      noProject: 'No project',
      dueDate: 'Due Date',
      attachment: 'Attachment',
      attachmentHint: '(PDF or image, max 20MB)',
      uploadCta: 'Click to upload',
      sending: 'Sending...',
      send: 'Send Task',
      recipients: 'Recipients *',
      recipientsHint: 'Start typing to search by name or trade',
      noRecipients: 'No recipients yet',
      typeToSearch: 'Type above to search workers',
      selected: 'Selected',
      errors: {
        titleRequired: 'Title is required',
        recipientsRequired: 'Add at least one recipient',
        sendFailed: 'Failed to send',
      },
      sentToast: 'Sent to {{count}} worker(s) ✓',
      sentToastPending: 'Sent to {{count}} worker(s) ✓ — {{pending}} pending assignment',
    },

    sent: {
      empty: 'No tasks sent yet',
      emptyHint: 'Switch to "New Task" to get started',
      th: {
        task: 'Task',
        project: 'Project',
        due: 'Due',
        priority: 'Priority',
        recipients: 'Recipients',
        progress: 'Progress',
      },
      status: {
        done: '✓ Done',
        awaiting: '⏳ Awaiting',
        seen: '👁 Seen',
        sent: '📬 Sent',
      },
      pendingBanner: '{{count}} recipient(s) will receive this task once assigned to the project',
    },
  },

  userManagement: {
    title: 'User Management',
    totalSuffix: '{{count}} users total',

    stats: {
      total: 'Total',
      active: 'Active',
      pending: 'Pending',
      disabled: 'Disabled',
    },

    searchPlaceholder: 'Search users...',
    allRoles: 'All Roles',
    allStatus: 'All Status',

    statusFilter: {
      active: 'Active',
      pending: 'Pending Activation',
      disabled: 'Disabled',
    },

    th: {
      user: 'User',
      role: 'Role',
      trade: 'Trade',
      status: 'Status',
      joined: 'Joined',
      actions: 'Actions',
    },

    badge: {
      active: 'Active',
      pending: 'Pending',
      disabled: 'Disabled',
    },

    invitedPrefix: 'Invited {{date}}',

    empty: 'No users found',
    emptyHint: 'Try adjusting your filters',

    actions: {
      role: 'Role',
      roleTooltip: 'Change role',
      resend: 'Resend',
      resendTooltip: 'Resend activation email',
      disable: 'Disable',
      enable: 'Enable',
      disableTooltip: 'Disable account',
      enableTooltip: 'Enable account',
    },

    toast: {
      activated: 'User activated',
      deactivated: 'User deactivated',
      resent: 'Activation email resent',
    },

    errors: {
      cannotDeactivateSelf: 'You cannot deactivate your own account',
      insufficientPrivilegeStatus: "You cannot change this user's status",
      updateStatusFailed: 'Failed to update status',
      alreadyActivated: 'This user is already activated',
      emailNotConfigured: 'Email service not configured',
      noEmailOnRecord: 'No email found for this user',
      resendFailed: 'Failed to resend email',
    },

    modal: {
      heading: 'Change Role',
      newRoleLabel: 'New Role',
      cancel: 'Cancel',
      saving: 'Saving...',
      save: 'Save Role',
      errors: {
        insufficientPrivilege: "You cannot change this user's role",
        cannotAssignHigher: 'You cannot assign a role higher than yours',
        invalidRole: 'Invalid role selected',
        updateFailed: 'Failed to update role',
      },
    },

    roleLabels: {
      WORKER: 'Worker',
      TRADE_ADMIN: 'Trade Admin',
      TRADE_PROJECT_MANAGER: 'Trade Project Manager',
      COMPANY_ADMIN: 'Company Admin',
      IT_ADMIN: 'IT Admin',
    },

    badgeLabels: {
      SUPER_ADMIN: 'Super Admin',
      IT_ADMIN: 'IT Admin',
      COMPANY_ADMIN: 'Co. Admin',
      TRADE_PROJECT_MANAGER: 'Project Mgr',
      TRADE_ADMIN: 'Trade Admin',
      WORKER: 'Worker',
    },
  },

  profile: {
    title: 'My Profile',
    addressPlaceholder: 'Start typing your home address...',

    errors: {
      saveFailed: 'Failed to update profile',
      pinChangeFailed: 'Failed to change PIN',
      tradeRequired: 'Trade is required',
      levelRequired: 'Level is required',
      phoneRequired: 'Phone is required',
      addressRequired: 'Home address is required',
      cityRequired: 'City is required',
      postalCodeRequired: 'Postal code is required',
      currentPinRequired: 'Current PIN is required',
      newPinRequired: 'New PIN is required',
      pinTooShort: 'PIN must be at least 4 characters',
      pinsMismatch: 'PINs do not match',
    },

    success: {
      profileUpdated: 'Profile updated successfully',
      pinChanged: 'PIN changed successfully',
    },

    incompleteBanner: {
      title: 'Complete Your Profile',
      body: 'Please fill in all required fields below to complete your employee profile. Your administrator needs this information on file.',
    },

    admin: {
      accountInfo: 'Account Info',
      username: 'Username',
      role: 'Role',
      adminAccountTitle: 'Admin Account',
      adminAccountBody: 'This is an admin account without an employee profile. You can manage employees from the {{employeesLink}} page.',
      employees: 'Employees',
    },

    pinSection: {
      heading: 'Change PIN',
      currentPin: 'Current PIN',
      newPin: 'New PIN',
      confirmNewPin: 'Confirm New PIN',
      updateButton: 'Update PIN',
    },

    tradeInfo: {
      heading: 'Trade Info',
      trade: 'Trade *',
      selectTrade: 'Select trade',
      level: 'Level *',
      selectLevel: 'Select level',
    },

    contact: {
      heading: 'Contact',
      phone: 'Phone *',
      phonePlaceholder: '+1 514 000 0000',
    },

    address: {
      heading: 'Home Address',
      street: 'Street Address *',
      unit: 'Unit/Apt',
      city: 'City *',
      postalCode: 'Postal Code *',
      postalCodePlaceholder: 'H2X 1Y4',
    },

    emergency: {
      heading: 'Emergency Contact',
      name: 'Name',
      phone: 'Phone',
      relationship: 'Relationship',
      relationshipPlaceholder: 'e.g. Spouse, Parent',
    },

    save: 'Save Profile',
  },

  onboarding: {
    accountSetup: 'Account Setup',
    welcome: 'Welcome',
    linkInvalid: {
      title: 'Link Invalid',
      contactAdmin: 'Please contact your administrator for a new invitation.',
    },
    errors: {
      invalidLink: 'Invalid invitation link',
      expiredLink: 'This invitation link has expired.',
      invalidOrExpired: 'Invalid or expired invitation link.',
      usernameRequired: 'Username is required',
      usernameTooShort: 'Username must be at least 3 characters',
      pinRequired: 'PIN is required',
      pinTooShort: 'PIN must be at least 4 characters',
      pinsMismatch: 'PINs do not match',
      addressRequired: 'Home address is required for assignment matching',
      usernameTaken: 'Username already taken, choose another.',
      generic: 'Something went wrong. Please try again.',
    },
    done: {
      title: "You're all set! 🎉",
      subtitle: 'Your account is ready. Sign in with your username and PIN to get started.',
      goToSignIn: 'Go to Sign In',
    },
    credentials: {
      heading: 'Choose your credentials',
      subheading: "You'll use these to sign in every day.",
      username: 'Username',
      usernamePlaceholder: 'Choose a username',
      pin: 'PIN',
      pinPlaceholder: 'Choose a secure PIN',
      pinConfirm: 'Confirm PIN',
      pinConfirmPlaceholder: 'Confirm your PIN',
      continue: 'Continue',
    },
    profile: {
      heading: 'Your profile',
      subheading: 'Your home address helps us assign you to the closest projects.',
      phone: 'Phone Number',
      phonePlaceholder: '+1 514 000 0000',
      homeAddress: 'Home Address *',
      addressPlaceholder: 'Start typing your home address...',
      locationConfirmed: 'Location confirmed',
      addressDisclaimer: 'Used only for smart assignment matching — never shared publicly.',
      back: 'Back',
      submit: 'Complete Setup',
    },
  },

  bi: {
    workforcePlanner: {
      title: 'Workforce Planner',
      subtitle: "Geographical assignment optimization · Today's active workforce",
      refresh: 'Refresh',

      summary: {
        activeToday: 'Active Today',
        beyondKm: 'Beyond {{km}}km',
        canOptimize: 'Can Optimize',
        totalSavingKm: 'Total Saving (km)',
      },

      filter: {
        all: 'All ({{count}})',
        beyondKm: 'Beyond {{km}}km ({{count}})',
        optimizable: 'Optimizable ({{count}})',
      },

      empty: {
        title: 'All assignments look optimal',
        subtitle: 'No improvements found for the selected filter',
      },

      badge: {
        beyondThreshold: 'Beyond {{km}}km threshold',
        canOptimize: 'Optimization available',
        optimal: 'Optimal placement',
      },

      now: 'Now:',
      suggested: 'Suggested:',
      apply: 'Apply',
      confirmMove: 'Move {{employee}} from {{currentProject}} to {{suggestedProject}}?',
      successMove: '{{employee}} moved to {{suggestedProject}} ✓',
    },
  },

  projects: {
    title: 'Projects',
    subtitle: '{{count}} projects total',
    newButton: 'New Project',

    searchPlaceholder: 'Search projects...',
    allStatuses: 'All Statuses',

    th: {
      code: 'Code',
      projectName: 'Project Name',
      trade: 'Trade',
      status: 'Status',
      dates: 'Dates',
      address: 'Address',
    },

    empty: 'No projects found',
    emptyFiltered: 'Try adjusting your filters',
    emptyDefault: 'Create your first project',
    noAddress: 'No address',

    modal: {
      titleNew: 'New Project',
      titleEdit: 'Edit Project',
      projectName: 'Project Name *',
      projectNamePlaceholder: 'Enter project name',
      ccqSector: 'CCQ Sector',
      ccqSectorHint: '(for travel allowance calculation)',
      ccqSectorIC: 'Institutionnel / Commercial (IC)',
      ccqSectorIndustrial: 'Industriel (I)',
      ccqSectorResidential: 'Résidentiel (R)',
      tradeType: 'Trade Type *',
      selectTrade: 'Select trade',
      status: 'Status',
      selectStatus: 'Select status',
      siteAddress: 'Site Address',
      addressPlaceholder: 'Search address...',
      coordinatesSaved: 'Coordinates saved ({{lat}}, {{lng}})',
      startDate: 'Start Date',
      endDate: 'End Date',
      client: 'Client',
      noClient: 'No client',
      cancel: 'Cancel',
      saveChanges: 'Save Changes',
      createProject: 'Create Project',
      errors: {
        projectNameRequired: 'Project name is required',
        tradeTypeRequired: 'Trade type is required',
        saveFailed: 'Failed to save project',
      },
    },
  },
};
