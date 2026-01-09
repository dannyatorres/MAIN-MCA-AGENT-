// debug.js - Toggle-able logging for key features

const DEBUG = {
    enabled: localStorage.getItem('debug') === 'true',

    // Feature flags
    messaging: true,
    filters: true,
    websocket: true,

    log(feature, ...args) {
        if (!this.enabled || !this[feature]) return;
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] [${feature.toUpperCase()}]`, ...args);
    },

    warn(feature, ...args) {
        if (!this.enabled || !this[feature]) return;
        console.warn(`[${feature.toUpperCase()}]`, ...args);
    },

    error(feature, ...args) {
        // Always log errors
        console.error(`[${feature.toUpperCase()}]`, ...args);
    },

    // Turn on: DEBUG.enable()
    enable() {
        this.enabled = true;
        localStorage.setItem('debug', 'true');
        console.log('Debug mode ON - refresh to see logs');
    },

    // Turn off: DEBUG.disable()
    disable() {
        this.enabled = false;
        localStorage.setItem('debug', 'false');
        console.log('Debug mode OFF');
    }
};

window.DEBUG = DEBUG;
