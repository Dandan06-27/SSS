let pendingDelete = null;
let pieChart;
let barChart;
let groupedBarChart;
const authScreen = document.getElementById('authScreen');
const dashboardShell = document.getElementById('dashboardShell');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const returnToLogin = document.getElementById('returnToLogin');
const passwordToggle = document.getElementById('passwordToggle');
const loggedInUser = document.getElementById('loggedInUser');
const logoutButton = document.getElementById('logoutButton');
const databaseNotification = document.getElementById('databaseNotification');
const logoutConfirmModal = document.getElementById('logoutConfirmModal');
const logoutConfirmApprove = document.getElementById('logoutConfirmApprove');
const logoutConfirmCancel = document.getElementById('logoutConfirmCancel');
const pageWrapper = document.getElementById('dashboardShell');
let currentUser = null;
const AUTH_TRANSITION_MS = 1200;
let editingEmployerId = null;
let databaseNotificationTimer;

const getOfficerView = (role) => {
  const normalizedRole = String(role || '')
    .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
    .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');
  return /^Account Officer [1-3]$/.test(normalizedRole)
    ? normalizedRole.replace('Account Officer ', 'AO')
    : '';
};

const isOfficerRole = (role) => Boolean(getOfficerView(role));

const showAuthForm = (formName) => {
  const isRegister = formName === 'register';
  loginForm.hidden = isRegister;
  registerForm.hidden = !isRegister;
};

passwordToggle.addEventListener('click', () => {
  const passwordInput = loginForm.elements.password;
  const isVisible = passwordInput.type === 'text';
  passwordInput.type = isVisible ? 'password' : 'text';
  passwordToggle.textContent = isVisible ? 'Show' : 'Hide';
  passwordToggle.setAttribute('aria-label', `${isVisible ? 'Show' : 'Hide'} password`);
  passwordToggle.setAttribute('aria-pressed', String(!isVisible));
});

const showDashboard = (account, { animate = false } = {}) => {
  currentUser = account;
  const officerViewName = getOfficerView(account.role);
  const officerMode = Boolean(officerViewName);
  const superAdmin = account.role === 'Super Admin';
  pageWrapper.classList.remove('officer-mode');
  pageWrapper.classList.add('dashboard-active');
  pageWrapper.dataset.officerView = officerViewName;
  document.querySelectorAll('#mainNav .nav-item[data-nav-view]').forEach((navItem) => {
    const navView = navItem.dataset.navView;
    navItem.hidden = (superAdmin && navView.startsWith('AO'))
      || (superAdmin && navView === 'EmployerForm')
      || (officerMode && navView !== officerViewName && navView !== 'EmployerForm');
  });
  document.getElementById('employerFormView').hidden = true;
  document.getElementById('dashboardView').hidden = false;
  document.querySelectorAll('.ao-view').forEach((view) => {
    view.hidden = true;
  });
  document.querySelector('.ao-views').classList.remove('is-active');
  document.getElementById('mainNav').dataset.activeView = 'DASHBOARD';
  loggedInUser.textContent = `${account.username} | ${account.role || 'User'}`;
  const openOfficerDataForm = () => {
    if (officerMode) openEmployerModal(officerViewName);
  };

  if (animate) {
    authScreen.hidden = false;
    authScreen.classList.add('is-authenticating');
    window.setTimeout(() => {
      authScreen.classList.remove('is-authenticating');
      authScreen.hidden = true;
      dashboardShell.hidden = false;
      openOfficerDataForm();
    }, AUTH_TRANSITION_MS);
    return;
  }

  authScreen.hidden = true;
  dashboardShell.hidden = false;
  if (officerMode) window.setTimeout(openOfficerDataForm, 0);
};

const signOut = () => {
  currentUser = null;
  logoutConfirmModal.hidden = true;
  authScreen.classList.remove('is-authenticating');
  pageWrapper.classList.remove('officer-mode');
  delete pageWrapper.dataset.officerView;
  document.querySelectorAll('#mainNav .nav-item[data-nav-view]').forEach((navItem) => {
    navItem.hidden = false;
  });
  document.getElementById('employerFormView').hidden = true;
  sessionStorage.removeItem('sssAuthenticatedUser');
  dashboardShell.hidden = true;
  authScreen.hidden = false;
  loginForm.reset();
  loginForm.elements.password.type = 'password';
  passwordToggle.textContent = 'Show';
  passwordToggle.setAttribute('aria-label', 'Show password');
  passwordToggle.setAttribute('aria-pressed', 'false');
  document.getElementById('username').focus();
};

const savedUser = sessionStorage.getItem('sssAuthenticatedUser');
if (savedUser) {
  try {
    const savedAccount = JSON.parse(savedUser);
    if (!savedAccount.accessToken) throw new Error('Session refresh required.');
    showDashboard(savedAccount);
  } catch (_error) {
    sessionStorage.removeItem('sssAuthenticatedUser');
    dashboardShell.hidden = true;
  }
} else dashboardShell.hidden = true;

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = loginForm.elements.username.value.trim();
  const password = loginForm.elements.password.value;
  const submitButton = loginForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.classList.add('is-loading');
  submitButton.setAttribute('aria-label', 'Signing in');
  loginError.hidden = true;

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');

    sessionStorage.setItem('sssAuthenticatedUser', JSON.stringify(result.user));
    showDashboard(result.user, { animate: true });
    syncOfficerFormLayout();
    loadEmployers().then(refreshMainDashboard).catch((error) => console.error(error));
    loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
    loadCalendarEvents().catch((error) => console.error(error));
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    loginForm.elements.password.focus();
  } finally {
    submitButton.disabled = false;
    submitButton.classList.remove('is-loading');
    submitButton.removeAttribute('aria-label');
  }
});

returnToLogin.addEventListener('click', () => showAuthForm('login'));

registerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const password = registerForm.elements.registrationPassword.value;
  const confirmPassword = registerForm.elements.confirmPassword.value;

  if (password !== confirmPassword) {
    registerError.textContent = 'Passwords do not match.';
    registerError.hidden = false;
    registerForm.elements.confirmPassword.focus();
    return;
  }

  registerError.hidden = true;
  registerForm.reset();
  showAuthForm('login');
  loginError.textContent = 'Registration submitted. An administrator must approve your account before activation.';
  loginError.hidden = false;
});

const openLogoutConfirmation = () => {
  logoutConfirmModal.hidden = false;
  logoutConfirmCancel.focus();
};

const closeLogoutConfirmation = () => {
  logoutConfirmModal.hidden = true;
};

logoutButton.addEventListener('click', openLogoutConfirmation);
logoutConfirmApprove.addEventListener('click', signOut);
logoutConfirmCancel.addEventListener('click', closeLogoutConfirmation);

/* Static dashboard data — mirrors screenshot values exactly */

