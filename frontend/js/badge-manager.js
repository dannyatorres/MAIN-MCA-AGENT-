// badge-manager.js - Single source of truth for all badges

class BadgeManager {
    constructor() {
        // Future: could track dismissed states here
    }

    // Normalize any truthy value from DB
    toBool(val) {
        return val === true || val === 'true' || val === 1 || val === '1';
    }

    // Core badge checks
    getUnreadCount(conv) {
        return parseInt(conv.unread_count, 10) || 0;
    }

    hasOffer(conv) {
        return this.toBool(conv.has_offer);
    }

    hasNewBank(conv) {
        return this.toBool(conv.has_new_bank);
    }

    // Get all badges for a conversation
    getBadges(conv) {
        return {
            unread: this.getUnreadCount(conv),
            offer: this.hasOffer(conv),
            newBank: this.hasNewBank(conv)
        };
    }

    // CSS classes for the conversation row
    getRowClasses(conv, isSelected = false) {
        const badges = this.getBadges(conv);
        const classes = [];

        if (isSelected) classes.push('active');
        if (badges.unread > 0) classes.push('unread');
        if (badges.offer) classes.push('has-offer');
        if (badges.newBank) classes.push('has-new-bank');

        return classes.join(' ');
    }

    // Render inline badges (next to business name)
    renderInlineBadges(conv) {
        const badges = this.getBadges(conv);
        let html = '';

        if (badges.offer) {
            html += `<span class="badge-inline badge-offer">OFFER</span>`;
        }
        if (badges.newBank) {
            html += `<span class="badge-inline badge-bank">NEW BANK</span>`;
        }

        return html;
    }

    // Render unread count bubble
    renderUnreadBubble(conv) {
        const count = this.getUnreadCount(conv);
        return count > 0 ? `<div class="conversation-badge">${count}</div>` : '';
    }

    // Clear badge locally (before API call)
    clearOffer(conv) {
        if (conv) conv.has_offer = false;
    }

    clearUnread(conv) {
        if (conv) conv.unread_count = 0;
    }

    clearNewBank(conv) {
        if (conv) conv.has_new_bank = false;
    }
}

// Single instance
window.badgeManager = new BadgeManager();
