import { DOM } from '../ui/LenderDomMap.js';
import { LenderTemplates } from '../ui/LenderTemplates.js';

export class ResponseManager {
    constructor({ api, utils, onResponseSaved }) {
        this.api = api;
        this.utils = utils;
        this.onResponseSaved = onResponseSaved;
    }

    openModal(lenderName, conversationId) {
        const modal = document.getElementById(DOM.RESPONSE.MODAL);
        if (!modal) {
            console.error('Lender response modal not found');
            return;
        }

        modal.innerHTML = LenderTemplates.renderResponseModal(lenderName, String(conversationId || ''));

        modal.classList.remove('hidden');
        modal.classList.add('active');

        this.attachResponseModalListeners();
    }

    attachResponseModalListeners() {
        const modal = document.getElementById(DOM.RESPONSE.MODAL);
        if (!modal) return;

        const statusSelect = document.getElementById('responseStatus');
        statusSelect.onchange = () => {
            const status = statusSelect.value;
            document.getElementById('offerFields').style.display =
                ['OFFER', 'FUNDED'].includes(status) ? 'block' : 'none';
            document.getElementById('declineFields').style.display =
                status === 'DECLINE' ? 'block' : 'none';
        };

        const positionSelect = document.getElementById('responsePosition');
        positionSelect.onchange = () => {
            const pos = parseInt(positionSelect.value) || 0;
            document.getElementById('prevPositionFields').style.display =
                pos > 1 ? 'block' : 'none';
        };

        document.getElementById('closeLenderResponseModal').onclick = () => {
            modal.classList.add('hidden');
        };
        document.getElementById('cancelLenderResponse').onclick = () => {
            modal.classList.add('hidden');
        };

        document.getElementById('saveLenderResponse').onclick = async () => {
            await this.saveLenderResponse();
        };

        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        };

        statusSelect.dispatchEvent(new Event('change'));
        positionSelect.dispatchEvent(new Event('change'));
    }

    async saveLenderResponse() {
        const conversationId = document.getElementById('responseConversationId').value;
        const lenderName = document.getElementById('responseLenderName').value;
        const status = document.getElementById('responseStatus').value;

        if (!status) {
            this.utils.showNotification('Please select a status', 'warning');
            return;
        }

        const data = {
            conversation_id: conversationId,
            lender_name: lenderName,
            status: status
        };

        const position = document.getElementById('responsePosition')?.value;
        if (position) data.position = parseInt(position);

        if (['OFFER', 'FUNDED'].includes(status)) {
            const amount = document.getElementById('responseOfferAmount')?.value;
            const factor = document.getElementById('responseFactorRate')?.value;
            const term = document.getElementById('responseTermLength')?.value;
            const termUnit = document.getElementById('responseTermUnit')?.value;
            const frequency = document.getElementById('responsePaymentFrequency')?.value;

            if (amount) data.offer_amount = parseFloat(amount);
            if (factor) data.factor_rate = parseFloat(factor);
            if (term) data.term_length = parseInt(term);
            if (termUnit) data.term_unit = termUnit;
            if (frequency) data.payment_frequency = frequency;
        }

        const pos = parseInt(position) || 0;
        if (pos > 1) {
            const prevAmount = document.getElementById('responsePrevAmount')?.value;
            const prevFactor = document.getElementById('responsePrevFactorRate')?.value;
            const prevTerm = document.getElementById('responsePrevTermLength')?.value;
            const prevTermUnit = document.getElementById('responsePrevTermUnit')?.value;
            const prevFreq = document.getElementById('responsePrevPaymentFrequency')?.value;
            const dailyWithhold = document.getElementById('responseDailyWithhold')?.value;
            const daysIntoStack = document.getElementById('responseDaysIntoStack')?.value;

            if (prevAmount) data.prev_amount = parseFloat(prevAmount);
            if (prevFactor) data.prev_factor_rate = parseFloat(prevFactor);
            if (prevTerm) data.prev_term_length = parseInt(prevTerm);
            if (prevTermUnit) data.prev_term_unit = prevTermUnit;
            if (prevFreq) data.prev_payment_frequency = prevFreq;
            if (dailyWithhold) data.total_daily_withhold = parseFloat(dailyWithhold);
            if (daysIntoStack) data.days_into_stack = parseInt(daysIntoStack);
        }

        if (status === 'DECLINE') {
            const reason = document.getElementById('responseDeclineReason')?.value;
            if (reason) data.decline_reason = reason;
        }

        try {
            const result = await this.api.logResponse(data);
            if (result.success) {
                this.utils.showNotification('Response logged successfully', 'success');
                document.getElementById(DOM.RESPONSE.MODAL).classList.add('hidden');
                this.onResponseSaved?.(lenderName, status);
            } else {
                throw new Error(result.error || 'Failed to save');
            }
        } catch (err) {
            console.error('Error saving lender response:', err);
            this.utils.showNotification('Failed to save response: ' + err.message, 'error');
        }
    }
}