const navButtons = document.querySelectorAll('.nav-btn');
const mainNav = document.getElementById('mainNav');
const dashboardView = document.getElementById('dashboardView');
const employerFormView = document.getElementById('employerFormView');
const aoViews = document.querySelectorAll('.ao-view');
const employerForm = document.getElementById('employerForm');
const countrySelect = employerForm.elements.addressCountry;
const citySelect = employerForm.elements.addressCity;
const stateSelect = employerForm.elements.addressState;
const postalCodeInput = employerForm.elements.addressPostalCode;
let cityRequestController = null;
let stateRequestController = null;
let postalCodeRequestController = null;
const modalTitle = document.getElementById('employerFormTitle');
const tableDashboardModal = document.getElementById('tableDashboardModal');
const tableDashboardTitle = document.getElementById('tableDashboardTitle');
const tableDashboardClose = document.getElementById('tableDashboardClose');
const orgChartModal = document.getElementById('orgChartModal');
const orgChartClose = document.getElementById('orgChartClose');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const deleteConfirmError = document.getElementById('deleteConfirmError');
const deleteConfirmApprove = document.getElementById('deleteConfirmApprove');
const deleteConfirmCancel = document.getElementById('deleteConfirmCancel');
const deleteConfirmClose = document.getElementById('deleteConfirmClose');
const calendarOpenButton = document.getElementById('calendarOpenButton');
const calendarModal = document.getElementById('calendarModal');
const calendarClose = document.getElementById('calendarClose');
const calendarPrevious = document.getElementById('calendarPrevious');
const calendarNext = document.getElementById('calendarNext');
const calendarAddEvent = document.getElementById('calendarAddEvent');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const calendarGrid = document.getElementById('calendarGrid');
const calendarEventModal = document.getElementById('calendarEventModal');
const calendarEventClose = document.getElementById('calendarEventClose');
const calendarEventForm = document.getElementById('calendarEventForm');
const calendarError = document.getElementById('calendarError');
const calendarSummaryModal = document.getElementById('calendarSummaryModal');
const calendarSummaryClose = document.getElementById('calendarSummaryClose');
const calendarSummary = document.getElementById('calendarSummary');
const calendarNotificationModal = document.getElementById('calendarNotificationModal');
const calendarNotificationClose = document.getElementById('calendarNotificationClose');
const calendarNotificationOpen = document.getElementById('calendarNotificationOpen');
const calendarNotificationDismiss = document.getElementById('calendarNotificationDismiss');
const calendarNotificationSummary = document.getElementById('calendarNotificationSummary');
let calendarEvents = [];
let branchSummary = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let calendarReturnView = 'DASHBOARD';
let orgChartReturnView = 'DASHBOARD';
const orgChartGroups = {
  root: document.querySelector('[data-org-chart-group="root"]'),
  admin: document.querySelector('[data-org-chart-group="admin"]'),
  users: document.querySelector('[data-org-chart-group="users"]'),
};
const orgChartContent = document.querySelector('.org-chart-content');

const formatCalendarDate = (date) => date.toISOString().slice(0, 10);
const formatEventTime = (time) => time ? time.slice(0, 5) : '';

const updateEmployerTotals = () => {
  const principal = Number(employerForm.elements.principal.value || 0);
  const penalty = Number(employerForm.elements.penalty.value || 0);
  const interest = Number(employerForm.elements.interest.value || 0);
  employerForm.elements.totalAmount.value = (principal + penalty + interest).toFixed(2);
  const paymentPrincipal = Number(employerForm.elements.paymentPrincipal.value || 0);
  const paymentInterest = Number(employerForm.elements.paymentInterest.value || 0);
  const paymentPenalty = Number(employerForm.elements.paymentPenalty.value || 0);
  employerForm.elements.paymentTotal.value = (paymentPrincipal + paymentInterest + paymentPenalty).toFixed(2);
};

['principal', 'penalty', 'interest'].forEach((fieldName) => {
  employerForm.elements[fieldName].addEventListener('input', updateEmployerTotals);
});

['paymentPrincipal', 'paymentInterest', 'paymentPenalty'].forEach((fieldName) => {
  employerForm.elements[fieldName].addEventListener('input', updateEmployerTotals);
});

const showCurrentDateNotification = () => {
  const today = formatCalendarDate(new Date());
  const todaysEvents = calendarEvents.filter((event) => event.event_date === today);
  if (!todaysEvents.length) return;
  calendarNotificationSummary.replaceChildren();
  todaysEvents.forEach((event) => {
    const eventSummary = document.createElement('article');
    eventSummary.className = 'calendar-notification-event';
    eventSummary.innerHTML = `<h3>${event.title}</h3><p>${formatEventTime(event.start_time)}-${formatEventTime(event.end_time)}</p><p>${event.description || 'No description provided.'}</p>`;
    calendarNotificationSummary.appendChild(eventSummary);
  });
  calendarNotificationModal.hidden = false;
  calendarNotificationClose.focus();
};

const renderCalendar = () => {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  calendarMonthLabel.textContent = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  calendarGrid.replaceChildren();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let index = 0; index < firstDay + daysInMonth; index += 1) {
    const dayCell = document.createElement('div');
    dayCell.className = 'calendar-day';
    if (index < firstDay) {
      dayCell.classList.add('calendar-day-empty');
    } else {
      const day = index - firstDay + 1;
      const date = formatCalendarDate(new Date(year, month, day));
      if (date === formatCalendarDate(new Date())) dayCell.classList.add('is-today');
      dayCell.innerHTML = `<span class="calendar-day-number">${day}</span>`;
      calendarEvents.filter((event) => event.event_date === date).forEach((event) => {
        const eventButton = document.createElement('button');
        eventButton.className = 'calendar-event';
        eventButton.type = 'button';
        eventButton.textContent = event.title;
        eventButton.addEventListener('click', () => {
          calendarSummary.innerHTML = `<h3>${event.title}</h3><p>${event.event_date} | ${formatEventTime(event.start_time)}-${formatEventTime(event.end_time)}</p><p>${event.description || 'No description provided.'}</p>`;
          calendarSummaryModal.hidden = false;
          calendarSummaryClose.focus();
        });
        dayCell.appendChild(eventButton);
      });
    }
    calendarGrid.appendChild(dayCell);
  }
};

const loadCalendarEvents = async () => {
  if (!currentUser) return;
  const response = await fetch('/api/calendar-events', { headers: { Authorization: `Bearer ${currentUser.accessToken}` } });
  if (!response.ok) throw new Error('Unable to load calendar events.');
  calendarEvents = await response.json();
  renderCalendar();
  showCurrentDateNotification();
};

