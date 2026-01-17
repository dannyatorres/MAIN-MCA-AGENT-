import { DOM } from '../ui/LenderDomMap.js';

export class SubmissionManager {
    constructor({ parent, api, utils, getQualifiedLenders, getNonQualifiedLenders }) {
        this.parent = parent;
        this.api = api;
        this.utils = utils;
        this.getQualifiedLenders = getQualifiedLenders;
        this.getNonQualifiedLenders = getNonQualifiedLenders;
        this.submissionHistory = [];
        this.documents = [];
    }

    async openModal(conversationId, documents = []) {
        const modal = document.getElementById(DOM.SUBMISSION.MODAL);
        if (!modal) {
            console.error('❌ Lender submission modal not found in DOM');
            this.utils.showNotification('Modal not found', 'error');
            return;
        }

        const searchInput = document.getElementById(DOM.SUBMISSION.SEARCH_INPUT);
        if (searchInput) searchInput.value = '';

        try {
            const [_, submissionHistory] = await Promise.all([
                this.ensureDocumentsLoaded(conversationId, documents),
                this.getSubmissionHistory(conversationId)
            ]);
            this.submissionHistory = submissionHistory;
        } catch (error) {
            console.error('❌ Error loading data:', error);
            this.submissionHistory = [];
        }

        try {
            this.populateSubmissionLenders();
            this.populateSubmissionDocuments();
            this.prefillSubmissionMessage();
        } catch (error) {
            console.error('❌ Error populating modal:', error);
        }

        this.attachModalEventListeners();
        this.updateLenderSelectionCount();

        modal.classList.remove('hidden');
        modal.style.display = '';
    }

    async ensureDocumentsLoaded(conversationId, documents = []) {
        if (documents?.length) {
            this.documents = documents;
            return;
        }

        const result = await this.api.fetchDocuments(conversationId);
        if (result.success && result.documents) {
            this.documents = result.documents;
            if (this.parent.documents) {
                this.parent.documents.currentDocuments = result.documents;
            }
        }
    }

    async getSubmissionHistory(conversationId) {
        if (!conversationId) return [];
        try {
            const result = await this.api.fetchSubmissionHistory(conversationId);
            return result.submissions || [];
        } catch (error) {
            console.error('Error fetching submission history:', error);
            return [];
        }
    }

