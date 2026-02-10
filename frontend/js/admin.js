/**
 * ADMIN.JS
 * Central Logic for MCA Command Center
 */

const AppState = {
  users: []
};

const API = {
  async request(url, { method = 'GET', body = null, onForbidden = null } = {}) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      };
      if (body) options.body = JSON.stringify(body);

      const res = await fetch(url, options);
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (err) {
        data = raw;
      }

      if (res.status === 403) {
        alert('Access denied');
        if (onForbidden) onForbidden();
        return null;
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Request failed');
      }

      return data;
    } catch (err) {
      console.error(err);
      alert(err.message);
      return null;
    }
  },
  get(url, options) {
    return API.request(url, { ...options, method: 'GET' });
  },
  post(url, body, options) {
    return API.request(url, { ...options, method: 'POST', body });
  },
  put(url, body, options) {
    return API.request(url, { ...options, method: 'PUT', body });
  },
  delete(url, body, options) {
    return API.request(url, { ...options, method: 'DELETE', body });
  }
};

const Utils = {
  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  },
  formatDate(dateStr) {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return d.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  formatHours(h) {
    if (!h && h !== 0) return '?';
    const hours = parseFloat(h);
    if (hours < 1) return Math.round(hours * 60) + ' min';
    if (hours < 24) return Math.round(hours * 10) / 10 + ' hrs';
    return Math.round(hours / 24 * 10) / 10 + ' days';
  },
  markdownToHtml(md) {
    if (!md) return '';
    return md
      .replace(/### (.*)/g, '<h3>$1</h3>')
      .replace(/## (.*)/g, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^\d+\.\s+(.*)/gm, '<li>$1</li>')
      .replace(/^[-•]\s+(.*)/gm, '<li>$1</li>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }
};

const UserManager = {
  init() {
    this.cache();
    this.bind();
    this.load();
  },
  cache() {
    this.usersTableBody = document.getElementById('usersTableBody');
    this.userCount = document.getElementById('userCount');
    this.addUserBtn = document.getElementById('addUserBtn');
    this.userModal = document.getElementById('userModal');
    this.passwordModal = document.getElementById('passwordModal');
    this.formError = document.getElementById('formError');
    this.passwordFormError = document.getElementById('passwordFormError');
  },
  bind() {
    if (this.addUserBtn) {
      this.addUserBtn.addEventListener('click', () => this.openAddModal());
    }

    const modalSave = document.getElementById('modalSave');
    if (modalSave) modalSave.addEventListener('click', () => this.saveUser());

    const passwordSave = document.getElementById('passwordModalSave');
    if (passwordSave) passwordSave.addEventListener('click', () => this.savePassword());

    if (this.usersTableBody) {
      this.usersTableBody.addEventListener('click', (e) => this.handleTableAction(e));
    }

    const modalCancel = document.getElementById('modalCancel');
    if (modalCancel) modalCancel.addEventListener('click', () => this.userModal.classList.remove('show'));

    const modalClose = document.getElementById('modalClose');
    if (modalClose) modalClose.addEventListener('click', () => this.userModal.classList.remove('show'));

    const passwordCancel = document.getElementById('passwordModalCancel');
    if (passwordCancel) passwordCancel.addEventListener('click', () => this.passwordModal.classList.remove('show'));

    const passwordClose = document.getElementById('passwordModalClose');
    if (passwordClose) passwordClose.addEventListener('click', () => this.passwordModal.classList.remove('show'));

    const testDriveBtn = document.getElementById('btn-test-drive');
    if (testDriveBtn) testDriveBtn.addEventListener('click', () => this.testDriveConnection());
  },
  async load() {
    const data = await API.get('/api/users', {
      onForbidden: () => { window.location.href = '/command-center.html'; }
    });
    if (!data) return;
    AppState.users = data.users || [];
    this.render(AppState.users);
  },
  render(users) {
    this.userCount.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`;

    if (users.length === 0) {
      this.usersTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No users found</td></tr>';
      return;
    }

    this.usersTableBody.innerHTML = users.map(user => `
      <tr data-id="${user.id}">
        <td><strong>${Utils.escapeHtml(user.name)}</strong></td>
        <td>${Utils.escapeHtml(user.email)}</td>
        <td>${Utils.escapeHtml(user.username || '-')}</td>
        <td><span class="badge badge-${user.role}">${user.role}</span></td>
        <td><span class="badge badge-${user.is_active ? 'active' : 'inactive'}">${user.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>${user.last_login ? Utils.formatDate(user.last_login) : 'Never'}</td>
        <td class="actions">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${user.id}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-secondary btn-sm" data-action="reset" data-id="${user.id}"><i class="fas fa-key"></i></button>
          <button class="btn btn-danger btn-sm" data-action="toggle" data-id="${user.id}" data-active="${user.is_active}" ${user.role === 'admin' ? 'disabled' : ''}>
            <i class="fas fa-${user.is_active ? 'ban' : 'check'}"></i>
          </button>
        </td>
      </tr>
    `).join('');
  },
  handleTableAction(e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit') return this.openEditModal(id);
    if (action === 'reset') return this.openResetModal(id);
    if (action === 'toggle') return this.toggleUser(id, btn.dataset.active === 'true');
  },
  openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add User';
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('passwordGroup').style.display = 'block';
    document.getElementById('userPassword').required = true;
    this.formError.classList.add('hidden');

    const serviceSection = document.getElementById('serviceSettingsSection');
    serviceSection.classList.add('hidden');

    this.userModal.classList.add('show');
  },
  async openEditModal(id) {
    const user = AppState.users.find(u => u.id === id);
    if (!user) return;

    document.getElementById('modalTitle').textContent = 'Edit User';
    document.getElementById('userId').value = user.id;
    document.getElementById('userName').value = user.name;
    document.getElementById('userEmail').value = user.email;
    document.getElementById('userUsername').value = user.username || '';
    document.getElementById('userRole').value = user.role;
    document.getElementById('userAgentName').value = user.agent_name || '';
    document.getElementById('passwordGroup').style.display = 'none';
    document.getElementById('userPassword').required = false;
    this.formError.classList.add('hidden');

    const serviceSection = document.getElementById('serviceSettingsSection');
    serviceSection.classList.remove('hidden');

    const settings = await API.get(`/api/users/${id}/settings`);
    if (settings) {
      document.getElementById('userDriveFolderId').value = settings.drive_folder_id || '';
      document.getElementById('userCampaignHook').value = settings.campaign_hook || '';
      document.getElementById('svc_aiAgent').checked = settings.services?.aiAgent !== false;
      document.getElementById('svc_driveSync').checked = settings.services?.driveSync !== false;
      document.getElementById('svc_fcs').checked = settings.services?.fcs !== false;
      document.getElementById('svc_commander').checked = settings.services?.commander !== false;
      document.getElementById('svc_lenderMatcher').checked = settings.services?.lenderMatcher !== false;
      document.getElementById('svc_successPredictor').checked = settings.services?.successPredictor !== false;
    }

    this.userModal.classList.add('show');
  },
  async saveUser() {
    const id = document.getElementById('userId').value;
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const username = document.getElementById('userUsername').value.trim();
    const role = document.getElementById('userRole').value;
    const password = document.getElementById('userPassword').value;

    this.formError.classList.add('hidden');

    const agent_name = document.getElementById('userAgentName').value.trim();
    const body = { name, email, username, role, agent_name };
    if (!id) body.password = password;

    const result = await API.request(id ? `/api/users/${id}` : '/api/users', {
      method: id ? 'PUT' : 'POST',
      body
    });

    if (!result) {
      this.formError.textContent = 'Failed to save user';
      this.formError.classList.remove('hidden');
      return;
    }

    if (id) {
      const serviceSettings = {
        campaign_hook: document.getElementById('userCampaignHook').value.trim() || null,
        drive_folder_id: document.getElementById('userDriveFolderId').value.trim() || null,
        services: {
          aiAgent: document.getElementById('svc_aiAgent').checked,
          driveSync: document.getElementById('svc_driveSync').checked,
          fcs: document.getElementById('svc_fcs').checked,
          commander: document.getElementById('svc_commander').checked,
          lenderMatcher: document.getElementById('svc_lenderMatcher').checked,
          successPredictor: document.getElementById('svc_successPredictor').checked
        }
      };

      await API.put(`/api/users/${id}/settings`, serviceSettings);
    }

    this.userModal.classList.remove('show');
    this.load();
  },
  openResetModal(id) {
    const user = AppState.users.find(u => u.id === id);
    if (!user) return;

    document.getElementById('passwordUserId').value = user.id;
    document.getElementById('passwordUserName').textContent = user.name;
    document.getElementById('newPassword').value = '';
    this.passwordFormError.classList.add('hidden');
    this.passwordModal.classList.add('show');
  },
  async savePassword() {
    const id = document.getElementById('passwordUserId').value;
    const password = document.getElementById('newPassword').value;

    this.passwordFormError.classList.add('hidden');

    const result = await API.put(`/api/users/${id}/password`, { password });
    if (!result) {
      this.passwordFormError.textContent = 'Failed to reset password';
      this.passwordFormError.classList.remove('hidden');
      return;
    }

    this.passwordModal.classList.remove('show');
    alert('Password updated successfully');
  },
  async toggleUser(id, currentlyActive) {
    if (!confirm(`Are you sure you want to ${currentlyActive ? 'deactivate' : 'activate'} this user?`)) return;

    const result = await API.put(`/api/users/${id}`, { is_active: !currentlyActive });
    if (!result) return;

    this.load();
  },
  async testDriveConnection() {
    const userId = document.getElementById('userId').value;
    const resultDiv = document.getElementById('driveTestResult');

    if (!userId) {
      resultDiv.innerHTML = '<span class="text-danger"><i class="fas fa-times-circle"></i> Save the user first.</span>';
      return;
    }

    resultDiv.innerHTML = '<span class="text-muted"><i class="fas fa-spinner fa-spin"></i> Testing...</span>';

    const data = await API.post(`/api/users/test-drive/${userId}`);
    if (!data) return;

    if (data.success) {
      resultDiv.innerHTML = `
        <span class="text-success">
          <i class="fas fa-check-circle"></i> ${data.message}
        </span>
        ${data.sampleFolders?.length ? `<br><span class="text-muted text-xs">Sample: ${data.sampleFolders.join(', ')}</span>` : ''}
      `;
    } else {
      resultDiv.innerHTML = `<span class="text-danger"><i class="fas fa-times-circle"></i> ${data.error}</span>`;
    }
  }
};

const RulesManager = {
  init() {
    this.bind();
  },
  bind() {
    const rulesModal = document.getElementById('rulesModal');
    const manualRuleModal = document.getElementById('manualRuleModal');
    const refreshRulesBtn = document.getElementById('btn-refresh-rules');
    const refreshNeedsBtn = document.getElementById('btn-refresh-needs-review');
    const manualRuleCancel = document.getElementById('manualRuleCancel');
    const manualRuleSave = document.getElementById('saveManualRuleBtn');

    if (rulesModal) {
      rulesModal.addEventListener('click', (e) => { if (e.target.id === 'rulesModal') this.closeRulesModal(); });
    }
    if (manualRuleModal) {
      manualRuleModal.addEventListener('click', (e) => { if (e.target.id === 'manualRuleModal') this.closeManualRuleModal(); });
    }
    if (refreshRulesBtn) refreshRulesBtn.addEventListener('click', () => this.loadRuleSuggestions());
    if (refreshNeedsBtn) refreshNeedsBtn.addEventListener('click', () => this.loadNeedsReview());
    if (manualRuleCancel) manualRuleCancel.addEventListener('click', () => this.closeManualRuleModal());
    if (manualRuleSave) manualRuleSave.addEventListener('click', () => this.saveManualRule());
  },
  openRulesModal() {
    document.getElementById('rulesModal').classList.add('show');
    this.loadRuleSuggestions();
    this.loadNeedsReview();
  },
  closeRulesModal() {
    document.getElementById('rulesModal').classList.remove('show');
  },
  async loadRuleSuggestions() {
    const container = document.getElementById('ruleSuggestionsList');
    container.innerHTML = '<div class="p-20 text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    const rules = await API.get('/api/lenders/rule-suggestions');
    if (!rules) return;

    if (rules.length === 0) {
      container.innerHTML = '<div class="p-20 text-center text-muted">✓ No pending suggestions</div>';
      return;
    }

    container.innerHTML = rules.map(r => `
      <div class="rule-card">
        <div class="rule-info">
          <div class="rule-lender">${Utils.escapeHtml(r.lender_name)}</div>
          <div class="rule-message">${Utils.escapeHtml(r.decline_message || 'No description')}</div>
          <div class="rule-meta">
            <span>${Utils.escapeHtml((r.rule_type || '').replace('_', ' '))}</span>
            ${r.industry ? `<span>Industry: ${Utils.escapeHtml(r.industry)}</span>` : ''}
            ${r.state ? `<span>State: ${Utils.escapeHtml(r.state)}</span>` : ''}
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn-approve" data-action="approve" data-id="${r.id}">
            <i class="fas fa-check"></i> Approve
          </button>
          <button class="btn-reject" data-action="reject" data-id="${r.id}">
            <i class="fas fa-times"></i> Reject
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'approve') this.approveRule(id);
        if (action === 'reject') this.rejectRule(id);
      });
    });
  },
  async loadNeedsReview() {
    const container = document.getElementById('needsReviewList');
    container.innerHTML = '<div class="p-20 text-center text-muted"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    const declines = await API.get('/api/lenders/needs-review');
    if (!declines) return;

    if (declines.length === 0) {
      container.innerHTML = '<div class="p-20 text-center text-muted">✓ Nothing needs review</div>';
      return;
    }

    container.innerHTML = declines.map(d => `
      <div class="rule-card">
        <div class="rule-info">
          <div class="rule-lender">${Utils.escapeHtml(d.lender_name)} → ${Utils.escapeHtml(d.business_name || 'Unknown')}</div>
          <div class="rule-message">${Utils.escapeHtml(d.decline_reason || 'No reason provided')}</div>
          <div class="rule-meta">
            ${d.industry ? `<span>Industry: ${Utils.escapeHtml(d.industry)}</span>` : ''}
            ${d.us_state ? `<span>State: ${Utils.escapeHtml(d.us_state)}</span>` : ''}
          </div>
        </div>
        <div class="rule-actions">
          <button class="btn-create-rule" data-action="create" data-id="${d.id}" data-lender="${encodeURIComponent(d.lender_name || '')}" data-reason="${encodeURIComponent(d.decline_reason || '')}" data-industry="${encodeURIComponent(d.industry || '')}" data-state="${encodeURIComponent(d.us_state || '')}">
            <i class="fas fa-plus"></i> Create Rule
          </button>
          <button class="btn-dismiss" data-action="dismiss" data-id="${d.id}">
            <i class="fas fa-eye-slash"></i> Dismiss
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'create') {
          this.openManualRuleModal(id, btn.dataset.lender, btn.dataset.reason, btn.dataset.industry, btn.dataset.state);
        }
        if (action === 'dismiss') this.dismissDecline(id);
      });
    });
  },
  async approveRule(ruleId) {
    if (!confirm('Approve this rule? It will be applied to future submissions.')) return;
    const result = await API.post(`/api/lenders/rule-suggestions/${ruleId}/approve`);
    if (!result) return;
    this.loadRuleSuggestions();
  },
  async rejectRule(ruleId) {
    if (!confirm('Reject this rule? It will be deleted.')) return;
    const result = await API.post(`/api/lenders/rule-suggestions/${ruleId}/reject`);
    if (!result) return;
    this.loadRuleSuggestions();
  },
  openManualRuleModal(submissionId, lenderName, declineReason, industry, state) {
    const decodedName = decodeURIComponent(lenderName || '');
    const decodedReason = decodeURIComponent(declineReason || '');
    const decodedIndustry = decodeURIComponent(industry || '');
    const decodedState = decodeURIComponent(state || '');

    this.currentManualRuleData = { submissionId, lenderName: decodedName };

    document.getElementById('manualRuleSubmissionId').value = submissionId;
    document.getElementById('manualRuleContext').textContent = `${decodedName}: ${decodedReason || 'No reason provided'}`;
    document.getElementById('manualRuleIndustry').value = decodedIndustry || '';
    document.getElementById('manualRuleState').value = decodedState || '';
    document.getElementById('manualRuleType').value = '';
    document.getElementById('manualRuleField').value = '';
    document.getElementById('manualRuleOperator').value = 'min';
    document.getElementById('manualRuleValue').value = '';
    document.getElementById('manualRuleMessage').value = '';
    document.getElementById('manualRuleError').classList.add('hidden');

    document.getElementById('manualRuleModal').classList.add('show');
  },
  closeManualRuleModal() {
    document.getElementById('manualRuleModal').classList.remove('show');
  },
  async saveManualRule() {
    const ruleType = document.getElementById('manualRuleType').value;
    const message = document.getElementById('manualRuleMessage').value.trim();
    const errorDiv = document.getElementById('manualRuleError');

    if (!ruleType || !message) {
      errorDiv.textContent = 'Please select a rule type and enter a description';
      errorDiv.classList.remove('hidden');
      return;
    }

    const btn = document.getElementById('saveManualRuleBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const data = {
      lender_name: this.currentManualRuleData.lenderName,
      rule_type: ruleType,
      industry: document.getElementById('manualRuleIndustry').value.trim() || null,
      state: document.getElementById('manualRuleState').value.trim().toUpperCase() || null,
      condition_field: document.getElementById('manualRuleField').value || null,
      condition_operator: document.getElementById('manualRuleOperator').value || null,
      condition_value: document.getElementById('manualRuleValue').value || null,
      decline_message: message,
      submission_id: this.currentManualRuleData.submissionId
    };

    const result = await API.post('/api/lenders/rules/manual', data);
    if (!result) {
      errorDiv.textContent = 'Failed to save rule';
      errorDiv.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Save Rule';
      return;
    }

    this.closeManualRuleModal();
    this.loadNeedsReview();
    this.loadRuleSuggestions();
    alert('Rule created successfully!');

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Rule';
  },
  async dismissDecline(submissionId) {
    if (!confirm('Dismiss this decline? It won\'t show up for review again.')) return;
    const result = await API.post(`/api/lenders/decline/${submissionId}/dismiss`);
    if (!result) return;
    this.loadNeedsReview();
  }
};

const TrainingManager = {
  init() {
    const trainingModal = document.getElementById('trainingModal');
    if (trainingModal) {
      trainingModal.addEventListener('click', (e) => { if (e.target.id === 'trainingModal') this.closeTrainingModal(); });
    }
  },
  async openTrainingModal() {
    document.getElementById('trainingModal').classList.add('show');
    await this.loadPendingPatterns();
    await this.loadCurrentPatterns();
  },
  closeTrainingModal() {
    document.getElementById('trainingModal').classList.remove('show');
  },
  async loadPendingPatterns() {
    const container = document.getElementById('pendingPatterns');
    container.innerHTML = '<div class="text-muted">Loading...</div>';

    const data = await API.get('/api/usage/learned-patterns');
    if (!data) return;

    if (!data.patterns || data.patterns.length === 0) {
      container.innerHTML = '<div class="text-muted">No patterns yet. Keep training!</div>';
      return;
    }

    container.innerHTML = data.patterns.map(p => `
      <div class="analytics-card" style="border: 1px solid #30363d; margin-bottom: 10px;">
        <div class="text-muted" style="font-size: 11px; margin-bottom: 8px;">Lead said (${p.times}x):</div>
        <div style="color: #e6edf3; margin-bottom: 10px;">"${p.lead_message?.substring(0, 100) || 'N/A'}"</div>
        <div class="text-muted" style="font-size: 11px; margin-bottom: 8px;">You responded:</div>
        <div style="color: #3fb950; margin-bottom: 15px;">"${p.human_response?.substring(0, 100) || 'N/A'}"</div>
        <button class="btn-approve" data-action="approve" data-lead="${encodeURIComponent(p.lead_message)}" data-response="${encodeURIComponent(p.human_response)}">
          ✓ Approve
        </button>
        <button class="btn-dismiss" data-action="ignore">Ignore</button>
      </div>
    `).join('');

    container.querySelectorAll('button[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'approve') this.approvePattern(btn.dataset.lead, btn.dataset.response);
        if (action === 'ignore') btn.closest('div').remove();
      });
    });
  },
  async loadCurrentPatterns() {
    const container = document.getElementById('currentPatterns');
    const data = await API.get('/api/usage/current-patterns');
    if (!data) return;
    container.textContent = data.content || 'No learned patterns yet';
  },
  async approvePattern(leadMessage, humanResponse) {
    const result = await API.post('/api/usage/approve-pattern', {
      leadMessage: decodeURIComponent(leadMessage),
      humanResponse: decodeURIComponent(humanResponse)
    });
    if (!result) return;
    await this.loadPendingPatterns();
    await this.loadCurrentPatterns();
  }
};

const ReportsManager = {
  init() {
    this.reportModal = document.getElementById('dailyReportsModal');
    if (this.reportModal) {
      this.reportModal.addEventListener('click', (e) => { if (e.target.id === 'dailyReportsModal') this.closeDailyReports(); });
    }
  },
  openDailyReports() {
    document.getElementById('dailyReportsModal').classList.add('show');
    document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('briefingDate').value = new Date().toLocaleDateString('en-CA');
    const today = new Date();
    const weekAgo = new Date(today - 7 * 24 * 60 * 60 * 1000);
    document.getElementById('analyticsEnd').value = today.toISOString().split('T')[0];
    document.getElementById('analyticsStart').value = weekAgo.toISOString().split('T')[0];
    this.loadReportHistory();
  },
  closeDailyReports() {
    document.getElementById('dailyReportsModal').classList.remove('show');
  },
  async loadReportHistory() {
    const data = await API.get('/api/daily-reports');
    if (!data) return;
    const container = document.getElementById('reportHistory');
    if (data.success && data.reports.length > 0) {
      container.innerHTML = data.reports.map(r => {
        const d = new Date(r.date + 'T12:00:00');
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `<button class="report-date-chip" data-date="${r.date}">${label}</button>`;
      }).join('');
      container.querySelectorAll('button[data-date]').forEach(btn => {
        btn.addEventListener('click', () => this.loadReportByDate(btn.dataset.date));
      });
    } else {
      container.innerHTML = '<span class="text-muted text-xs">No reports yet</span>';
    }
  },
  async loadReport() {
    const date = document.getElementById('reportDate').value;
    if (!date) return;
    await this.loadReportByDate(date);
  },
  async loadReportByDate(date) {
    document.getElementById('reportDate').value = date;
    const statusEl = document.getElementById('reportStatus');
    const contentEl = document.getElementById('reportContent');
    const statsBar = document.getElementById('reportStatsBar');
    statusEl.textContent = 'Loading...';
    contentEl.innerHTML = '<div class="text-center text-muted p-40"><i class="fas fa-spinner fa-spin"></i> Loading report...</div>';

    const data = await API.get(`/api/daily-reports/${date}`);
    if (!data) return;

    if (data.success && data.report) {
      const report = data.report;
      if (report.stats) {
        const s = typeof report.stats === 'string' ? JSON.parse(report.stats) : report.stats;
        const o = s.overview || {};
        document.getElementById('statNewLeads').textContent = o.new_leads || 0;
        document.getElementById('statMsgsSent').textContent = o.msgs_sent || 0;
        document.getElementById('statMsgsRecv').textContent = o.msgs_received || 0;
        document.getElementById('statSubmissions').textContent = o.submissions_sent || 0;
        document.getElementById('statOffers').textContent = o.offers_received || 0;
        document.getElementById('statDeclines').textContent = o.declines_received || 0;
        document.getElementById('statActive').textContent = o.active_leads || 0;
        statsBar.classList.remove('hidden');
      }
      contentEl.innerHTML = '<div class="report-body">' + Utils.markdownToHtml(report.report) + '</div>';
      statusEl.textContent = 'Generated ' + new Date(report.created_at).toLocaleString();
    } else {
      statsBar.classList.add('hidden');
      contentEl.innerHTML = '<div class="text-center text-muted p-40">No report for this date. Click <strong>Generate</strong> to create one.</div>';
      statusEl.textContent = '';
    }
  },
  async generateReport() {
    const date = document.getElementById('reportDate').value;
    if (!date) return;
    const statusEl = document.getElementById('reportStatus');
    const contentEl = document.getElementById('reportContent');
    statusEl.textContent = 'Generating...';
    contentEl.innerHTML = '<div class="text-center text-muted p-40"><i class="fas fa-spinner fa-spin"></i> Generating report... this may take 30-60 seconds.</div>';

    const data = await API.post('/api/daily-reports/generate', { date });
    if (!data) return;

    if (data.success) {
      statusEl.textContent = 'Generating... polling for results';
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const result = await API.get(`/api/daily-reports/${date}`);
        if (result && result.success && result.report) {
          clearInterval(poll);
          await this.loadReportByDate(date);
          this.loadReportHistory();
        } else if (attempts > 24) {
          clearInterval(poll);
          statusEl.textContent = 'Timed out - check back in a minute';
        }
      }, 5000);
    }
  },
  switchReportTab(tab, btn) {
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tabDaily').classList.toggle('hidden', tab !== 'daily');
    document.getElementById('tabBriefing').classList.toggle('hidden', tab !== 'briefing');
    document.getElementById('tabAnalytics').classList.toggle('hidden', tab !== 'analytics');

    if (tab === 'briefing' || tab === 'analytics') {
      this.populateBrokerDropdowns();
    }
  },
  populateBrokerDropdowns() {
    const brokers = AppState.users.filter(u => u.role !== 'admin' && u.is_active);
    ['briefingBroker', 'analyticsBroker'].forEach(id => {
      const sel = document.getElementById(id);
      const current = sel.value;
      sel.innerHTML = '<option value="">Select broker...</option>' +
        brokers.map(b => `<option value="${b.id}" ${b.id === current ? 'selected' : ''}>${Utils.escapeHtml(b.agent_name || b.name)}</option>`).join('');
    });
  },
  async loadRawBriefing() {
    const userId = document.getElementById('briefingBroker').value;
    if (!userId) return alert('Select a broker first');
    const mode = document.getElementById('briefingMode').value;
    const dateVal = mode === 'date' ? document.getElementById('briefingDate').value : null;
    const params = dateVal ? `?date=${dateVal}` : '';
    const url = `/api/admin/broker-briefing/${userId}/raw${params}`;

    const statusEl = document.getElementById('briefingStatus');
    const contentEl = document.getElementById('briefingContent');
    statusEl.textContent = 'Loading...';
    contentEl.innerHTML = '<div class="text-center text-muted p-40"><i class="fas fa-spinner fa-spin"></i> Loading data...</div>';

    const data = await API.get(url);
    if (!data) return;

    contentEl.innerHTML = this.renderRawBriefing(data);
    statusEl.textContent = 'Data loaded (no AI narrative)';
  },
  async generateBriefing() {
    const userId = document.getElementById('briefingBroker').value;
    if (!userId) return alert('Select a broker first');
    const mode = document.getElementById('briefingMode').value;
    const dateVal = mode === 'date' ? document.getElementById('briefingDate').value : null;
    const params = dateVal ? `?date=${dateVal}` : '';
    const url = `/api/admin/broker-briefing/${userId}${params}`;

    const statusEl = document.getElementById('briefingStatus');
    const contentEl = document.getElementById('briefingContent');
    statusEl.textContent = 'Generating with AI...';
    contentEl.innerHTML = '<div class="text-center text-muted p-40"><i class="fas fa-spinner fa-spin"></i> Generating briefing... this may take 30-60 seconds.</div>';

    const result = await API.get(url);
    if (!result) return;

    let html = '';
    if (result.data) html += this.renderRawBriefing(result.data);
    if (result.narrative) html += '<div class="report-body" style="border-top: 1px solid #30363d; margin-top: 20px; padding-top: 20px;"><h3 class="text-blue" style="margin-bottom: 12px;">🤖 AI Briefing</h3><div class="report-body">' + Utils.markdownToHtml(result.narrative) + '</div></div>';

    contentEl.innerHTML = html;
    statusEl.textContent = 'Generated ' + new Date().toLocaleTimeString();
  },
  renderRawBriefing(data) {
    let html = '';

    const ta = data.todayActivity || {};
    html += `<div class="analytics-grid" style="margin-bottom: 16px;">
      <div class="analytics-card"><div class="analytics-card-num">${ta.msgs_sent || 0}</div><div class="analytics-card-label">Sent Today</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${ta.msgs_received || 0}</div><div class="analytics-card-label">Received Today</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${ta.leads_touched || 0}</div><div class="analytics-card-label">Leads Touched</div></div>
      <div class="analytics-card"><div class="analytics-card-num text-danger">${(data.unanswered || []).length}</div><div class="analytics-card-label">Unanswered</div></div>
      <div class="analytics-card"><div class="analytics-card-num text-warning">${(data.cold || []).length}</div><div class="analytics-card-label">Cold Leads</div></div>
      <div class="analytics-card"><div class="analytics-card-num text-success">${(data.pendingOffers || []).length}</div><div class="analytics-card-label">Pending Offers</div></div>
    </div>`;

    html += this.renderUrgencySection('🔴 Respond NOW', 'red', data.unanswered, item =>
      `<div class="urgency-item"><span class="lead-name">${Utils.escapeHtml(item.business_name || 'Unknown')}</span> — waiting <strong>${Utils.formatHours(item.hours_waiting)}</strong><br><span class="lead-meta">State: ${item.state} | Phone: ${item.phone || 'N/A'}</span></div>`
    );

    html += this.renderUrgencySection('🟢 Close the Deal', 'green', data.pendingOffers, item =>
      `<div class="urgency-item"><span class="lead-name">${Utils.escapeHtml(item.business_name || 'Unknown')}</span> — <strong>${Utils.escapeHtml(item.lender_name)}</strong> offered <strong>$${Number(item.offer_amount || 0).toLocaleString()}</strong><br><span class="lead-meta">${Utils.formatHours(item.hours_since_offer)} ago | State: ${item.state}</span></div>`
    );

    const followUps = [
      ...(data.stale || []).map(s => ({ ...s, reason: `stuck in ${s.state} for ${Math.round(s.days_in_state)}d` })),
      ...(data.cold || []).map(c => ({ ...c, reason: `no activity for ${Math.round(c.days_silent)}d` }))
    ];
    html += this.renderUrgencySection('🟡 Follow Up Today', 'yellow', followUps, item =>
      `<div class="urgency-item"><span class="lead-name">${Utils.escapeHtml(item.business_name || 'Unknown')}</span> — ${item.reason}<br><span class="lead-meta">State: ${item.state}</span></div>`
    );

    html += this.renderUrgencySection('📄 Docs Needed', 'blue', data.pendingDocs, item =>
      `<div class="urgency-item"><span class="lead-name">${Utils.escapeHtml(item.business_name || 'Unknown')}</span><br><span class="lead-meta">State: ${item.state} — No FCS generated yet</span></div>`
    );

    if (data.pipeline && data.pipeline.length) {
      html += `<div style="margin-top: 16px;"><h4 class="section-header">Pipeline</h4><div class="analytics-grid">`;
      data.pipeline.forEach(p => {
        html += `<div class="analytics-card"><div class="analytics-card-num">${p.count}</div><div class="analytics-card-label">${p.state}</div></div>`;
      });
      html += `</div></div>`;
    }

    return html;
  },
  renderUrgencySection(title, color, items, renderItem) {
    const count = (items || []).length;
    let html = `<div class="urgency-section"><div class="urgency-header ${color}">${title} <span style="opacity: 0.7;">(${count})</span></div>`;
    if (count === 0) {
      html += `<div class="urgency-body text-muted text-sm">None — you're good here ✓</div>`;
    } else {
      html += `<div class="urgency-body">${items.map(renderItem).join('')}</div>`;
    }
    html += `</div>`;
    return html;
  },
  async generateAnalytics() {
    const userId = document.getElementById('analyticsBroker').value;
    const start = document.getElementById('analyticsStart').value;
    const end = document.getElementById('analyticsEnd').value;

    if (!userId) return alert('Select a broker');
    if (!start || !end) return alert('Select a date range');
    if (start > end) return alert('Start date must be before end date');

    const statusEl = document.getElementById('analyticsStatus');
    const contentEl = document.getElementById('analyticsContent');
    statusEl.textContent = 'Analyzing with AI...';
    contentEl.innerHTML = '<div class="text-center text-muted p-40"><i class="fas fa-spinner fa-spin"></i> Generating analytics... this may take 30-60 seconds.</div>';

    const result = await API.get(`/api/admin/broker-analytics/${userId}?start=${start}&end=${end}`);
    if (!result) return;

    let html = '';
    if (result.data) html += this.renderOwnerAnalytics(result.data);
    if (result.narrative) html += '<div class="report-body" style="border-top: 1px solid #30363d; margin-top: 20px; padding-top: 20px;"><h3 class="text-blue" style="margin-bottom: 12px;">🤖 AI Analysis</h3><div class="report-body">' + Utils.markdownToHtml(result.narrative) + '</div></div>';

    contentEl.innerHTML = html;
    statusEl.textContent = 'Generated ' + new Date().toLocaleTimeString();
  },
  renderOwnerAnalytics(data) {
    let html = '';

    const v = data.volume || {};
    const rt = data.responseTime || {};
    const s = data.submissions || {};
    const ai = data.aiRatio || {};

    html += `<div class="analytics-grid">
      <div class="analytics-card"><div class="analytics-card-num">${v.msgs_sent || 0}</div><div class="analytics-card-label">Msgs Sent</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${v.leads_worked || 0}</div><div class="analytics-card-label">Leads Worked</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${v.leads_engaged || 0}</div><div class="analytics-card-label">Leads Engaged</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${rt.avg_response_minutes ? Math.round(rt.avg_response_minutes) + 'm' : 'N/A'}</div><div class="analytics-card-label">Avg Response</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${s.total_submitted || 0}</div><div class="analytics-card-label">Submissions</div></div>
      <div class="analytics-card"><div class="analytics-card-num text-success">${s.offer_rate_pct || 0}%</div><div class="analytics-card-label">Offer Rate</div></div>
      <div class="analytics-card"><div class="analytics-card-num text-success">$${Number(s.total_funded_amount || 0).toLocaleString()}</div><div class="analytics-card-label">Funded</div></div>
      <div class="analytics-card"><div class="analytics-card-num">${ai.ai_sent || 0}/${ai.human_sent || 0}</div><div class="analytics-card-label">AI / Human Msgs</div></div>
    </div>`;

    if (rt.responses_measured) {
      const pctUnder = Math.round((rt.under_1hr / rt.responses_measured) * 100);
      html += `<div class="analytics-card" style="text-align: left; margin-bottom: 16px;">
        <div class="text-xs text-muted text-uppercase mb-10">Response Time</div>
        <div class="flex gap-20 text-sm" style="color: #c9d1d9;">
          <span>Median: <strong>${Math.round(rt.median_response_minutes || 0)} min</strong></span>
          <span>Under 1hr: <strong style="color: ${pctUnder >= 70 ? '#2ea043' : '#f85149'};">${pctUnder}%</strong> (${rt.under_1hr}/${rt.responses_measured})</span>
        </div>
      </div>`;
    }

    if (data.funnel && data.funnel.length) {
      html += `<div class="analytics-card" style="text-align: left; margin-bottom: 16px;">
        <div class="text-xs text-muted text-uppercase mb-10">State Transitions</div>`;
      data.funnel.slice(0, 10).forEach(f => {
        html += `<div class="flex-between" style="padding: 4px 0; font-size: 13px; color: #c9d1d9; border-bottom: 1px solid #21262d;">
          <span>${Utils.escapeHtml(f.transition)}</span><strong>${f.count}</strong></div>`;
      });
      html += `</div>`;
    }

    if (data.declineReasons && data.declineReasons.length) {
      html += `<div class="analytics-card" style="text-align: left; margin-bottom: 16px;">
        <div class="text-xs text-muted text-uppercase mb-10">Decline Reasons</div>`;
      data.declineReasons.forEach(d => {
        html += `<div class="flex-between" style="padding: 4px 0; font-size: 13px; color: #f85149; border-bottom: 1px solid #21262d;">
          <span>${Utils.escapeHtml(d.decline_reason)}</span><strong>${d.count}</strong></div>`;
      });
      html += `</div>`;
    }

    if (data.activeHours && data.activeHours.length) {
      const maxCount = Math.max(...data.activeHours.map(h => parseInt(h.msg_count)));
      html += `<div class="analytics-card" style="text-align: left; margin-bottom: 16px;">
        <div class="text-xs text-muted text-uppercase mb-10">Active Hours (ET)</div>
        <div class="flex" style="align-items: flex-end; gap: 3px; height: 60px;">`;
      for (let h = 7; h <= 21; h++) {
        const found = data.activeHours.find(a => parseInt(a.hour_et) === h);
        const count = found ? parseInt(found.msg_count) : 0;
        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        const label = h <= 12 ? h + (h === 12 ? 'p' : 'a') : (h - 12) + 'p';
        html += `<div style="flex:1; display: flex; flex-direction: column; align-items: center;">
          <div style="width: 100%; background: ${pct > 0 ? '#58a6ff' : '#21262d'}; height: ${Math.max(pct, 4)}%; border-radius: 2px; min-height: 2px;" title="${count} msgs at ${label}"></div>
          <span style="font-size: 9px; color: #6b7280; margin-top: 4px;">${label}</span>
        </div>`;
      }
      html += `</div></div>`;
    }

    const ta = data.teamAvg || {};
    if (ta.avg_msgs_sent) {
      html += `<div class="analytics-card" style="text-align: left; margin-bottom: 16px;">
        <div class="text-xs text-muted text-uppercase mb-10">vs Team Average</div>
        <div class="flex gap-20 text-sm" style="color: #c9d1d9;">
          <span>Msgs: <strong>${v.msgs_sent || 0}</strong> vs avg <strong>${Math.round(ta.avg_msgs_sent)}</strong></span>
          <span>Leads: <strong>${v.leads_worked || 0}</strong> vs avg <strong>${Math.round(ta.avg_leads_worked)}</strong></span>
        </div>
      </div>`;
    }

    if (data.pipeline && data.pipeline.length) {
      html += `<div style="margin-top: 16px;"><h4 class="section-header">Current Pipeline</h4><div class="analytics-grid">`;
      data.pipeline.forEach(p => {
        html += `<div class="analytics-card"><div class="analytics-card-num">${p.count}</div><div class="analytics-card-label">${p.state}</div></div>`;
      });
      html += `</div></div>`;
    }

    return html;
  }
};