const showCalendarPage = () => {
  calendarReturnView = mainNav.dataset.activeView || 'DASHBOARD';
  pageWrapper.classList.remove('dashboard-active');
  orgChartModal.hidden = true;
  dashboardView.hidden = true;
  employerFormView.hidden = true;
  aoViews.forEach((view) => { view.hidden = true; });
  document.querySelector('.ao-views').classList.remove('is-active');
  calendarModal.hidden = false;
  calendarOpenButton.classList.add('active');
  renderCalendar();
  calendarClose.focus();
};

const closeCalendar = () => {
  calendarModal.hidden = true;
  calendarOpenButton.classList.remove('active');
  navigateToView(calendarReturnView);
};
const closeCalendarEvent = () => { calendarEventModal.hidden = true; };
const closeCalendarSummary = () => { calendarSummaryModal.hidden = true; };
const closeCalendarNotification = () => { calendarNotificationModal.hidden = true; };

calendarOpenButton.addEventListener('click', () => {
  showCalendarPage();
});
calendarClose.addEventListener('click', closeCalendar);
calendarPrevious.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
calendarNext.addEventListener('click', () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
calendarAddEvent.addEventListener('click', () => {
  calendarEventForm.reset();
  calendarError.hidden = true;
  calendarEventModal.hidden = false;
  calendarEventForm.elements.date.value = formatCalendarDate(calendarMonth);
  calendarEventForm.elements.title.focus();
});
calendarEventClose.addEventListener('click', closeCalendarEvent);
calendarSummaryClose.addEventListener('click', closeCalendarSummary);
calendarNotificationClose.addEventListener('click', closeCalendarNotification);
calendarNotificationDismiss.addEventListener('click', closeCalendarNotification);
calendarNotificationOpen.addEventListener('click', () => {
  closeCalendarNotification();
  showCalendarPage();
});

calendarEventForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  calendarError.hidden = true;
  const formData = new FormData(calendarEventForm);
  const startTime = formData.get('startTime');
  const endTime = formData.get('endTime');
  if (endTime <= startTime) {
    calendarError.textContent = 'End time must be after start time.';
    calendarError.hidden = false;
    return;
  }

  const submitButton = calendarEventForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await fetch('/api/calendar-events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentUser.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: formData.get('title'),
        date: formData.get('date'),
        startTime,
        endTime,
        description: formData.get('description'),
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to save calendar event.');
    calendarEvents.push(result);
    closeCalendarEvent();
    renderCalendar();
    if (result.event_date === formatCalendarDate(new Date())) showCurrentDateNotification();
  } catch (error) {
    calendarError.textContent = error.message;
    calendarError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

calendarEventModal.addEventListener('click', (event) => {
  if (event.target === calendarEventModal) closeCalendarEvent();
});
calendarSummaryModal.addEventListener('click', (event) => {
  if (event.target === calendarSummaryModal) closeCalendarSummary();
});
calendarNotificationModal.addEventListener('click', (event) => {
  if (event.target === calendarNotificationModal) closeCalendarNotification();
});

const employerFields = [
  'employer_number',
  'employer_name',
  'address',
  'employee_count',
  'principal',
  'interest',
  'penalty',
  'total_amount',
  'payment_principal',
  'payment_interest',
  'payment_penalty',
  'payment_total',
  'billing_date',
  'soa_date',
  'soa2_date',
  'soa3_date',
  'coverage_date',
  'legal_referral_date',
  'demand_letter_date',
  'demand_letter_received_date',
  'handling_lawyer',
  'docket_number',
  'case_date',
  'status',
  'person_received',
];
const amountFieldIndexes = [4, 5, 6, 7, 8, 9, 10, 11];

const getTableEmployers = (viewName) => [...document.querySelectorAll(`[data-ao-view="${viewName}"] .ao-table tbody tr[data-employer-id]`)]
  .map((row) => [...row.cells].map((cell) => cell.textContent.trim()));

const normalizeStatus = (status) => status.trim().toLowerCase().replace('registed', 'registered');
const parseAmount = (value) => Number(String(value ?? '').replace(/,/g, '')) || 0;
const formatAmount = (value) => {
  const amount = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
};
const isAmountMetric = (name) => ['billed', 'settledAmount', 'unsettledAmount'].includes(name);
const BILLING_DUE_DAYS = 15;

const getBillingDueDate = (billingDate) => {
  if (!billingDate) return null;

  const dueDate = new Date(`${billingDate}T00:00:00`);
  if (Number.isNaN(dueDate.getTime())) return null;
  dueDate.setDate(dueDate.getDate() + BILLING_DUE_DAYS);
  return dueDate;
};

const isBillingDue = (billingDate, today = new Date()) => {
  const dueDate = getBillingDueDate(billingDate);
  if (!dueDate) return false;

  const currentDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return currentDate >= dueDate;
};

const showDatabaseDueNotification = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  if (!view || !databaseNotification) return;

  const dueCount = [...view.querySelectorAll('tbody tr[data-employer-id]')]
    .filter((row) => isBillingDue(row.cells[12]?.dataset.date)).length;
  databaseNotification.textContent = `${dueCount} due ${dueCount === 1 ? 'record' : 'records'} found.`;
  databaseNotification.hidden = false;
  clearTimeout(databaseNotificationTimer);
  databaseNotificationTimer = window.setTimeout(() => {
    databaseNotification.hidden = true;
  }, 3000);
};

const filterAoTable = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const filters = view?.querySelector('.ao-table-filters');
  if (!filters) return;

  const query = filters.querySelector('input[type="search"]').value.trim().toLowerCase();
  const selectedDate = filters.querySelector('[data-filter-date]').value;
  const selectedStatus = normalizeStatus(filters.querySelector('[data-filter-status]').value);
  const rows = [...view.querySelectorAll('tbody tr[data-employer-id]')];

  rows.forEach((row) => {
    const matchesQuery = !query || row.textContent.toLowerCase().includes(query);
    const matchesDate = !selectedDate || row.cells[12]?.dataset.date === selectedDate;
    const isDueDate = isBillingDue(row.cells[12]?.dataset.date);
    const matchesStatus = !selectedStatus
      || (selectedStatus === 'due date' ? isDueDate : normalizeStatus(row.cells[23]?.textContent || '') === selectedStatus);
    const isVisible = matchesQuery && matchesDate && matchesStatus;
    row.hidden = !isVisible;
  });
};

