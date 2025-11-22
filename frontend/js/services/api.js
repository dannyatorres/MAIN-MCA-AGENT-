// js/services/api.js

/**
 * Centralized API Service
 * Handles all HTTP requests, headers, and standard error parsing.
 */
export const ApiService = {
    /**
     * Generic helper to handle the response parsing
     * @param {Response} response
     */
    async handleResponse(response) {
        // Try to parse JSON, but handle cases where response might be empty or text
        let data;
        const contentType = response.headers.get("content-type");

        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            // If the server sent a specific error message, throw that.
            // Otherwise throw a generic status text.
            const errorMessage = (data && data.error) ? data.error : response.statusText;
            throw new Error(errorMessage || 'API Request Failed');
        }

        return data;
    },

    /**
     * GET Request
     * @param {string} endpoint - e.g., '/api/conversations'
     */
    async get(endpoint) {
        try {
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    // 'X-Local-Dev': 'true' // Uncomment if you need the local dev bypass
                }
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`❌ GET ${endpoint} failed:`, error);
            throw error;
        }
    },

    /**
     * POST Request
     * @param {string} endpoint
     * @param {object} payload
     */
    async post(endpoint, payload) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`❌ POST ${endpoint} failed:`, error);
            throw error;
        }
    },

    /**
     * PUT Request
     * @param {string} endpoint
     * @param {object} payload
     */
    async put(endpoint, payload) {
        try {
            const response = await fetch(endpoint, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`❌ PUT ${endpoint} failed:`, error);
            throw error;
        }
    },

    /**
     * DELETE Request
     * @param {string} endpoint
     */
    async delete(endpoint) {
        try {
            const response = await fetch(endpoint, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error(`❌ DELETE ${endpoint} failed:`, error);
            throw error;
        }
    }
};
