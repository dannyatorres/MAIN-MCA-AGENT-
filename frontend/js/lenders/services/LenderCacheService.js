export class LenderCacheService {
    getResults(conversationId) {
        if (!conversationId) return null;
        const cached = localStorage.getItem(`lender_results_${conversationId}`);
        if (!cached) return null;
        try {
            return JSON.parse(cached);
        } catch (error) {
            console.error('Error parsing cached lender results:', error);
            return null;
        }
    }

    setResults(conversationId, data, criteria) {
        if (!conversationId) return;
        localStorage.setItem(`lender_results_${conversationId}`, JSON.stringify({
            data,
            criteria,
            timestamp: Date.now()
        }));
    }

    clearResults(conversationId) {
        if (!conversationId) return;
        localStorage.removeItem(`lender_results_${conversationId}`);
    }

    getFormData(conversationId) {
        if (!conversationId) return null;
        const cached = localStorage.getItem(`lender_form_data_${conversationId}`);
        if (!cached) return null;
        try {
            return JSON.parse(cached);
        } catch (error) {
            console.error('Error parsing cached lender form data:', error);
            return null;
        }
    }

    setFormData(conversationId, formData) {
        if (!conversationId) return;
        localStorage.setItem(`lender_form_data_${conversationId}`, JSON.stringify(formData));
    }

    clearFormData(conversationId) {
        if (!conversationId) return;
        localStorage.removeItem(`lender_form_data_${conversationId}`);
    }
}