const getDashboardMetrics = (values) => {
  const total = values.length;
  const settled = values.filter((row) => row[23].toLowerCase() === 'settled').length;
  const unsettled = values.filter((row) => row[23].toLowerCase() === 'unsettled').length;
  const billed = values.reduce((sum, row) => sum + parseAmount(row[7]), 0);
  const settledAmount = values.filter((row) => row[23].toLowerCase() === 'settled')
    .reduce((sum, row) => sum + parseAmount(row[7]), 0);
  const unsettledAmount = values.filter((row) => row[23].toLowerCase() === 'unsettled')
    .reduce((sum, row) => sum + parseAmount(row[7]), 0);
  const registered = values.filter((row) => ['registed', 'registered'].includes(row[23].toLowerCase())).length;
  const unregistered = values.filter((row) => ['not yet registered', 'unregistered'].includes(row[23].toLowerCase())).length;

  return {
    total,
    settled,
    unsettled,
    completion: `${total ? ((settled / total) * 100).toFixed(2) : '0.00'}%`,
    billed: formatAmount(billed),
    settledAmount: formatAmount(settledAmount),
    unsettledAmount: formatAmount(unsettledAmount),
    registered,
    unregistered,
  };
};

const navigateToView = (viewName) => {
  const isDashboard = viewName === 'DASHBOARD';
  const isEmployerForm = viewName === 'EmployerForm';
  calendarModal.hidden = true;
  orgChartModal.hidden = true;
  calendarOpenButton.classList.remove('active');
  pageWrapper.classList.toggle('dashboard-active', isDashboard);
  navButtons.forEach((button) => {
    const buttonView = button.textContent.trim() === 'MASTERFILE' ? 'MasterFile' : button.textContent.trim();
    button.classList.toggle('active', buttonView === viewName);
  });
  dashboardView.hidden = !isDashboard;
  employerFormView.hidden = !isEmployerForm;
  aoViews.forEach((view) => {
    view.hidden = isDashboard || isEmployerForm || view.dataset.aoView !== viewName;
  });
  document.querySelector('.ao-views').classList.toggle('is-active', !isDashboard && !isEmployerForm);
  mainNav.dataset.activeView = viewName;
};

const refreshMainDashboard = () => {
  const officerViewName = getOfficerView(currentUser?.role);
  const dashboardMetrics = getDashboardMetrics(getTableEmployers(officerViewName || 'MasterFile'));
  Object.entries(dashboardMetrics).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-main-metric="${name}"]`);
    if (metric) metric.textContent = isAmountMetric(name) ? formatAmount(value) : value;
  });
  ['settled', 'unsettled'].forEach((name) => {
    const metric = document.querySelector(`[data-status-metric="${name}"]`);
    if (metric) metric.textContent = dashboardMetrics[name];
  });

  const branchMetrics = ['AO1', 'AO2', 'AO3'].map((viewName) => ({
    viewName,
    metrics: branchSummary?.[viewName] || getDashboardMetrics(getTableEmployers(viewName)),
  }));
  branchMetrics.forEach(({ viewName, metrics }) => {
    const row = document.querySelector(`[data-branch-row="${viewName}"]`);
    Object.entries(metrics).forEach(([name, value]) => {
      const metric = row?.querySelector(`[data-branch-metric="${name}"]`);
      if (metric) metric.textContent = isAmountMetric(name) ? formatAmount(value) : value;
    });
  });

  const branchTotals = ['total', 'settled', 'unsettled', 'billed', 'unsettledAmount'].reduce((totals, name) => {
    totals[name] = branchMetrics.reduce((sum, branch) => sum + parseAmount(branch.metrics[name]), 0);
    return totals;
  }, {});
  branchTotals.completion = `${branchTotals.total ? ((branchTotals.settled / branchTotals.total) * 100).toFixed(2) : '0.00'}%`;
  Object.entries(branchTotals).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-branch-total="${name}"]`);
    if (metric) metric.textContent = isAmountMetric(name) ? formatAmount(value) : value;
  });
  const leadingBranch = branchMetrics.reduce((leading, branch) => (
    branch.metrics.total > leading.metrics.total ? branch : leading
  ));
  document.querySelector('[data-insight="leadingBranch"]').textContent = `${leadingBranch.viewName} currently has the most encoded records (${leadingBranch.metrics.total}).`;
  document.querySelector('[data-insight="completion"]').textContent = `Overall completion rate: ${dashboardMetrics.completion}`;
  document.querySelector('[data-insight="billing"]').textContent = `Total billed: P${dashboardMetrics.billed} | Unsettled: P${dashboardMetrics.unsettledAmount}`;
  document.querySelector('[data-insight="settlement"]').textContent = `Settled: ${dashboardMetrics.settled} | Unsettled: ${dashboardMetrics.unsettled}`;
  document.querySelector('[data-insight="registration"]').textContent = `Registered: ${dashboardMetrics.registered} | Not Yet Registered: ${dashboardMetrics.unregistered}`;
  refreshCharts();
};

const refreshCharts = () => {
  if (!pieChart || !barChart || !groupedBarChart) return;

  const readMetric = (selector) => parseAmount(document.querySelector(selector)?.textContent.replace('%', ''));
  const branchNames = ['AO1', 'AO2', 'AO3'];
  const branchMetrics = branchNames.map((viewName) => ({
    total: readMetric(`[data-branch-row="${viewName}"] [data-branch-metric="total"]`),
    settled: readMetric(`[data-branch-row="${viewName}"] [data-branch-metric="settled"]`),
    unsettled: readMetric(`[data-branch-row="${viewName}"] [data-branch-metric="unsettled"]`),
    billed: readMetric(`[data-branch-row="${viewName}"] [data-branch-metric="billed"]`),
    unsettledAmount: readMetric(`[data-branch-row="${viewName}"] [data-branch-metric="unsettledAmount"]`),
  }));

  pieChart.data.datasets[0].data = branchMetrics.map((branch) => branch.total);
  barChart.data.datasets[0].data = [
    readMetric('[data-main-metric="settled"]'),
    readMetric('[data-main-metric="unsettled"]'),
  ];
  groupedBarChart.data.datasets.forEach((dataset, index) => {
    const branch = branchMetrics[index];
    if (branch) dataset.data = [branch.total, branch.settled, branch.unsettled, branch.billed, branch.unsettledAmount];
  });
  groupedBarChart.data.datasets[3].data = [
    readMetric('[data-branch-total="total"]'),
    readMetric('[data-branch-total="settled"]'),
    readMetric('[data-branch-total="unsettled"]'),
    readMetric('[data-branch-total="billed"]'),
    readMetric('[data-branch-total="unsettledAmount"]'),
  ];
  pieChart.update('none');
  barChart.update('none');
  groupedBarChart.update('none');
};

const openEmployerModal = (viewName) => {
  editingEmployerId = null;
  employerForm.reset();
  countrySelect.value = 'Philippines';
  loadAddressRegions('Cebu', 'Toledo');
  employerForm.elements.assignedView.value = getOfficerView(currentUser?.role) || viewName;
  employerForm.classList.remove('is-editing');
  updateEmployerTotals();
  modalTitle.textContent = isOfficerRole(currentUser?.role)
    ? "Employer's Data Form"
    : `Employer's Data Form - ${employerForm.elements.assignedView.value}`;
  employerForm.querySelector('.employer-submit-btn').textContent = 'SUBMIT';
  navigateToView('EmployerForm');
  employerForm.elements.employerNumber.focus();
};