    populateSubmissionLenders() {
        const lenderList = document.getElementById(DOM.SUBMISSION.LENDER_LIST);
        const showAll = document.getElementById(DOM.SUBMISSION.SHOW_ALL_TOGGLE)?.checked || false;

        if (!lenderList) return;

        let displayList = [...(this.getQualifiedLenders() || [])];
        if (showAll && this.getNonQualifiedLenders()) {
            displayList = [...displayList, ...this.getNonQualifiedLenders()];
        }

        if (displayList.length === 0) {
            lenderList.innerHTML = '<p class="submission-empty-msg">No lenders available.</p>';
            return;
        }

        const submittedMap = new Map();
        (this.submissionHistory || []).forEach(sub => {
            submittedMap.set(sub.lender_name?.toLowerCase(), sub);
        });

        const alreadySubmitted = [];
        const available = [];

        displayList.forEach(lender => {
            const lenderName = (lender['Lender Name'] || lender.name || '').toLowerCase();
            const submission = submittedMap.get(lenderName);
            if (submission) {
                alreadySubmitted.push({ ...lender, submission });
            } else {
                available.push(lender);
            }
        });

        let html = '';

        if (alreadySubmitted.length > 0) {
            html += `
                <div class="submission-section">
                    <div class="submission-header submitted">
                        📤 Already Submitted (${alreadySubmitted.length})
                    </div>
            `;

            alreadySubmitted.forEach(lender => {
                const lenderName = lender['Lender Name'] || lender.name;
                const sub = lender.submission;

                let statusBadge = '';
                let statusClass = 'pending';

                if (sub.status === 'OFFER') {
                    statusBadge = sub.offer_amount
                        ? `OFFER $${Number(sub.offer_amount).toLocaleString()}`
                        : 'OFFER';
                    statusClass = 'offer';
                } else if (sub.status === 'DECLINED' || sub.status === 'DECLINE') {
                    statusBadge = 'DECLINED';
                    statusClass = 'declined';
                } else {
                    statusBadge = sub.status || 'PENDING';
                }

                const sentDate = sub.submitted_at
                    ? new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';

                html += `
                    <label class="selection-item submission-item is-submitted">
                        <input type="checkbox" class="lender-checkbox" value="${lenderName}">
                        <div class="list-text submission-text-flex">
                            ${lenderName}
                            <span class="submission-status-badge ${statusClass}">${statusBadge}</span>
                            ${sentDate ? `<span class="submission-date">(${sentDate})</span>` : ''}
                        </div>
                    </label>
                `;
            });

            html += `</div>`;
        }

        if (available.length > 0) {
            html += `
                <div class="submission-section">
                    <div class="submission-header available">
                        ✅ Available Lenders (${available.length})
                    </div>
            `;

            const lendersByTier = {};
            available.forEach(lender => {
                let tier = lender.Tier || 'Unknown';
                if (!lender.Tier && lender.blockingRule) tier = 'Restricted';
                if (!lendersByTier[tier]) lendersByTier[tier] = [];
                lendersByTier[tier].push(lender);
            });

            const sortedTiers = Object.keys(lendersByTier).sort((a, b) => {
                if (a === 'Restricted') return 1;
                if (b === 'Restricted') return -1;
                return a.localeCompare(b);
            });

            sortedTiers.forEach(tier => {
                const tierClass = tier === 'Restricted' ? 'restricted' : 'standard';
                html += `<div class="submission-tier-header ${tierClass}">Tier ${tier}</div>`;

                lendersByTier[tier].forEach(lender => {
                    const lenderName = lender['Lender Name'] || lender.name;
                    const isPreferred = lender.isPreferred;
                    const reason = lender.blockingRule ? `(${lender.blockingRule})` : '';

                    html += `
                        <label class="selection-item">
                            <input type="checkbox" class="lender-checkbox" value="${lenderName}" checked>
                            <div class="list-text">
                                ${lenderName}
                                ${isPreferred ? '<span class="submission-star">★</span>' : ''}
                                ${reason ? `<span class="submission-reason">${reason}</span>` : ''}
                            </div>
                        </label>
                    `;
                });
            });

            html += `</div>`;
        }

        lenderList.innerHTML = html;

        const toggleBtn = document.getElementById(DOM.SUBMISSION.TOGGLE_LENDERS);
        if (toggleBtn) {
            toggleBtn.textContent = 'DESELECT ALL';
            toggleBtn.className = 'action-link';
        }
    }

    populateSubmissionDocuments() {
        const docList = document.getElementById(DOM.SUBMISSION.DOC_LIST);
        const documents = this.documents.length ? this.documents : this.parent.documents?.currentDocuments;

        if (!docList) return;
        if (!documents || documents.length === 0) {
            docList.innerHTML = '<p class="submission-empty-msg">No documents available.</p>';
            return;
        }

        let html = '';
        documents.forEach(doc => {
            const name = doc.originalFilename || doc.filename || 'Unknown Document';
            const isImportant = doc.documentType === 'Bank Statement' ||
                              doc.documentType === 'Signed Application' ||
                              name.toLowerCase().includes('application');

            let iconClass = 'fas fa-file-alt';
            let typeClass = 'default';
            const lowerName = name.toLowerCase();

            if (lowerName.endsWith('.pdf')) { iconClass = 'fas fa-file-pdf'; typeClass = 'pdf'; }
            else if (lowerName.match(/\.(jpg|jpeg|png)$/)) { iconClass = 'fas fa-file-image'; typeClass = 'image'; }
            else if (lowerName.match(/\.(xls|xlsx|csv)$/)) { iconClass = 'fas fa-file-excel'; typeClass = 'excel'; }

            html += `
                <label class="selection-item">
                    <input type="checkbox" class="document-checkbox" value="${doc.id}" ${isImportant ? 'checked' : ''}>
                    <div class="submission-doc-icon ${typeClass}"><i class="${iconClass}"></i></div>
                    <div class="list-text submission-doc-name">${name}</div>
                </label>
            `;
        });

        docList.innerHTML = html;

        const toggleBtn = document.getElementById(DOM.SUBMISSION.TOGGLE_DOCS);
        if (toggleBtn) {
            const checkboxes = docList.querySelectorAll('input[type="checkbox"]');
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            toggleBtn.textContent = checkedCount === checkboxes.length ? 'DESELECT ALL' : 'SELECT ALL';
        }
    }

