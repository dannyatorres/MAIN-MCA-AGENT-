// ============ MOBILE UTILS (Reuses logic from Utilities class) ============
class MobileUtils {
    constructor(parent) {
        this.parent = parent;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatPhone(value) {
        if (!value) return '';
        let digits = String(value).replace(/\D/g, '');
        if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }

    formatDate(date, format = 'display') {
        if (!date) return '';
        try {
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return '';

            if (format === 'ago') {
                const now = new Date();
                const diff = Math.floor((now - d) / 1000);
                if (diff < 60) return 'now';
                if (diff < 3600) return `${Math.floor(diff / 60)}m`;
                if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
                if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
                return d.toLocaleDateString();
            }

            if (format === 'smart') {
                const now = new Date();
                const isToday = d.toDateString() === now.toDateString();
                const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                if (isToday) return time;

                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + time;
            }

            return d.toLocaleDateString();
        } catch (e) {
            return '';
        }
    }
}

window.MobileUtils = MobileUtils;