const openEmployerEdit = (row) => {
  const employer = JSON.parse(row.dataset.employer || '{}');
  if (!employer.id) return;
  editingEmployerId = employer.id;
  employerForm.reset();
  Object.entries({
    employerId: employer.id,
    assignedView: employer.assigned_view,
    employerNumber: employer.employer_number,
    employerName: employer.employer_name,
    addressLine1: employer.address,
    employeeCount: employer.employee_count,
    principal: employer.principal,
    penalty: employer.penalty,
    interest: employer.interest,
    totalAmount: employer.total_amount,
    paymentPrincipal: employer.payment_principal,
    paymentInterest: employer.payment_interest,
    paymentPenalty: employer.payment_penalty,
    paymentTotal: employer.payment_total,
    billingDate: employer.billing_date,
    soaDate: employer.soa_date,
    soa2Date: employer.soa2_date,
    soa3Date: employer.soa3_date,
    coverageDate: employer.coverage_date,
    legalReferralDate: employer.legal_referral_date,
    demandLetterDate: employer.demand_letter_date,
    demandLetterReceivedDate: employer.demand_letter_received_date,
    handlingLawyer: employer.handling_lawyer,
    docketNumber: employer.docket_number,
    caseDate: employer.case_date,
    personReceived: employer.person_received,
    status: employer.status,
  }).forEach(([field, value]) => {
    if (employerForm.elements[field]) employerForm.elements[field].value = value ?? '';
  });
  modalTitle.textContent = "Edit Employer's Data";
  employerForm.querySelector('.employer-submit-btn').textContent = 'SAVE CHANGES';
  employerForm.classList.add('is-editing');
  updateEmployerTotals();
  navigateToView('EmployerForm');
  employerForm.elements.employerNumber.focus();
};

const closeEmployerModal = () => {
  navigateToView('DASHBOARD');
};

const syncOfficerFormLayout = () => {
  const officerViewName = getOfficerView(currentUser?.role);
  employerForm.elements.assignedView.value = officerViewName || employerForm.elements.assignedView.value;
  modalTitle.id = 'employerFormTitle';
};

const openTableDashboard = (viewName) => {
  const metrics = getDashboardMetrics(getTableEmployers(viewName));
  tableDashboardTitle.textContent = `${viewName.toUpperCase()} DASHBOARD`;
  Object.entries(metrics).forEach(([name, value]) => {
    tableDashboardModal.querySelector(`[data-dashboard-metric="${name}"]`).textContent = isAmountMetric(name)
      ? formatAmount(value)
      : value;
  });
  tableDashboardModal.hidden = false;
  tableDashboardClose.focus();
};

const closeTableDashboard = () => {
  tableDashboardModal.hidden = true;
};

const normalizeOrgChartRole = (role) => String(role || '')
  .replace(/^Assistant Officer ([1-3])$/, 'Account Officer $1')
  .replace(/^Account Assistant ([1-3])$/, 'Account Officer $1');

const createOrgChartNode = (user, isRoot = false) => {
  const node = document.createElement('article');
  node.className = `org-node${isRoot ? ' org-node-root' : ''}`;
  node.dataset.orgRole = normalizeOrgChartRole(user.role);

  const role = normalizeOrgChartRole(user.role);
  if (isRoot || role === 'Admin') {
    const roleLabel = document.createElement('span');
    roleLabel.className = 'org-role';
    roleLabel.textContent = isRoot ? 'ROOT' : 'ADMIN';
    node.appendChild(roleLabel);
  }

  const name = document.createElement('h3');
  name.textContent = user.full_name || user.username || user.email;
  node.appendChild(name);

  const username = document.createElement('p');
  username.className = 'org-username';
  username.textContent = user.username || user.email;
  node.appendChild(username);

  const email = document.createElement('p');
  email.textContent = user.email;
  node.appendChild(email);

  const userRole = document.createElement('p');
  userRole.textContent = role;
  node.appendChild(userRole);
  return node;
};

const drawOrgChartLines = () => {
  orgChartContent.querySelector('.org-chart-lines')?.remove();
  const rootNode = orgChartGroups.root.querySelector('.org-node-root');
  const aoNodes = [...orgChartGroups.users.querySelectorAll('[data-org-role^="Account Officer "]')]
    .filter((node) => /^Account Officer [1-3]$/.test(node.dataset.orgRole));
  if (!rootNode || aoNodes.length !== 3) return;

  const contentBounds = orgChartContent.getBoundingClientRect();
  const rootBounds = rootNode.getBoundingClientRect();
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('org-chart-lines');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `0 0 ${contentBounds.width} ${contentBounds.height}`);

  aoNodes.forEach((aoNode) => {
    const aoBounds = aoNode.getBoundingClientRect();
    const startX = rootBounds.left + rootBounds.width / 2 - contentBounds.left;
    const startY = rootBounds.bottom - contentBounds.top;
    const endX = aoBounds.left + aoBounds.width / 2 - contentBounds.left;
    const endY = aoBounds.top - contentBounds.top;
    const controlY = startY + (endY - startY) * 0.55;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M ${startX} ${startY} C ${startX} ${controlY}, ${endX} ${controlY}, ${endX} ${endY}`);
    line.classList.add('org-chart-line');
    svg.appendChild(line);
  });

  orgChartContent.prepend(svg);
};

const renderOrgChartUsers = (users) => {
  Object.values(orgChartGroups).forEach((group) => group.replaceChildren());
  users.filter((user) => user.is_active !== false).forEach((user) => {
    const role = normalizeOrgChartRole(user.role);
    const groupName = role === 'Super Admin' ? 'root' : role === 'Admin' ? 'admin' : 'users';
    orgChartGroups[groupName].appendChild(createOrgChartNode(user, groupName === 'root'));
  });
  window.requestAnimationFrame(drawOrgChartLines);
};

const loadOrgChartUsers = async () => {
  Object.values(orgChartGroups).forEach((group) => {
    group.replaceChildren();
    const status = document.createElement('p');
    status.className = 'org-chart-status';
    status.textContent = 'Loading users...';
    group.appendChild(status);
  });

  try {
    const response = await fetch('/api/users', { headers: { Authorization: `Bearer ${currentUser.accessToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to load users.');
    renderOrgChartUsers(result);
  } catch (error) {
    Object.values(orgChartGroups).forEach((group) => {
      group.replaceChildren();
      const status = document.createElement('p');
      status.className = 'org-chart-status';
      status.textContent = error.message;
      group.appendChild(status);
    });
  }
};

const openOrgChart = () => {
  orgChartReturnView = mainNav.dataset.activeView || 'DASHBOARD';
  pageWrapper.classList.remove('dashboard-active');
  calendarModal.hidden = true;
  dashboardView.hidden = true;
  employerFormView.hidden = true;
  aoViews.forEach((view) => { view.hidden = true; });
  document.querySelector('.ao-views').classList.remove('is-active');
  orgChartModal.hidden = false;
  loadOrgChartUsers();
  document.querySelector('.dashboard-nav-item .nav-btn').classList.remove('active');
  orgChartClose.focus();
};

const closeOrgChart = () => {
  orgChartModal.hidden = true;
  navigateToView(orgChartReturnView);
};

window.addEventListener('resize', () => {
  if (!orgChartModal.hidden) drawOrgChartLines();
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedView = button.textContent.trim();
    const viewName = selectedView === 'MASTERFILE' ? 'MasterFile' : selectedView === 'DATA FORM' ? 'EmployerForm' : selectedView;
    if (viewName !== 'DASHBOARD' && !viewName.startsWith('AO') && viewName !== 'MasterFile' && viewName !== 'EmployerForm') return;
    if (viewName === 'EmployerForm') {
      openEmployerModal(getOfficerView(currentUser?.role) || 'AO1');
      return;
    }
    navigateToView(viewName);
    if (['AO1', 'AO2', 'AO3', 'MasterFile'].includes(viewName)) {
      showDatabaseDueNotification(viewName);
    }
  });
});

