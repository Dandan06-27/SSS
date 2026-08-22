let pendingDelete = null;
let pieChart;
let barChart;
let groupedBarChart;
let editingEmployerId = null;
const authScreen = document.getElementById('authScreen');
const dashboardShell = document.getElementById('dashboardShell');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');
const authTabs = document.querySelectorAll('[data-auth-tab]');
const returnToLogin = document.getElementById('returnToLogin');
const loggedInUser = document.getElementById('loggedInUser');
const logoutButton = document.getElementById('logoutButton');
const pageWrapper = document.getElementById('dashboardShell');
const officerView = document.getElementById('officerView');
let currentUser = null;
const AUTH_TRANSITION_MS = 1200;

const isOfficerRole = (role) => ['Account Officer 1', 'Account Officer 2', 'Account Officer 3'].includes(role);

const showAuthForm = (formName) => {
  const isRegister = formName === 'register';
  loginForm.hidden = isRegister;
  registerForm.hidden = !isRegister;
  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authTab === formName;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
};

const showDashboard = (account, { animate = false } = {}) => {
  currentUser = account;
  const officerMode = isOfficerRole(account.role);
  pageWrapper.classList.toggle('officer-mode', officerMode);
  pageWrapper.dataset.officerView = officerMode ? account.role.replace('Account Officer ', 'AO') : '';
  officerView.hidden = !officerMode;
  loggedInUser.textContent = `${account.username} | ${account.role || 'User'}`;

  if (animate) {
    authScreen.hidden = false;
    authScreen.classList.add('is-authenticating');
    window.setTimeout(() => {
      authScreen.classList.remove('is-authenticating');
      authScreen.hidden = true;
      dashboardShell.hidden = false;
    }, AUTH_TRANSITION_MS);
    return;
  }

  authScreen.hidden = true;
  dashboardShell.hidden = false;
};

const signOut = () => {
  currentUser = null;
  authScreen.classList.remove('is-authenticating');
  pageWrapper.classList.remove('officer-mode');
  delete pageWrapper.dataset.officerView;
  officerView.hidden = true;
  sessionStorage.removeItem('sssAuthenticatedUser');
  dashboardShell.hidden = true;
  authScreen.hidden = false;
  loginForm.reset();
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
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    loginForm.elements.password.focus();
  } finally {
    submitButton.disabled = false;
  }
});

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => showAuthForm(tab.dataset.authTab));
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

logoutButton.addEventListener('click', signOut);

/* Static dashboard data — mirrors screenshot values exactly */

const navButtons = document.querySelectorAll('.nav-btn');
const mainNav = document.getElementById('mainNav');
const dashboardView = document.getElementById('dashboardView');
const aoViews = document.querySelectorAll('.ao-view');
const employerModal = document.getElementById('employerModal');
const officerFormMount = document.getElementById('officerFormMount');
const employerForm = document.getElementById('employerForm');
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
];

const amountFieldIndexes = new Set([4, 5, 6, 7, 8, 9, 10, 11]);
const formatPeso = (value) => `₱${Number(value || 0).toFixed(2)}`;
const parseAmount = (value) => Number(String(value || 0).replace(/[₱,]/g, ''));

const getTableEmployers = (viewName) => [...document.querySelectorAll(`[data-ao-view="${viewName}"] .ao-table tbody tr[data-employer-id]`)]
  .map((row) => [...row.cells].map((cell) => cell.textContent.trim()));

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
    billed: billed.toFixed(2),
    settledAmount: settledAmount.toFixed(2),
    unsettledAmount: unsettledAmount.toFixed(2),
    registered,
    unregistered,
  };
};

