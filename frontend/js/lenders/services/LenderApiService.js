export class LenderApiService {
    constructor(apiCallFn) {
        this.apiCall = apiCallFn;
    }

    async qualify(criteria) {
        return await this.apiCall('/api/qualification/qualify', {
            method: 'POST',
            body: JSON.stringify(criteria)
        });
    }

    async saveQualifications(conversationId, payload) {
        return await this.apiCall(`/api/submissions/${conversationId}/qualifications/save`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async fetchAllLenders() {
        return await this.apiCall('/api/qualification/all-lenders');
    }

    async fetchConversationLenders(conversationId) {
        return await this.apiCall(`/api/conversations/${conversationId}/lenders`);
    }

    async fetchDocuments(conversationId) {
        return await this.apiCall(`/api/documents/${conversationId}`);
    }

    async fetchSubmissionHistory(conversationId) {
        return await this.apiCall(`/api/lenders/submissions/${conversationId}`);
    }

    async fetchFcsResults(conversationId) {
        return await this.apiCall(`/api/fcs/results/${conversationId}`);
    }

    async lookupLenderByName(lenderName) {
        return await this.apiCall(`/api/lenders/by-name/${encodeURIComponent(lenderName.trim())}`);
    }

    async sendSubmission(conversationId, payload) {
        return await this.apiCall(`/api/submissions/${conversationId}/send`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }

    async logResponse(payload) {
        return await this.apiCall('/api/lenders/log-response', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    }
}