document.querySelectorAll('.add-record-btn').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openEmployerModal(button.dataset.formView);
  });
});

document.querySelector('.org-chart-btn').addEventListener('click', (event) => {
  event.stopPropagation();
  openOrgChart();
});

syncOfficerFormLayout();

document.querySelector('.modal-close-btn').addEventListener('click', closeEmployerModal);

tableDashboardClose.addEventListener('click', closeTableDashboard);
orgChartClose.addEventListener('click', closeOrgChart);

tableDashboardModal.addEventListener('click', (event) => {
  if (event.target === tableDashboardModal) closeTableDashboard();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !employerFormView.hidden) closeEmployerModal();
  if (event.key === 'Escape' && !tableDashboardModal.hidden) closeTableDashboard();
  if (event.key === 'Escape' && !deleteConfirmModal.hidden) closeDeleteConfirmation();
  if (event.key === 'Escape' && !logoutConfirmModal.hidden) closeLogoutConfirmation();
  if (event.key === 'Escape' && !calendarNotificationModal.hidden) closeCalendarNotification();
});

const addEmployerToTable = (viewName, rowValues, employerId, assignedView = viewName, employer = null) => {
  const targetBody = document.querySelector(`[data-ao-view="${viewName}"] .ao-table tbody`);
  if (!targetBody) return false;

  let targetRow = targetBody.querySelector('tr:not(:has(td:not(:empty)))');

  if (!targetRow) {
    targetRow = document.createElement('tr');
    targetBody.appendChild(targetRow);
  }

  targetRow.replaceChildren(...rowValues.map((value, cellIndex) => {
    const cell = document.createElement('td');
    cell.textContent = amountFieldIndexes.includes(cellIndex) && value !== ''
      ? formatAmount(value)
      : value || '';
    return cell;
  }));
  targetRow.dataset.employerId = String(employerId);
  targetRow.dataset.assignedView = assignedView;
  const billingDateCell = targetRow.cells[12];
  if (billingDateCell) billingDateCell.dataset.date = rowValues[12] || '';
  if (employer) targetRow.dataset.employer = JSON.stringify(employer);
  targetRow.classList.toggle('is-due-date', isBillingDue(rowValues[12]));
  filterAoTable(viewName);

  return true;
};

const formatAddressForDisplay = (address) => {
  const normalizedAddress = String(address || '').trim();
  const addressParts = normalizedAddress.match(/^(.+),\s*([^,]+),\s*([^,]+)$/);
  if (!addressParts) return normalizedAddress;

  const city = addressParts[2].trim();
  const displayCity = /\bcity$/i.test(city) ? city : `${city} City`;
  return `${addressParts[1].trim()}, ${displayCity}, ${addressParts[3].trim()}`;
};

const employerToRow = (employer) => employerFields.map((field) => (
  field === 'address' ? formatAddressForDisplay(employer[field]) : employer[field] || ''
));

const setTableEditMode = (viewName, isEditing) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  if (!view) return;

  view.classList.toggle('is-editing', isEditing);
  view.querySelector('.table-edit-btn').textContent = isEditing ? 'Cancel edit' : 'Edit mode';
  view.querySelector('.table-edit-data-btn').hidden = !isEditing;
  view.querySelector('.table-delete-btn').hidden = !isEditing;
  view.querySelectorAll('tbody tr').forEach((row) => row.classList.remove('is-selected'));
};

const editSelectedEmployer = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const selectedRows = [...view.querySelectorAll('tbody tr.is-selected[data-employer-id]')];
  if (selectedRows.length !== 1) return;
  openEmployerEdit(selectedRows[0]);
};

const openDeleteConfirmation = (viewName) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const selectedRows = [...view.querySelectorAll('tbody tr.is-selected[data-employer-id]')];
  if (!selectedRows.length) return;

  pendingDelete = {
    viewName,
    employerIds: selectedRows.map((row) => row.dataset.employerId),
  };
  deleteConfirmError.hidden = true;
  deleteConfirmApprove.disabled = false;
  deleteConfirmModal.hidden = false;
  deleteConfirmApprove.focus();
};

const closeDeleteConfirmation = () => {
  pendingDelete = null;
  deleteConfirmModal.hidden = true;
};

const deleteSelectedRows = async () => {
  if (!pendingDelete) return;

  const { employerIds, viewName } = pendingDelete;
  deleteConfirmApprove.disabled = true;
  const response = await fetch('/api/employers', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: employerIds }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    deleteConfirmError.textContent = error?.error || `Unable to delete employers (HTTP ${response.status}).`;
    deleteConfirmError.hidden = false;
    deleteConfirmApprove.disabled = false;
    return;
  }

  const deletedIds = new Set(employerIds);
  document.querySelectorAll(`.ao-table tbody tr[data-employer-id]`).forEach((row) => {
    if (deletedIds.has(row.dataset.employerId)) row.remove();
  });
  setTableEditMode(viewName, false);
  refreshMainDashboard();
  loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
  closeDeleteConfirmation();
};

