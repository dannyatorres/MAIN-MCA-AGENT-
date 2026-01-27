// badge-manager.js - Single source of truth for all badges

class BadgeManager {
    constructor(core) {
        this.core = core;
        this.animator = null;
    }

    setAnimator(animator) {
        this.animator = animator;
    }

    // Normalize any truthy value from DB
    toBool(val) {
        return val === true || val === 'true' || val === 1 || val === '1';
    }

    getUnreadCount(conv) {
        return parseInt(conv.unread_count, 10) || 0;
    }

    hasOffer(conv) {
        return this.toBool(conv.has_offer);
    }

    getRowClasses(conv, isSelected = false) {
        const classes = [];
        if (isSelected) classes.push('active');
        if (this.getUnreadCount(conv) > 0) classes.push('unread');
        if (this.hasOffer(conv)) classes.push('has-offer');
        return classes.join(' ');
    }

    renderUnreadBubble(conv) {
        const count = this.getUnreadCount(conv);
        return count > 0 ? `<div class="conversation-badge">${count}</div>` : '';
    }

    renderOfferIcon(conv) {
        return this.hasOffer(conv) ? `<span class="badge-offer-icon">💰</span>` : '';
    }

    // OPTIMISTIC: Update immediately, animate, then sync with server
    async setOffer(conversationId, value = true) {
        const conv = this.core.conversations.get(String(conversationId));
        if (!conv) return;

        conv.has_offer = value;
        conv.last_activity = new Date().toISOString();

        if (this.animator) {
            if (value) {
                this.animator.addBadge(conversationId, 'offer');
                this.animator.moveToTop(conversationId);
                this.animator.highlight(conversationId);
            } else {
                this.animator.removeBadge(conversationId, 'offer');
            }
        }
    }

    async incrementUnread(conversationId) {
        const conv = this.core.conversations.get(String(conversationId));
        if (!conv) return;

        conv.unread_count = (parseInt(conv.unread_count, 10) || 0) + 1;
        conv.last_activity = new Date().toISOString();

        if (this.animator) {
            this.animator.updateUnreadCount(conversationId, conv.unread_count);
            this.animator.moveToTop(conversationId);
        }
    }

    async clearUnread(conversationId) {
        const conv = this.core.conversations.get(String(conversationId));
        if (!conv) return;

        conv.unread_count = 0;

        if (this.animator) {
            this.animator.updateUnreadCount(conversationId, 0);
        }

        // Fire and forget to server
        this.core.parent.apiCall(`/api/conversations/${conversationId}/mark-read`, {
            method: 'POST'
        }).catch(console.error);
    }

    async clearOffer(conversationId) {
        const conv = this.core.conversations.get(String(conversationId));
        if (!conv || !this.hasOffer(conv)) return;

        conv.has_offer = false;

        if (this.animator) {
            this.animator.removeBadge(conversationId, 'offer');
        }

        // Fire and forget to server
        this.core.parent.apiCall(`/api/conversations/${conversationId}/clear-offer`, {
            method: 'POST'
        }).catch(console.error);
    }
}

window.BadgeManager = BadgeManager;
