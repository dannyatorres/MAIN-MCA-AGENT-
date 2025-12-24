// frontend/js/intelligence-tabs/deal-intelligence-tab.js

export class DealIntelligenceTab {
    constructor(parent) {
        this.parent = parent; // Reference to the main app controller
    }

    render(container) {
        // 1. Get the current data
        const conv = this.parent.getSelectedConversation();

        // Safety check
        if (!conv) {
            container.innerHTML = '<div class="p-4 text-gray-500">No conversation selected.</div>';
            return;
        }

        // 2. define values (safely accessed)
        const dealDesc = conv.deal_description || '';
        const dealType = conv.deal_type || 'New Purchase'; // Default or empty
        const dealStage = conv.deal_stage || 'Lead';
        const dealAmount = conv.deal_amount || '';
        const moveInDate = conv.move_in_date ? new Date(conv.move_in_date).toISOString().split('T')[0] : '';

        // 3. Build the HTML
        container.innerHTML = `
            <div class="deal-intelligence-panel p-4">
                <h3 class="text-lg font-bold mb-4">Deal Intelligence</h3>

                <form id="dealIntelForm" class="space-y-4">

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Deal Description</label>
                        <textarea id="dealDesc" rows="3"
                            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                            placeholder="Describe the deal...">${dealDesc}</textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Deal Type</label>
                        <select id="dealType" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
                            <option value="New Purchase" ${dealType === 'New Purchase' ? 'selected' : ''}>New Purchase</option>
                            <option value="Refinance" ${dealType === 'Refinance' ? 'selected' : ''}>Refinance</option>
                            <option value="Cash Out" ${dealType === 'Cash Out' ? 'selected' : ''}>Cash Out</option>
                            <option value="Construction" ${dealType === 'Construction' ? 'selected' : ''}>Construction</option>
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700">Stage</label>
                        <select id="dealStage" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
                            <option value="Lead" ${dealStage === 'Lead' ? 'selected' : ''}>Lead</option>
                            <option value="Application" ${dealStage === 'Application' ? 'selected' : ''}>Application</option>
                            <option value="Processing" ${dealStage === 'Processing' ? 'selected' : ''}>Processing</option>
                            <option value="Underwriting" ${dealStage === 'Underwriting' ? 'selected' : ''}>Underwriting</option>
                            <option value="Closed" ${dealStage === 'Closed' ? 'selected' : ''}>Closed</option>
                        </select>
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">Amount ($)</label>
                            <input type="number" id="dealAmount" value="${dealAmount}"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-700">Move-in Date</label>
                            <input type="date" id="moveInDate" value="${moveInDate}"
                                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm">
                        </div>
                    </div>

                    <div class="pt-4 flex justify-end">
                        <button type="button" id="saveDealIntelBtn"
                            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                            Save Changes
                        </button>
                    </div>
                </form>
            </div>
        `;

        // 4. Attach Event Listener
        document.getElementById('saveDealIntelBtn').addEventListener('click', () => this.saveChanges(conv.id));
    }

    async saveChanges(conversationId) {
        const payload = {
            deal_description: document.getElementById('dealDesc').value,
            deal_type: document.getElementById('dealType').value,
            deal_stage: document.getElementById('dealStage').value,
            deal_amount: document.getElementById('dealAmount').value,
            move_in_date: document.getElementById('moveInDate').value
        };

        try {
            // Assuming parent has an apiCall method (Standard based on your manager file)
            // You might need to adjust the API endpoint to match your backend
            await this.parent.apiCall(`/api/conversations/${conversationId}`, 'PUT', payload);

            // Optional: Update local state or show toast
            alert('Deal Intelligence saved successfully!');

            // Update parent data locally so we don't need to refresh
            const conv = this.parent.getSelectedConversation();
            Object.assign(conv, payload);

        } catch (error) {
            console.error('Failed to save deal intelligence:', error);
            alert('Error saving data.');
        }
    }
}
