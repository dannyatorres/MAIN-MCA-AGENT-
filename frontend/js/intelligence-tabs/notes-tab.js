// frontend/js/intelligence-tabs/notes-tab.js

export class NotesTab {
    constructor(parent) {
        this.parent = parent;
        this.notes = [];
        this.conversationId = null;
    }

    render(container, conversationId) {
        this.container = container;
        this.conversationId = conversationId;
        // Ensure container is relative for absolute positioning of input deck
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden'; // Stop double scrollbars

        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchNotes();
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

        // Don't wipe the list if we are just switching tabs, only if empty
        const list = document.getElementById('notesListContainer');
        if (list && list.children.length === 0) {
            list.innerHTML = `<div class="notes-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;
        }

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`);
            const data = await res.json();

            if (data.success) {
                this.notes = data.notes || [];
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

        // Render notes
        list.innerHTML = this.notes.map(n => this.getNoteItemHTML(n)).join('');

        // Auto-scroll to bottom like chat
        list.scrollTop = list.scrollHeight;
    }

    attachEventListeners() {
        const saveBtn = document.getElementById('saveNoteBtn');
        const input = document.getElementById('newNoteInput');

        // Click Handler
        if (saveBtn) {
            saveBtn.onclick = () => this.saveNote();
        }

        // Enter Key Handler (Chat Style)
        if (input) {
            input.onkeydown = (e) => {
                // Enter sends, Shift+Enter adds new line
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); // Stop new line
                    this.saveNote();
                }
            };

            // Optional: Auto-grow textarea like chat
            input.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = (this.scrollHeight) + 'px';
                if (this.value === '') this.style.height = 'auto';
            });
        }
    }

    async saveNote() {
        const input = document.getElementById('newNoteInput');
        const content = input.value.trim();

        if (!content) return;

        // Visual feedback
        const saveBtn = document.getElementById('saveNoteBtn');
        const originalIcon = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const data = await res.json();

            if (data.success) {
                input.value = '';
                input.style.height = 'auto'; // Reset height

                // Chat style: newest at bottom
                this.notes.push(data.note);
                this.renderNotesList();
            } else {
                alert('Failed to save note: ' + data.error);
            }
        } catch (err) {
            console.error('Failed to save note:', err);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalIcon;

            // Refocus input for rapid entry
            input.focus();
        }
    }
}
