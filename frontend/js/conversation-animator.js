// conversation-animator.js - Smooth, iPhone-like list updates

class ConversationAnimator {
    constructor(core) {
        this.core = core;
        this.container = null;
        this.animationDuration = 300;
    }

    getContainer() {
        if (!this.container) {
            this.container = document.getElementById('conversationsList');
        }
        return this.container;
    }

    // Animate a single conversation to the top
    async moveToTop(conversationId) {
        const container = this.getContainer();
        if (!container) return;

        const item = container.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        const firstItem = container.querySelector('.conversation-item');
        if (!firstItem || firstItem === item) return; // Already at top

        // Get positions
        const distance = item.offsetTop - firstItem.offsetTop;

        // Animate up
        item.style.transition = `transform ${this.animationDuration}ms ease-out`;
        item.style.transform = `translateY(-${distance}px)`;
        item.style.zIndex = '10';

        // Animate others down
        let sibling = firstItem;
        while (sibling && sibling !== item) {
            sibling.style.transition = `transform ${this.animationDuration}ms ease-out`;
            sibling.style.transform = `translateY(${item.offsetHeight}px)`;
            sibling = sibling.nextElementSibling;
        }

        // After animation, actually move the DOM element
        await this.sleep(this.animationDuration);

        // Reset transforms on ALL items (some may be new nodes from a re-render)
        item.style.transition = '';
        item.style.transform = '';
        item.style.zIndex = '';

        container.querySelectorAll('.conversation-item').forEach(el => {
            el.style.transition = '';
            el.style.transform = '';
        });

        // Only move if the original node is still in this container
        if (item.parentNode === container) {
            const currentFirst = container.querySelector('.conversation-item');
            if (currentFirst && currentFirst !== item) {
                container.insertBefore(item, currentFirst);
            }
        }
    }

    // Add badge with animation
    addBadge(conversationId, type) {
        const item = this.getContainer()?.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        const nameEl = item.querySelector('.business-name');
        const target = nameEl || item;
        if (!target) return;

        // Check if badge already exists
        const existing = type === 'offer'
            ? item.querySelector('.badge-offer-icon')
            : item.querySelector(`.badge-${type}`);
        if (existing) return;

        const badge = document.createElement('span');
        if (type === 'offer') {
            badge.className = 'badge-offer-icon badge-animate-in';
            badge.textContent = '💰';
        } else {
            badge.className = `badge-inline badge-${type} badge-animate-in`;
            badge.textContent = type.replace(/-/g, ' ').toUpperCase();
        }

        target.appendChild(badge);
        item.classList.add(`has-${type}`);

        // Trigger animation
        requestAnimationFrame(() => {
            badge.classList.add('badge-visible');
        });
    }

    // Remove badge with animation
    removeBadge(conversationId, type) {
        const item = this.getContainer()?.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        const badge = type === 'offer'
            ? item.querySelector('.badge-offer-icon')
            : item.querySelector(`.badge-${type}`);
        if (!badge) return;

        badge.classList.remove('badge-visible');
        badge.classList.add('badge-animate-out');

        setTimeout(() => {
            badge.remove();
            item.classList.remove(`has-${type}`);
        }, 200);
    }

    // Update unread count with animation
    updateUnreadCount(conversationId, count) {
        const item = this.getContainer()?.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        let bubble = item.querySelector('.conversation-badge');

        if (count > 0) {
            if (!bubble) {
                bubble = document.createElement('div');
                bubble.className = 'conversation-badge badge-animate-in';
                item.appendChild(bubble);
                requestAnimationFrame(() => bubble.classList.add('badge-visible'));
            }
            bubble.textContent = count;
            item.classList.add('unread');

            // No pulse animation in simplified badge style
        } else {
            if (bubble) {
                bubble.classList.add('badge-animate-out');
                setTimeout(() => bubble.remove(), 200);
            }
            item.classList.remove('unread');
        }
    }

    // Update message preview
    updatePreview(conversationId, message, time) {
        const item = this.getContainer()?.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        const preview = item.querySelector('.message-preview');
        const timeEl = item.querySelector('.conversation-time');

        if (preview) {
            preview.style.opacity = '0';
            setTimeout(() => {
                preview.textContent = message;
                preview.style.opacity = '1';
            }, 150);
        }

        if (timeEl) {
            timeEl.textContent = time || 'Just now';
        }
    }

    // Flash highlight (for any update)
    highlight(conversationId) {
        const item = this.getContainer()?.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (!item) return;

        item.classList.add('highlight-flash');
        setTimeout(() => item.classList.remove('highlight-flash'), 1000);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.ConversationAnimator = ConversationAnimator;