const refreshMainDashboard = () => {
  const masterFileMetrics = getDashboardMetrics(getTableEmployers('MasterFile'));
  Object.entries(masterFileMetrics).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-main-metric="${name}"]`);
    if (metric) metric.textContent = ['billed', 'settledAmount', 'unsettledAmount'].includes(name) ? formatPeso(value) : value;
  });
  ['settled', 'unsettled'].forEach((name) => {
    const metric = document.querySelector(`[data-status-metric="${name}"]`);
    if (metric) metric.textContent = masterFileMetrics[name];
  });

  const branchMetrics = ['AO1', 'AO2', 'AO3'].map((viewName) => ({
    viewName,
    metrics: getDashboardMetrics(getTableEmployers(viewName)),
  }));
  branchMetrics.forEach(({ viewName, metrics }) => {
    const row = document.querySelector(`[data-branch-row="${viewName}"]`);
    Object.entries(metrics).forEach(([name, value]) => {
      const metric = row?.querySelector(`[data-branch-metric="${name}"]`);
      if (metric) metric.textContent = ['billed', 'settledAmount', 'unsettledAmount'].includes(name) ? formatPeso(value) : value;
    });
  });

  const branchTotals = ['total', 'settled', 'unsettled', 'billed', 'unsettledAmount'].reduce((totals, name) => {
    totals[name] = branchMetrics.reduce((sum, branch) => sum + Number(branch.metrics[name] || 0), 0);
    return totals;
  }, {});
  branchTotals.completion = `${branchTotals.total ? ((branchTotals.settled / branchTotals.total) * 100).toFixed(2) : '0.00'}%`;
  Object.entries(branchTotals).forEach(([name, value]) => {
    const metric = document.querySelector(`[data-branch-total="${name}"]`);
    if (metric) metric.textContent = ['billed', 'unsettledAmount'].includes(name) ? formatPeso(value) : value;
  });
  const leadingBranch = branchMetrics.reduce((leading, branch) => (
    branch.metrics.total > leading.metrics.total ? branch : leading
  ));
  document.querySelector('[data-insight="leadingBranch"]').textContent = `${leadingBranch.viewName} currently has the most encoded records (${leadingBranch.metrics.total}).`;
  document.querySelector('[data-insight="completion"]').textContent = `Overall completion rate: ${masterFileMetrics.completion}`;
  document.querySelector('[data-insight="billing"]').textContent = `Total billed: ${formatPeso(masterFileMetrics.billed)} | Unsettled: ${formatPeso(masterFileMetrics.unsettledAmount)}`;
  document.querySelector('[data-insight="settlement"]').textContent = `Settled: ${masterFileMetrics.settled} | Unsettled: ${masterFileMetrics.unsettled}`;
  document.querySelector('[data-insight="registration"]').textContent = `Registered: ${masterFileMetrics.registered} | Not Yet Registered: ${masterFileMetrics.unregistered}`;
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
  if (isOfficerRole(currentUser?.role)) return;
  employerForm.elements.assignedView.value = viewName;
  modalTitle.textContent = `Employer's Data Form - ${viewName}`;
  employerModal.hidden = false;
  employerForm.elements.employerNumber.focus();
};

const closeEditMode = () => {
  editingEmployerId = null;
  employerForm.querySelector('.edit-only-fields').hidden = true;
  employerForm.reset();
};

const openEditEmployerModal = (viewName) => {
  if (currentUser?.role !== 'Super Admin') return;
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  const selectedRows = [...view.querySelectorAll('tbody tr.is-selected[data-employer-id]')];
  if (selectedRows.length !== 1) return;

  const cells = [...selectedRows[0].cells].map((cell) => cell.textContent.trim());
  editingEmployerId = selectedRows[0].dataset.employerId;
  employerForm.elements.assignedView.value = viewName === 'MasterFile' ? '' : viewName;
  employerForm.elements.employerNumber.value = cells[0];
  employerForm.elements.employerName.value = cells[1];
  employerForm.elements.address.value = cells[2];
  employerForm.elements.employeeCount.value = cells[3];
  employerForm.elements.principal.value = cells[4];
  employerForm.elements.interest.value = cells[5];
  employerForm.elements.penalty.value = cells[6];
  employerForm.elements.totalAmount.value = cells[7];
  employerForm.elements.paymentPrincipal.value = cells[8];
  employerForm.elements.paymentInterest.value = cells[9];
  employerForm.elements.paymentPenalty.value = cells[10];
  employerForm.elements.paymentTotal.value = cells[11];
  employerForm.elements.billingDate.value = cells[12];
  employerForm.elements.soaDate.value = cells[13];
  employerForm.elements.soa2Date.value = cells[14];
  employerForm.elements.soa3Date.value = cells[15];
  employerForm.elements.coverageDate.value = cells[16];
  employerForm.elements.legalReferralDate.value = cells[17];
  employerForm.elements.demandLetterDate.value = cells[18];
  employerForm.elements.demandLetterReceivedDate.value = cells[19];
  employerForm.elements.handlingLawyer.value = cells[20];
  employerForm.elements.docketNumber.value = cells[21];
  employerForm.elements.caseDate.value = cells[22];
  employerForm.elements.status.value = cells[23];
  employerForm.querySelector('.edit-only-fields').hidden = false;
  modalTitle.textContent = `Edit Employer Data - ${viewName}`;
  employerModal.hidden = false;
  employerForm.elements.employerNumber.focus();
};

const closeEmployerModal = () => {
  employerModal.hidden = true;
  closeEditMode();
};