const loadEmployers = async () => {
  if (!currentUser?.accessToken) return;

  const response = await fetch('/api/employers', {
    headers: { Authorization: `Bearer ${currentUser.accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to load employers.');

  const employers = await response.json();
  employers.forEach((employer) => {
    addEmployerToTable(employer.assigned_view, employerToRow(employer), employer.id, employer.assigned_view, employer);
    addEmployerToTable('MasterFile', employerToRow(employer), employer.id, employer.assigned_view, employer);
  });
};

const loadEmployerSummary = async () => {
  if (!currentUser?.accessToken) return;

  const response = await fetch('/api/employer-summary', {
    headers: { Authorization: `Bearer ${currentUser.accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to load employer summary.');
  branchSummary = await response.json();
};

const getEmployerAddress = (formData) => [
  formData.get('addressLine1'),
  formData.get('addressCity'),
  formData.get('addressState'),
].map((value) => String(value || '').trim()).filter(Boolean).join(', ');

const setCityOptions = (cities, placeholder) => {
  citySelect.replaceChildren(new Option(placeholder, ''));
  cities.forEach((city) => {
    const cityLabel = /\bcity$/i.test(city) ? city : `${city} City`;
    citySelect.add(new Option(cityLabel, city));
  });
  citySelect.disabled = cities.length === 0;
};

const getCitiesFromOpenStreetMap = async (country, state, requestController) => {
  const safeState = state.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const safeCountry = country.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const query = `[out:json][timeout:25];area["name"="${safeCountry}"]["boundary"="administrative"]->.countryArea;area["name"="${safeState}"]["boundary"="administrative"](area.countryArea)->.searchArea;(node["place"~"city|town|village"](area.searchArea);way["place"~"city|town|village"](area.searchArea);relation["place"~"city|town|village"](area.searchArea););out tags;`;
  const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, {
    signal: requestController.signal,
  });
  if (!response.ok) throw new Error('Unable to load fallback cities.');
  const result = await response.json();
  return Array.isArray(result.elements)
    ? result.elements
      .map((element) => element.tags?.name)
      .filter(Boolean)
    : [];
};

const resetPostalCode = () => {
  postalCodeRequestController?.abort();
  postalCodeInput.value = '';
  postalCodeInput.placeholder = 'Select a city';
};

const loadPostalCode = async () => {
  const country = countrySelect.value;
  const state = stateSelect.value;
  const city = citySelect.value;
  postalCodeRequestController?.abort();
  if (!country || !state || !city) {
    resetPostalCode();
    return;
  }

  const requestController = new AbortController();
  postalCodeRequestController = requestController;
  postalCodeInput.value = '';
  postalCodeInput.placeholder = 'Loading postal code...';
  try {
    const search = encodeURIComponent(`${city}, ${state}, ${country}`);
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${search}`, {
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error('Unable to load postal code.');
    const results = await response.json();
    postalCodeInput.value = results[0]?.address?.postcode || '';
    postalCodeInput.placeholder = postalCodeInput.value ? 'Automatic postal code' : 'No postal code found';
  } catch (error) {
    if (error.name === 'AbortError') return;
    postalCodeInput.placeholder = 'Enter postal code';
  } finally {
    if (postalCodeRequestController === requestController) postalCodeRequestController = null;
  }
};

const loadCitiesForCountryAndState = async (preferredCity = '') => {
  const country = countrySelect.value;
  const state = stateSelect.value;
  cityRequestController?.abort();
  if (!country || !state) {
    setCityOptions([], country ? 'Select state first' : 'Select country first');
    return;
  }

  const requestController = new AbortController();
  cityRequestController = requestController;
  setCityOptions([], 'Loading cities...');
  citySelect.disabled = true;
  try {
    const response = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country, state }),
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error('Unable to load cities.');
    const result = await response.json();
    let cities = Array.isArray(result.data)
      ? [...new Set(result.data)].sort((firstCity, secondCity) => firstCity.localeCompare(secondCity))
      : [];
    if (!cities.length) {
      cities = [...new Set(await getCitiesFromOpenStreetMap(country, state, requestController))]
        .sort((firstCity, secondCity) => firstCity.localeCompare(secondCity));
    }
    setCityOptions(cities, cities.length ? 'Select city' : 'No cities found');
    if (preferredCity && cities.includes(preferredCity)) {
      citySelect.value = preferredCity;
      loadPostalCode();
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    setCityOptions([], 'Unable to load cities');
  } finally {
    if (cityRequestController === requestController) cityRequestController = null;
  }
};

const loadStatesForCountry = async (preferredState = '', preferredCity = '') => {
  const country = countrySelect.value;
  stateRequestController?.abort();
  if (!country) {
    setStateOptions([], 'Select country first');
    return;
  }

  const requestController = new AbortController();
  stateRequestController = requestController;
  setStateOptions([], 'Loading states...');
  stateSelect.disabled = true;
  try {
    const response = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country }),
      signal: requestController.signal,
    });
    if (!response.ok) throw new Error('Unable to load states.');
    const result = await response.json();
    const states = Array.isArray(result.data?.states)
      ? result.data.states
        .map((state) => state.name)
        .filter(Boolean)
        .sort((firstState, secondState) => firstState.localeCompare(secondState))
      : [];
    setStateOptions(states, states.length ? 'Select state' : 'No states found');
    if (preferredState && states.includes(preferredState)) {
      stateSelect.value = preferredState;
      loadCitiesForCountryAndState(preferredCity);
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
    setStateOptions([], 'Unable to load states');
  } finally {
    if (stateRequestController === requestController) stateRequestController = null;
  }
};

const setStateOptions = (states, placeholder) => {
  stateSelect.replaceChildren(new Option(placeholder, ''));
  states.forEach((state) => stateSelect.add(new Option(state, state)));
  stateSelect.disabled = states.length === 0;
};

const loadAddressRegions = (preferredState = '', preferredCity = '') => {
  resetPostalCode();
  setCityOptions([], countrySelect.value ? 'Select state first' : 'Select country first');
  loadStatesForCountry(preferredState, preferredCity);
};

countrySelect.addEventListener('change', loadAddressRegions);
stateSelect.addEventListener('change', loadCitiesForCountryAndState);
stateSelect.addEventListener('change', resetPostalCode);
citySelect.addEventListener('change', loadPostalCode);
loadAddressRegions('Cebu', 'Toledo');

employerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(employerForm);
  const employer = {
    assigned_view: formData.get('assignedView'),
    employer_number: formData.get('employerNumber'),
    employer_name: formData.get('employerName'),
    address: getEmployerAddress(formData),
    employee_count: Number(formData.get('employeeCount') || 0),
    principal: Number(formData.get('principal') || 0),
    penalty: Number(formData.get('penalty') || 0),
    interest: Number(formData.get('interest') || 0),
    total_amount: Number((
      Number(formData.get('principal') || 0)
      + Number(formData.get('penalty') || 0)
      + Number(formData.get('interest') || 0)
    ).toFixed(2)),
    payment_principal: Number(formData.get('paymentPrincipal') || 0),
    payment_interest: Number(formData.get('paymentInterest') || 0),
    payment_penalty: Number(formData.get('paymentPenalty') || 0),
    payment_total: Number((
      Number(formData.get('paymentPrincipal') || 0)
      + Number(formData.get('paymentInterest') || 0)
      + Number(formData.get('paymentPenalty') || 0)
    ).toFixed(2)),
    billing_date: formData.get('billingDate') || null,
    coverage_date: formData.get('coverageDate') || null,
    soa_date: formData.get('soaDate') || null,
    soa2_date: formData.get('soa2Date') || null,
    soa3_date: formData.get('soa3Date') || null,
    legal_referral_date: formData.get('legalReferralDate') || null,
    demand_letter_date: formData.get('demandLetterDate') || null,
    demand_letter_received_date: formData.get('demandLetterReceivedDate') || null,
    handling_lawyer: formData.get('handlingLawyer') || '',
    docket_number: formData.get('docketNumber') || '',
    case_date: formData.get('caseDate') || null,
    status: formData.get('status'),
    person_received: formData.get('personReceived') || '',
  };

  const response = await fetch('/api/employers', {
    method: editingEmployerId ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${currentUser?.accessToken || ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(editingEmployerId ? { id: editingEmployerId, employer } : employer),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    alert(error?.error || `Unable to save employer (HTTP ${response.status}).`);
    return;
  }

  const savedEmployer = await response.json();
  document.querySelectorAll(`tr[data-employer-id="${savedEmployer.id}"]`).forEach((row) => {
    row.dataset.employer = JSON.stringify(savedEmployer);
  });
  addEmployerToTable(savedEmployer.assigned_view, employerToRow(savedEmployer), savedEmployer.id, savedEmployer.assigned_view, savedEmployer);
  addEmployerToTable('MasterFile', employerToRow(savedEmployer), savedEmployer.id, savedEmployer.assigned_view, savedEmployer);
  refreshMainDashboard();
  loadEmployerSummary().then(refreshMainDashboard).catch((error) => console.error(error));
  closeEmployerModal();
  editingEmployerId = null;
  employerForm.classList.remove('is-editing');
  employerForm.reset();
});

document.querySelectorAll('.ao-table tbody').forEach((body) => {
  body.innerHTML = '<tr>'.concat('<td></td>'.repeat(25), '</tr>').repeat(21);
});

document.querySelectorAll('[data-table-edit]').forEach((button) => {
  button.addEventListener('click', () => {
    const view = document.querySelector(`[data-ao-view="${button.dataset.tableEdit}"]`);
    setTableEditMode(button.dataset.tableEdit, !view.classList.contains('is-editing'));
  });
});

document.querySelectorAll('[data-table-delete]').forEach((button) => {
  button.addEventListener('click', () => openDeleteConfirmation(button.dataset.tableDelete));
});

document.querySelectorAll('[data-table-edit-data]').forEach((button) => {
  button.addEventListener('click', () => editSelectedEmployer(button.dataset.tableEditData));
});

document.querySelectorAll('.ao-table-filters input, .ao-table-filters select').forEach((control) => {
  const viewName = control.closest('.ao-view').dataset.aoView;
  control.addEventListener('input', () => filterAoTable(viewName));
  control.addEventListener('change', () => filterAoTable(viewName));
});

deleteConfirmApprove.addEventListener('click', deleteSelectedRows);
deleteConfirmCancel.addEventListener('click', closeDeleteConfirmation);
deleteConfirmClose.addEventListener('click', closeDeleteConfirmation);

document.addEventListener('click', (event) => {
  const row = event.target.closest('.ao-table tbody tr');
  if (!row || !row.closest('.ao-view.is-editing') || !row.dataset.employerId) return;
  row.classList.toggle('is-selected');
});

Promise.all([loadEmployers(), loadEmployerSummary()])
  .then(() => refreshMainDashboard())
  .catch((error) => console.error(error));
loadCalendarEvents().catch((error) => console.error(error));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.ao-table') && !event.target.closest('.table-edit-btn')) {
    document.querySelectorAll('.ao-table tbody tr.is-selected').forEach((selectedRow) => {
      selectedRow.classList.remove('is-selected');
    });
  }
});

const COLORS = {
  ao1: '#1565c0',
  ao2: '#2e7d32',
  ao3: '#e65100',
  total: '#29b6f6',
  navy: '#1a3a5c',
};

const chartDefaults = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        font: { size: 9, family: 'Arial' },
        boxWidth: 10,
        padding: 6,
      },
    },
  },
};

/* ── Pie Chart: Employers Encoded by Branch ── */
pieChart = new Chart(document.getElementById('pieChart'), {
  type: 'pie',
  data: {
    labels: ['AO1', 'AO2', 'AO3'],
    datasets: [{
      data: [4, 5, 3],
      backgroundColor: [COLORS.ao1, COLORS.ao2, COLORS.ao3],
      borderColor: '#fff',
      borderWidth: 1,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      ...chartDefaults.plugins,
      legend: {
        ...chartDefaults.plugins.legend,
        position: 'right',
      },
    },
  },
});

/* ── Bar Chart: Settled vs Unsettled ── */
barChart = new Chart(document.getElementById('barChart'), {
  type: 'bar',
  data: {
    labels: ['Settled', 'Unsettled'],
    datasets: [{
      data: [10, 2],
      backgroundColor: [COLORS.navy, COLORS.navy],
      borderRadius: 0,
      barPercentage: 0.55,
    }],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        ticks: { font: { size: 10 } },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        max: 12,
        ticks: {
          stepSize: 2,
          font: { size: 9 },
        },
        grid: { color: '#e0e0e0' },
      },
    },
  },
});

/* ── Grouped Bar Chart: Overall Performance ── */
groupedBarChart = new Chart(document.getElementById('groupedBarChart'), {
  type: 'bar',
  data: {
    labels: ['Records', 'Settled', 'Unsettled', 'Billed Amount', 'Unsettled Amount'],
    datasets: [
      {
        label: 'AO1',
        data: [4, 4, 0, 3.5, 0],
        backgroundColor: COLORS.ao1,
        barPercentage: 0.85,
      },
      {
        label: 'AO2',
        data: [5, 4, 1, 6.3, 2.2],
        backgroundColor: COLORS.ao2,
        barPercentage: 0.85,
      },
      {
        label: 'AO3',
        data: [3, 2, 1, 9.4, 3],
        backgroundColor: COLORS.ao3,
        barPercentage: 0.85,
      },
      {
        label: 'TOTAL',
        data: [12, 10, 2, 19.2, 5.2],
        backgroundColor: COLORS.total,
        barPercentage: 0.85,
      },
    ],
  },
  options: {
    ...chartDefaults,
    plugins: {
      legend: {
        ...chartDefaults.plugins.legend,
        position: 'bottom',
      },
    },
    scales: {
      x: {
        ticks: {
          font: { size: 8 },
          maxRotation: 0,
        },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { font: { size: 9 } },
        grid: { color: '#e0e0e0' },
      },
    },
  },
});

refreshCharts();
