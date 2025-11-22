// js/leads.js
import { ApiService } from './api.js';

/**
 * Lead Business Logic
 * Handles CRUD operations for leads by talking to the API.
 */
export const LeadManager = {

    /**
     * Create a new lead
     * @param {object} leadData - Formatted data object
     */
    async create(leadData) {
        console.log('📤 LeadManager: Creating lead...', leadData);
        // POST to /api/conversations
        return await ApiService.post('/api/conversations', leadData);
    },

    /**
     * Update an existing lead
     * @param {string|number} id - Conversation/Lead ID
     * @param {object} leadData - Formatted data object
     */
    async update(id, leadData) {
        console.log(`💾 LeadManager: Updating lead ${id}...`, leadData);
        if (!id) throw new Error('Lead ID is required for updates');

        // PUT to /api/conversations/:id
        return await ApiService.put(`/api/conversations/${id}`, leadData);
    },

    /**
     * Archive a lead
     */
    async archive(id) {
        console.log(`📦 LeadManager: Archiving lead ${id}...`);
        if (!id) throw new Error('Lead ID is required');

        return await ApiService.post(`/api/conversations/${id}/archive`, {});
    },

    /**
     * Delete a lead
     */
    async delete(id) {
        console.log(`🗑️ LeadManager: Deleting lead ${id}...`);
        if (!id) throw new Error('Lead ID is required');

        return await ApiService.delete(`/api/conversations/${id}`);
    },

    /**
     * Clone a lead
     */
    async clone(id) {
        console.log(`👥 LeadManager: Cloning lead ${id}...`);
        if (!id) throw new Error('Lead ID is required');

        return await ApiService.post(`/api/conversations/${id}/clone`, {});
    },

    /**
     * Fetch a single lead's details (for editing)
     */
    async getById(id) {
        console.log(`🔍 LeadManager: Fetching lead ${id}...`);
        const result = await ApiService.get(`/api/conversations/${id}`);
        // The API usually returns { success: true, conversation: {...} }
        // We return just the conversation object to be helpful
        return result.conversation || result;
    }
};