const syncEditDataButton = (view) => {
  const editDataButton = view.querySelector('.table-edit-data-btn');
  const selectedCount = view.querySelectorAll('tbody tr.is-selected[data-employer-id]').length;
  editDataButton.hidden = !(view.classList.contains('is-editing') && currentUser?.role === 'Super Admin' && selectedCount === 1);
};

const syncOfficerFormLayout = () => {
  const employerFormShell = document.querySelector('.employer-modal');
  const closeButton = employerFormShell.querySelector('.modal-close-btn');

  if (isOfficerRole(currentUser?.role)) {
    const officerViewName = currentUser.role.replace('Account Officer ', 'AO');
    officerFormMount.appendChild(employerFormShell);
    employerFormShell.classList.add('officer-form');
    employerForm.querySelector('.edit-only-fields').hidden = true;
    editingEmployerId = null;
    closeButton.hidden = true;
    modalTitle.id = 'officerFormTitle';
    employerForm.elements.assignedView.value = officerViewName;
    modalTitle.textContent = `Employer's Data Form - ${officerViewName}`;
    employerModal.hidden = true;
    employerForm.elements.employerNumber.focus();
    return;
  }

  employerModal.appendChild(employerFormShell);
  employerFormShell.classList.remove('officer-form');
  closeButton.hidden = false;
  modalTitle.id = 'employerFormTitle';
};

const openTableDashboard = (viewName) => {
  const metrics = getDashboardMetrics(getTableEmployers(viewName));
  tableDashboardTitle.textContent = `${viewName.toUpperCase()} DASHBOARD`;
  Object.entries(metrics).forEach(([name, value]) => {
    const metric = tableDashboardModal.querySelector(`[data-dashboard-metric="${name}"]`);
    metric.textContent = ['billed', 'settledAmount', 'unsettledAmount'].includes(name) ? formatPeso(value) : value;
  });
  tableDashboardModal.hidden = false;
  tableDashboardClose.focus();
};

const closeTableDashboard = () => {
  tableDashboardModal.hidden = true;
};

const openOrgChart = () => {
  orgChartModal.hidden = false;
  orgChartClose.focus();
};

const closeOrgChart = () => {
  orgChartModal.hidden = true;
};

navButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const selectedView = button.textContent.trim();
    if (selectedView !== 'DASHBOARD' && !selectedView.startsWith('AO') && selectedView !== 'MASTERFILE') return;
    const isDashboard = selectedView === 'DASHBOARD';
    const viewName = selectedView === 'MASTERFILE' ? 'MasterFile' : selectedView;

    navButtons.forEach((navButton) => navButton.classList.toggle('active', navButton === button));
    dashboardView.hidden = !isDashboard;
    mainNav.dataset.activeView = isDashboard ? 'DASHBOARD' : viewName;
    document.querySelector('.ao-views').classList.toggle('is-active', !isDashboard);
    aoViews.forEach((view) => {
      view.hidden = isDashboard || view.dataset.aoView !== viewName;
    });
  });
});

document.querySelectorAll('.add-record-btn').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openEmployerModal(button.dataset.formView);
  });
});

document.querySelectorAll('.dashboard-btn').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    openTableDashboard(button.dataset.dashboardView);
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

employerModal.addEventListener('click', (event) => {
  if (event.target === employerModal) closeEmployerModal();
});

tableDashboardModal.addEventListener('click', (event) => {
  if (event.target === tableDashboardModal) closeTableDashboard();
});

orgChartModal.addEventListener('click', (event) => {
  if (event.target === orgChartModal) closeOrgChart();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !employerModal.hidden) closeEmployerModal();
  if (event.key === 'Escape' && !tableDashboardModal.hidden) closeTableDashboard();
  if (event.key === 'Escape' && !orgChartModal.hidden) closeOrgChart();
  if (event.key === 'Escape' && !deleteConfirmModal.hidden) closeDeleteConfirmation();
});

const addEmployerToTable = (viewName, rowValues, employerId) => {
  const targetBody = document.querySelector(`[data-ao-view="${viewName}"] .ao-table tbody`);
  if (!targetBody) return false;

  let targetRow = targetBody.querySelector('tr:not(:has(td:not(:empty)))');

  if (!targetRow) {
    targetRow = document.createElement('tr');
    targetBody.appendChild(targetRow);
  }

  targetRow.replaceChildren(...rowValues.map((value, index) => {
    const cell = document.createElement('td');
    cell.textContent = amountFieldIndexes.has(index) ? formatPeso(value) : value || '';
    return cell;
  }));
  targetRow.dataset.employerId = String(employerId);

  return true;
};

const employerToRow = (employer) => employerFields.map((field) => employer[field] || '');