    prefillSubmissionMessage() {
        const messageField = document.getElementById('submissionMessage');
        const conversation = this.parent.getSelectedConversation();

        if (!messageField || !conversation) return;

        const businessName = conversation.business_name || 'the client';
        const message = `Hello,

Please find attached the funding application and supporting documents for ${businessName}.

Please review and let me know if you need any additional information.

Best regards`;

        messageField.value = message;
    }

    async sendLenderSubmissions() {
        try {
            const selectedLenderCheckboxes = Array.from(document.querySelectorAll('.lender-checkbox:checked'));
            const selectedDocumentIds = Array.from(document.querySelectorAll('.document-checkbox:checked')).map(cb => cb.value);
            const message = document.getElementById('submissionMessage')?.value;

            if (selectedLenderCheckboxes.length === 0) {
                this.utils.showNotification('Please select at least one lender', 'warning');
                return;
            }
            if (!message?.trim()) {
                this.utils.showNotification('Please enter a message', 'warning');
                return;
            }

            const overlay = document.getElementById('submissionOverlay');
            const statusText = document.getElementById('submissionStatusText');
            const progressBar = document.getElementById('submissionProgressBar');

            if (overlay) {
                overlay.style.display = 'flex';
                statusText.textContent = `Preparing ${selectedLenderCheckboxes.length} lender applications...`;
                progressBar.style.width = '10%';
            }

            const selectedLenders = await Promise.all(selectedLenderCheckboxes.map(async (cb) => {
                const lenderName = cb.value;
                const allLenders = [...(this.getQualifiedLenders() || []), ...(this.getNonQualifiedLenders() || [])];

                const lender = allLenders.find(l =>
                    (l['Lender Name'] === lenderName) || (l.name === lenderName)
                );

                let foundEmail =
                    lender?.email ||
                    lender?.Email ||
                    lender?.['Lender Email'] ||
                    lender?.['Lender Email Address'] ||
                    lender?.['Email Address'] ||
                    lender?.['contact_email'] ||
                    lender?.['email_address'] ||
                    null;

                let foundCC = lender?.cc_email || lender?.cc || null;

                if (!foundEmail && lenderName) {
                    try {
                        const dbLookup = await this.api.lookupLenderByName(lenderName);
                        if (dbLookup?.success && dbLookup.email) {
                            foundEmail = dbLookup.email;
                            foundCC = dbLookup.cc_email || foundCC;
                        }
                    } catch (e) {
                        console.warn(`⚠️ DB lookup failed for ${lenderName}:`, e.message);
                    }
                }

                return {
                    name: lenderName,
                    lender_name: lenderName,
                    email: foundEmail ? foundEmail.trim() : null,
                    cc_email: foundCC ? foundCC.trim() : null
                };
            }));

            const documents = (this.documents.length ? this.documents : this.parent.documents?.currentDocuments) || [];
            const selectedDocuments = selectedDocumentIds.map(docId => {
                const doc = documents.find(d => d.id === docId);
                return doc ? {
                    id: doc.id,
                    filename: doc.originalFilename || doc.filename,
                    s3_url: doc.s3_url
                } : { id: docId };
            });

            const conversation = this.parent.getSelectedConversation();
            const businessData = {
                businessName: conversation?.business_name || 'Unknown Business',
                industry: conversation?.industry_type || conversation?.industry || '',
                state: conversation?.us_state || '',
                monthlyRevenue: conversation?.monthly_revenue || 0,
                fico: conversation?.credit_score || '',
                tib: conversation?.time_in_business || '',
                position: conversation?.position || '',
                customMessage: message
            };

            let progress = 10;
            const progressInterval = setInterval(() => {
                if (progress < 90) {
                    progress += Math.random() * 10;
                    if (progressBar) progressBar.style.width = `${progress}%`;
                    if (statusText) statusText.textContent = `Sending to ${selectedLenders.length} lenders... (${Math.round(progress)}%)`;
                }
            }, 800);

            const conversationId = this.parent.getCurrentConversationId();
            this.api.sendSubmission(conversationId, {
                selectedLenders,
                businessData,
                documents: selectedDocuments
            }).then(result => {
                console.log('📧 Background submission result:', result);
            }).catch(err => {
                console.error('📧 Background submission error:', err);
            });

            clearInterval(progressInterval);

            if (progressBar) progressBar.style.width = '100%';
            if (statusText) statusText.textContent = '✅ Queued Successfully!';

            setTimeout(() => {
                this.utils.showNotification(`Sending to ${selectedLenders.length} lenders in background!`, 'success');

                overlay.style.display = 'none';
                progressBar.style.width = '0%';

                document.getElementById(DOM.SUBMISSION.MODAL).style.display = 'none';
                document.getElementById(DOM.SUBMISSION.MODAL).classList.add('hidden');
            }, 500);

        } catch (error) {
            console.error('Error sending submissions:', error);
            const overlay = document.getElementById('submissionOverlay');
            if (overlay) overlay.style.display = 'none';
            this.utils.showNotification('Failed to send: ' + error.message, 'error');
        }
    }

