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
        this.container.innerHTML = this.getLayoutHTML();
        this.attachEventListeners();
        this.fetchNotes();
    }

    getLayoutHTML() {
        return `
            <div class="notes-tab-container">
                <div class="notes-toolbar">
                    <span class="notes-title">Notes</span>
                    <button id="refreshNotesBtn" class="btn-notes-tool" title="Refresh">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>

                <div class="notes-input-area">
                    <textarea id="newNoteInput" class="notes-textarea" placeholder="Add a note..."></textarea>
                    <button id="saveNoteBtn" class="btn-save-note">
                        <i class="fas fa-plus"></i> Add Note
                    </button>
                </div>

                <div id="notesList" class="notes-list">
                    <div class="notes-loading"><i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i> Loading...</div>
                </div>
            </div>
        `;
    }

    getNoteItemHTML(note) {
        const date = new Date(note.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

        return `
            <div class="note-item" data-note-id="${note.id}">
                <div class="note-header">
                    <span class="note-date">${dateStr} at ${timeStr}</span>
                    <button class="note-delete-btn" data-note-id="${note.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="note-content">${this.escapeHtml(note.content)}</div>
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

        const refreshBtn = document.getElementById('refreshNotesBtn');
        if (refreshBtn) refreshBtn.querySelector('i').classList.add('fa-spin');

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`);
            const data = await res.json();

            if (data.success) {
                this.notes = data.notes || [];
                this.renderNotesList();
            }
        } catch (err) {
            console.error('Failed to fetch notes:', err);
        } finally {
            if (refreshBtn) refreshBtn.querySelector('i').classList.remove('fa-spin');
        }
    }

    renderNotesList() {
        const list = document.getElementById('notesList');
        if (!list) return;

        if (!this.notes.length) {
            list.innerHTML = `
                <div class="notes-empty-state">
                    <i class="fas fa-sticky-note"></i>
                    <p>No notes yet</p>
                </div>
            `;
            return;
        }

        list.innerHTML = this.notes.map(n => this.getNoteItemHTML(n)).join('');
        this.attachNoteItemListeners();
    }

    attachEventListeners() {
        const refreshBtn = document.getElementById('refreshNotesBtn');
        if (refreshBtn) refreshBtn.onclick = () => this.fetchNotes();

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

    attachNoteItemListeners() {
        document.querySelectorAll('.note-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deleteNote(btn.dataset.noteId);
            };
        });
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

    async deleteNote(noteId) {
        if (!confirm('Delete this note?')) return;

        try {
            await fetch(`/api/notes/${noteId}`, { method: 'DELETE' });
            this.notes = this.notes.filter(n => n.id !== noteId);
            this.renderNotesList();
        } catch (err) {
            console.error('Failed to delete note:', err);
        }
    }
}