function bindGlobalButtons() {
  const reportsBtn = document.getElementById('btn-reports');
  if (reportsBtn) reportsBtn.addEventListener('click', () => ReportsManager.openDailyReports());

  const trainingBtn = document.getElementById('btn-training');
  if (trainingBtn) trainingBtn.addEventListener('click', () => TrainingManager.openTrainingModal());

  const rulesBtn = document.getElementById('btn-rules');
  if (rulesBtn) rulesBtn.addEventListener('click', () => RulesManager.openRulesModal());

  const reportGenerateBtn = document.getElementById('btn-generate-report');
  if (reportGenerateBtn) reportGenerateBtn.addEventListener('click', () => ReportsManager.generateReport());

  const reportViewBtn = document.getElementById('btn-view-report');
  if (reportViewBtn) reportViewBtn.addEventListener('click', () => ReportsManager.loadReport());

  const briefingGenerateBtn = document.getElementById('btn-generate-briefing');
  if (briefingGenerateBtn) briefingGenerateBtn.addEventListener('click', () => ReportsManager.generateBriefing());

  const briefingQuickBtn = document.getElementById('btn-quick-briefing');
  if (briefingQuickBtn) briefingQuickBtn.addEventListener('click', () => ReportsManager.loadRawBriefing());

  const briefingMode = document.getElementById('briefingMode');
  if (briefingMode) {
    briefingMode.addEventListener('change', (e) => {
      const datePicker = document.getElementById('briefingDate');
      if (!datePicker) return;
      if (e.target.value === 'date') {
        datePicker.classList.remove('hidden');
        if (!datePicker.value) datePicker.value = new Date().toLocaleDateString('en-CA');
      } else {
        datePicker.classList.add('hidden');
      }
    });
  }

  const analyticsGenerateBtn = document.getElementById('btn-generate-analytics');
  if (analyticsGenerateBtn) analyticsGenerateBtn.addEventListener('click', () => ReportsManager.generateAnalytics());

  document.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', (e) => ReportsManager.switchReportTab(tab.dataset.tab, e.currentTarget));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  UserManager.init();
  RulesManager.init();
  TrainingManager.init();
  ReportsManager.init();
  bindGlobalButtons();

  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) modal.classList.remove('show');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('show');
    });
  });
});