    attachModalEventListeners() {
        const modal = document.getElementById(DOM.SUBMISSION.MODAL);
        if (!modal) return;

        const attachListener = (elementId, handler, eventType = 'click') => {
            const element = document.getElementById(elementId);
            if (element) {
                const newElement = element.cloneNode(true);
                element.parentNode.replaceChild(newElement, element);
                newElement.addEventListener(eventType, handler);
                return true;
            }
            return false;
        };

        attachListener('closeLenderSubmissionModal', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });

        attachListener('cancelLenderSubmission', (e) => {
            e.preventDefault();
            modal.classList.add('hidden');
        });

        attachListener(DOM.SUBMISSION.TOGGLE_LENDERS, (e) => {
            e.preventDefault();
            this.toggleAllLenders();
        });

        attachListener(DOM.SUBMISSION.TOGGLE_DOCS, (e) => {
            e.preventDefault();
            this.toggleAllDocuments();
        });

        attachListener(DOM.SUBMISSION.SHOW_ALL_TOGGLE, () => {
            this.populateSubmissionLenders();
            this.updateLenderSelectionCount();
        }, 'change');

        attachListener(DOM.SUBMISSION.SEND_BTN, async (e) => {
            e.preventDefault();
            await this.sendLenderSubmissions();
        });

        const searchInput = document.getElementById(DOM.SUBMISSION.SEARCH_INPUT);
        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);

            newSearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const list = document.getElementById(DOM.SUBMISSION.LENDER_LIST);
                if (!list) return;

                const tiers = list.children;
                Array.from(tiers).forEach(tierDiv => {
                    const labels = tierDiv.querySelectorAll('label');
                    let hasVisibleLenders = false;

                    labels.forEach(label => {
                        const text = label.textContent.toLowerCase();
                        if (text.includes(searchTerm)) {
                            label.style.display = 'flex';
                            hasVisibleLenders = true;
                        } else {
                            label.style.display = 'none';
                        }
                    });

                    tierDiv.style.display = hasVisibleLenders ? 'block' : 'none';
                });
            });

            setTimeout(() => newSearch.focus(), 100);
        }

        const lenderList = document.getElementById(DOM.SUBMISSION.LENDER_LIST);
        if (lenderList) {
            lenderList.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox') {
                    this.updateLenderSelectionCount();
                }
            });
        }
    }

    toggleAllLenders() {
        const checkboxes = document.querySelectorAll('#lenderSelectionList input[type="checkbox"]');
        const toggleBtn = document.getElementById(DOM.SUBMISSION.TOGGLE_LENDERS);
        if (!checkboxes.length || !toggleBtn) return;

        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
        this.updateLenderSelectionCount();
    }

    toggleAllDocuments() {
        const checkboxes = document.querySelectorAll('#submissionDocumentList input[type="checkbox"]');
        const toggleBtn = document.getElementById(DOM.SUBMISSION.TOGGLE_DOCS);
        if (!checkboxes.length || !toggleBtn) return;

        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const allChecked = checkedCount === checkboxes.length;

        checkboxes.forEach(checkbox => {
            checkbox.checked = !allChecked;
        });

        toggleBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    }

    updateLenderSelectionCount() {
        const checkboxes = document.querySelectorAll('#lenderSelectionList input[type="checkbox"]:checked');
        const countEl = document.getElementById(DOM.SUBMISSION.COUNT);
        if (countEl) {
            countEl.textContent = `(${checkboxes.length} selected)`;
        }
    }
}
