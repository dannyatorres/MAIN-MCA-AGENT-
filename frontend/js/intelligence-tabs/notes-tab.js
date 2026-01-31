// frontend/js/intelligence-tabs/notes-tab.js

export class NotesTab {
    constructor(parent) {
        this.parent = parent;
        this.notes = [];
        this.conversationId = null;
        this.isActive = false;
        this.lastSeenCount = 0;
        this.pollInterval = null;
        this.onBadgeUpdate = null;
    }

    render(container, conversationId) {
        this.container = container;
        this.conversationId = conversationId;
        this.isActive = true;

        // Ensure container handles absolute positioning
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';

        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchNotes();
        this.startPolling();
    }

    getLayoutHTML() {
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
        // Fallback to 'System' only if truly missing
        const author = note.created_by_name || 'System';

        return `
            <div class="note-card" id="note-${note.id}" data-note-id="${note.id}">
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
        try {
            const res = await fetch(`/api/notes/${this.conversationId}`);
            const data = await res.json();
            if (data.success) {
                this.notes = data.notes || [];
                this.renderNotesList(true); // true = force full render
                this.updateBadgeState();
            }
        } catch (err) {
            console.error('Failed to fetch notes:', err);
        }
    }

    // FIX: Smart rendering and scroll management
    renderNotesList(fullRender = false) {
        const list = document.getElementById('notesListContainer');
        if (!list) return;

        if (!this.notes.length) {
            list.innerHTML = `<div class="notes-empty"><i class="far fa-sticky-note"></i><p>No notes yet.</p></div>`;
            return;
        }

        // Check if user is near bottom BEFORE updating (tolerance 50px)
        const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 50;

        if (fullRender || list.querySelector('.notes-empty')) {
            // Full rebuild
            list.innerHTML = this.notes.map(n => this.getNoteItemHTML(n)).join('');
        } else {
            // Append only missing notes
            const existingIds = new Set(Array.from(list.children).map(el => el.dataset.noteId));
            const newFragment = document.createDocumentFragment();
            let hasNew = false;

            this.notes.forEach(note => {
                if (!existingIds.has(String(note.id))) {
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = this.getNoteItemHTML(note);
                    newFragment.appendChild(tempDiv.firstElementChild);
                    hasNew = true;
                }
            });

            if (hasNew) list.appendChild(newFragment);
        }

        // Scroll to bottom only if user was already there or it's a full load
        if (fullRender || wasAtBottom) {
            list.scrollTop = list.scrollHeight;
        }
    }

    attachEventListeners() {
        const saveBtn = document.getElementById('saveNoteBtn');
        const input = document.getElementById('newNoteInput');

        if (saveBtn) saveBtn.onclick = () => this.saveNote();
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveNote();
                }
            };
            input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.value === '') this.style.height = 'auto';
            });
        }
    }

    deactivate() {
        this.isActive = false;
    }

    activate() {
        this.isActive = true;
        this.updateBadgeState();
        // Scroll to bottom on activation
        const list = document.getElementById('notesListContainer');
        if (list) list.scrollTop = list.scrollHeight;
    }

    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.checkForNewNotes(), 10000); // Reduced to 10s for responsiveness
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
                const serverNotes = data.notes;

                // FIX: Better change detection (ID based)
                const localIds = new Set(this.notes.map(n => n.id));
                const hasNew = serverNotes.some(n => !localIds.has(n.id));

                if (hasNew || serverNotes.length !== this.notes.length) {
                    this.notes = serverNotes;
                    if (this.isActive) {
                        this.renderNotesList(false); // Smart append
                        this.updateBadgeState();
                    } else {
                        const unseen = this.notes.length - this.lastSeenCount;
                        if (this.onBadgeUpdate) this.onBadgeUpdate(unseen > 0 ? unseen : 0);
                    }
                }
            }
        } catch (err) {
            console.error('Polling error:', err);
        }
    }

    updateBadgeState() {
        this.lastSeenCount = this.notes.length;
        if (this.onBadgeUpdate) this.onBadgeUpdate(0);
    }

    destroy() {
        this.stopPolling();
        this.notes = [];
        this.lastSeenCount = 0;
    }

    async saveNote() {
        const input = document.getElementById('newNoteInput');
        const content = input.value.trim();
        if (!content) return;

        input.value = '';
        input.style.height = 'auto';

        const tempId = 'temp-' + Date.now();
        const optimisticNote = {
            id: tempId,
            content,
            created_at: new Date().toISOString(),
            created_by_name: window.currentUser?.name || 'You'
        };

        this.notes.push(optimisticNote);
        this.renderNotesList(false);
        // Force scroll for own message
        const list = document.getElementById('notesListContainer');
        if (list) list.scrollTop = list.scrollHeight;

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
                    // Update the temp note with real data
                    this.notes[idx] = data.note;

                    // Update the DOM element ID without full re-render
                    const tempEl = document.querySelector(`[data-note-id="${tempId}"]`);
                    if (tempEl) {
                        tempEl.setAttribute('data-note-id', data.note.id);
                        tempEl.id = `note-${data.note.id}`;
                    }
                }
                this.updateBadgeState();
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error('Failed to save note:', err);
            // Revert on failure
            this.notes = this.notes.filter(n => n.id !== tempId);
            this.renderNotesList(true);
            input.value = content;
            alert("Failed to send note. Please try again.");
        }
        input.focus();
    }
}
