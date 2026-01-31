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
        this.container.style.overflowY = 'hidden';
        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchNotes();
    }

    getLayoutHTML() {
        return `
            <div class="notes-tab-container">
                <div class="notes-input-wrapper">
                    <textarea 
                        id="newNoteInput" 
                        class="notes-textarea" 
                        placeholder="Type a new note here..."
                    ></textarea>
                    <div class="notes-actions">
                        <button id="saveNoteBtn" class="btn-add-note">
                            <i class="fas fa-plus"></i> Add Note
                        </button>
                    </div>
                </div>

                <div id="notesListContainer" class="notes-list">
                    <div class="notes-empty">
                        <i class="far fa-sticky-note"></i>
                        <p>No notes yet. Add one above!</p>
                    </div>
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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    async fetchNotes() {
        if (!this.conversationId) return;
        const list = document.getElementById('notesListContainer');
        if (list) {
            list.innerHTML = `<div class="notes-empty"><i class="far fa-sticky-note"></i><p>Loading...</p></div>`;
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
                    <p>No notes yet. Add one above!</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notes.map(n => this.getNoteItemHTML(n)).join('');
    }

    attachEventListeners() {
        const saveBtn = document.getElementById('saveNoteBtn');
        if (saveBtn) saveBtn.onclick = () => this.saveNote();

        const input = document.getElementById('newNoteInput');
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    this.saveNote();
                }
            };
        }
    }

    async saveNote() {
        const input = document.getElementById('newNoteInput');
        const content = input.value.trim();

        if (!content) return;

        const saveBtn = document.getElementById('saveNoteBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const data = await res.json();

            if (data.success) {
                input.value = '';
                this.notes.unshift(data.note);
                this.renderNotesList();
            } else {
                alert('Failed to save note: ' + data.error);
            }
        } catch (err) {
            console.error('Failed to save note:', err);
            alert('Network error saving note.');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-plus"></i> Add Note';
        }
    }
}
