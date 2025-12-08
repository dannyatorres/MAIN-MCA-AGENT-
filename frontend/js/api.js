// js/api.js

export const ApiService = {
    config: {
        baseUrl: '',
        headers: { 'Content-Type': 'application/json' },
        isLocal: false
    },

    init() {
        // Centralized Environment Logic
        const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

        // Matches your server-new.js setup
        const RAILWAY_BACKEND_URL = '';

        this.config.isLocal = isLocalDev;
        this.config.baseUrl = isLocalDev
            ? RAILWAY_BACKEND_URL
            : window.location.origin;

        console.log(`🔗 API Initialized: ${this.config.baseUrl} (${isLocalDev ? 'Local/Railway' : 'Production'})`);
    },

    async request(endpoint, options = {}) {
        // Handle full URLs vs relative paths
        const url = endpoint.startsWith('http') ? endpoint : `${this.config.baseUrl}${endpoint}`;

        const headers = {
            ...this.config.headers,
            // Header bypass for local dev (matches server-new.js line 120)
            ...(this.config.isLocal ? { 'X-Local-Dev': 'true' } : {}),
            ...options.headers
        };

        const config = {
            ...options,
            headers,
            // CRITICAL: Preserves session cookies for express-session
            credentials: 'include'
        };

        try {
            const response = await fetch(url, config);

            // 401 Handling (Session Expired)
            if (response.status === 401) {
                if (this.config.isLocal) {
                    console.warn("⚠️ Auth bypassed for local development");
                    return {};
                }
                // Optional: Redirect to login if needed
                // window.location.href = '/';
                throw new Error("Unauthorized: Please log in");
            }

            // Handle No Content
            if (response.status === 204) return null;

            // Handle Non-JSON (PDFs/Blobs)
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
                return response; // Return raw response for blobs
            }

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || response.statusText);
            return data;

        } catch (error) {
            console.error(`❌ API Error (${endpoint}):`, error);
            throw error;
        }
    },

    // REST Methods
    get(url) { return this.request(url, { method: 'GET' }); },
    post(url, body) { return this.request(url, { method: 'POST', body: JSON.stringify(body) }); },
    put(url, body) { return this.request(url, { method: 'PUT', body: JSON.stringify(body) }); },
    delete(url) { return this.request(url, { method: 'DELETE' }); }
};
