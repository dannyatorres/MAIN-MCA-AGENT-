// frontend/js/intelligence-tabs/notes-tab.js

export class NotesTab {
    constructor(parent) {
        this.parent = parent;
        this.notes = [];
        this.conversationId = null;
        this.isActive = false;
        this.lastSeenCount = 0;
        this.pollInterval = null;
        this.onBadgeUpdate = null; // Callback for parent to update tab badge
    }

    render(container, conversationId) {
        this.container = container;
        this.conversationId = conversationId;
        this.isActive = true;

        // Clear badge when viewing
        this.lastSeenCount = this.notes.length;
        if (this.onBadgeUpdate) this.onBadgeUpdate(0);

        // Ensure container is relative for absolute positioning of input deck
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden'; // Stop double scrollbars

        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchNotes();
        this.startPolling();
    }

    getLayoutHTML() {
        // Chat-style layout: List on top, Floating Input Deck at bottom
        return `
            <div class="notes-tab-container">
                <div id="notesListContainer" class="notes-list">
                    <div class="notes-empty">
                        <i class="far fa-sticky-note"></i>
                        <p>No notes yet.</p>
                    </div>
                </div>

                <div class="notes-input-wrapper">
                    <textarea 
                        id="newNoteInput" 
                        class="notes-textarea" 
                        placeholder="Type a note... (Enter to send)"
                        rows="1"
                    ></textarea>
                    <button id="saveNoteBtn" class="btn-send-note" title="Save Note">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
    }

    getNoteItemHTML(note) {
        const date = new Date(note.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const author = note.created_by_name || 'System';

        return `
            <div class="note-card" data-note-id="${note.id}">
                <div class="note-meta">
                    <span class="note-author">${this.escapeHtml(author)}</span>
                    <span class="note-timestamp">${dateStr} ${timeStr}</span>
                </div>
                <div class="note-body">${this.escapeHtml(note.content)}</div>
            </div>
        `;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    async fetchNotes() {
        if (!this.conversationId) return;

        const list = document.getElementById('notesListContainer');
        if (list && list.children.length === 0) {
            list.innerHTML = `<div class="notes-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;
        }

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`);
            const data = await res.json();

            if (data.success) {
                this.notes = data.notes || [];
                this.lastSeenCount = this.notes.length;
                this.renderNotesList();
            }
        } catch (err) {
            console.error('Failed to fetch notes:', err);
        }
    }

    renderNotesList() {
        const list = document.getElementById('notesListContainer');
        if (!list) return;

        if (!this.notes.length) {
            list.innerHTML = `
                <div class="notes-empty">
                    <i class="far fa-sticky-note"></i>
                    <p>No notes yet.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notes.map(n => this.getNoteItemHTML(n)).join('');

        // Auto-scroll to bottom like chat
        list.scrollTop = list.scrollHeight;
    }

    attachEventListeners() {
        const saveBtn = document.getElementById('saveNoteBtn');
        const input = document.getElementById('newNoteInput');

        if (saveBtn) {
            saveBtn.onclick = () => this.saveNote();
        }

        if (input) {
            input.onkeydown = (e) => {
                // Enter sends, Shift+Enter adds new line
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveNote();
                }
            };

            // Auto-grow textarea like chat
            input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.value === '') this.style.height = 'auto';
            });
        }
    }

    // Call this when switching away from notes tab
    deactivate() {
        this.isActive = false;
    }

    // Call this when switching back to notes tab
    activate() {
        this.isActive = true;
        this.lastSeenCount = this.notes.length;
        if (this.onBadgeUpdate) this.onBadgeUpdate(0);
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);

        this.pollInterval = setInterval(() => {
            this.checkForNewNotes();
        }, 30000);
    }

    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    async checkForNewNotes() {
        if (!this.conversationId) return;

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`);
            const data = await res.json();

            if (data.success && data.notes) {
                const newCount = data.notes.length;
                const unseenCount = newCount - this.lastSeenCount;

                if (unseenCount > 0) {
                    this.notes = data.notes;

                    if (this.isActive) {
                        this.renderNotesList();
                        this.lastSeenCount = newCount;
                        if (this.onBadgeUpdate) this.onBadgeUpdate(0);
                    } else {
                        if (this.onBadgeUpdate) this.onBadgeUpdate(unseenCount);
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check for new notes:', err);
        }
    }

    // Clean up when conversation changes
    destroy() {
        this.stopPolling();
        this.notes = [];
        this.lastSeenCount = 0;
    }

    async saveNote() {
        const input = document.getElementById('newNoteInput');
        const content = input.value.trim();

        if (!content) return;

        // Clear input immediately (chat-style UX)
        input.value = '';
        input.style.height = 'auto';

        // Create optimistic note
        const tempId = 'temp-' + Date.now();
        const optimisticNote = {
            id: tempId,
            content,
            created_at: new Date().toISOString(),
            created_by_name: window.currentUser?.name || 'You'
        };

        // Add to UI immediately
        this.notes.push(optimisticNote);
        this.renderNotesList();

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const data = await res.json();

            if (data.success) {
                const idx = this.notes.findIndex(n => n.id === tempId);
                if (idx !== -1) {
                    this.notes[idx] = data.note;
                }
                if (this.isActive) {
                    this.lastSeenCount = this.notes.length;
                    if (this.onBadgeUpdate) this.onBadgeUpdate(0);
                }
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error('Failed to save note:', err);

            // Remove failed note and restore input
            this.notes = this.notes.filter(n => n.id !== tempId);
            this.renderNotesList();
            input.value = content;

            // Brief error indicator
            input.classList.add('input-error');
            setTimeout(() => input.classList.remove('input-error'), 1500);
        }

        input.focus();
    }
}