const setTableEditMode = (viewName, isEditing) => {
  const view = document.querySelector(`[data-ao-view="${viewName}"]`);
  if (!view) return;

  view.classList.toggle('is-editing', isEditing);
  view.querySelector('.table-edit-btn').textContent = isEditing ? 'Cancel edit' : 'Edit mode';
  view.querySelector('.table-delete-btn').hidden = !isEditing;
  syncEditDataButton(view);
  view.querySelectorAll('tbody tr').forEach((row) => row.classList.remove('is-selected'));
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
  closeDeleteConfirmation();
};

const loadEmployers = async () => {
  if (currentUser?.role !== 'Super Admin') return;

  const response = await fetch('/api/employers', {
    headers: { Authorization: `Bearer ${currentUser.accessToken}` },
  });
  if (!response.ok) throw new Error('Unable to load employers.');

  const employers = await response.json();
  employers.forEach((employer) => {
    addEmployerToTable(employer.assigned_view, employerToRow(employer), employer.id);
    addEmployerToTable('MasterFile', employerToRow(employer), employer.id);
  });
};

employerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(employerForm);
  const employer = {
    assigned_view: formData.get('assignedView'),
    employer_number: formData.get('employerNumber'),
    employer_name: formData.get('employerName'),
    address: formData.get('address'),
    principal: Number(formData.get('principal') || 0),
    penalty: Number(formData.get('penalty') || 0),
    interest: Number(formData.get('interest') || 0),
    total_amount: Number(formData.get('totalAmount') || 0),
    billing_date: formData.get('billingDate') || null,
    coverage_date: formData.get('coverageDate') || null,
    soa_date: formData.get('soaDate') || null,
    status: formData.get('status'),
  };

  if (editingEmployerId) {
    delete employer.assigned_view;
    Object.assign(employer, {
      employee_count: Number(formData.get('employeeCount') || 0),
      payment_principal: Number(formData.get('paymentPrincipal') || 0),
      payment_interest: Number(formData.get('paymentInterest') || 0),
      payment_penalty: Number(formData.get('paymentPenalty') || 0),
      payment_total: Number(formData.get('paymentTotal') || 0),
      soa2_date: formData.get('soa2Date') || null,
      soa3_date: formData.get('soa3Date') || null,
      legal_referral_date: formData.get('legalReferralDate') || null,
      demand_letter_date: formData.get('demandLetterDate') || null,
      demand_letter_received_date: formData.get('demandLetterReceivedDate') || null,
      handling_lawyer: formData.get('handlingLawyer') || null,
      docket_number: formData.get('docketNumber') || null,
      case_date: formData.get('caseDate') || null,
    });
  }

  let response;
  try {
    response = await fetch('/api/employers', {
      method: editingEmployerId ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(editingEmployerId && currentUser?.accessToken ? { Authorization: `Bearer ${currentUser.accessToken}` } : {}),
      },
      body: JSON.stringify(editingEmployerId ? { id: editingEmployerId, employer } : employer),
    });
  } catch (_error) {
    alert('Unable to connect to the server while saving employer data.');
    return;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    alert(error?.error || `Unable to save employer (HTTP ${response.status}).`);
    return;
  }

  const savedEmployer = await response.json();
  addEmployerToTable(savedEmployer.assigned_view, employerToRow(savedEmployer), savedEmployer.id);
  addEmployerToTable('MasterFile', employerToRow(savedEmployer), savedEmployer.id);
  refreshMainDashboard();
  closeEmployerModal();
});

document.querySelectorAll('.ao-table tbody').forEach((body) => {
  body.innerHTML = '<tr>'.concat('<td></td>'.repeat(24), '</tr>').repeat(21);
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
  button.addEventListener('click', () => openEditEmployerModal(button.dataset.tableEditData));
});

deleteConfirmApprove.addEventListener('click', deleteSelectedRows);
deleteConfirmCancel.addEventListener('click', closeDeleteConfirmation);
deleteConfirmClose.addEventListener('click', closeDeleteConfirmation);

document.addEventListener('click', (event) => {
  const row = event.target.closest('.ao-table tbody tr');
  if (!row || !row.closest('.ao-view.is-editing') || !row.dataset.employerId) return;
  row.classList.toggle('is-selected');
  syncEditDataButton(row.closest('.ao-view'));
});

loadEmployers().then(refreshMainDashboard).catch((error) => console.error(error));

document.addEventListener('click', (event) => {
  if (!event.target.closest('.ao-table') && !event.target.closest('.table-edit-btn')) {
    document.querySelectorAll('.ao-table tbody tr.is-selected').forEach((selectedRow) => {
      selectedRow.classList.remove('is-selected');
    });
    document.querySelectorAll('.ao-view.is-editing').forEach((view) => syncEditDataButton(view));
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
