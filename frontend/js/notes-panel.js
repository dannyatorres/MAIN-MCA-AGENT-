// frontend/js/notes-panel.js
// Dead simple notes panel - no class lifecycle

window.NotesPanel = {
    conversationId: null,
    notes: [],

    init() {
        const sendBtn = document.getElementById('notesSendBtn');
        const input = document.getElementById('notesInput');

        if (sendBtn) sendBtn.onclick = () => this.saveNote();
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.saveNote();
                }
            };
        }
        console.log('📝 NotesPanel initialized');
    },

    async load(conversationId) {
        if (!conversationId) return;

        this.conversationId = conversationId;
        this.notes = [];

        const list = document.getElementById('notesList');
        if (list) {
            list.innerHTML = `<div class="notes-empty"><i class="fas fa-spinner fa-spin"></i><p>Loading...</p></div>`;
        }

        try {
            const res = await fetch(`/api/notes/${conversationId}`);
            const data = await res.json();

            if (this.conversationId !== conversationId) return;

            if (data.success) {
                this.notes = data.notes || [];
                this.render();
            }
        } catch (err) {
            console.error('Failed to load notes:', err);
            if (list) {
                list.innerHTML = `<div class="notes-empty"><i class="fas fa-exclamation-triangle"></i><p>Failed to load</p></div>`;
            }
        }
    },

    clear() {
        this.conversationId = null;
        this.notes = [];
        const list = document.getElementById('notesList');
        if (list) {
            list.innerHTML = `<div class="notes-empty"><i class="far fa-sticky-note"></i><p>No notes yet.</p></div>`;
        }
    },

    render() {
        const list = document.getElementById('notesList');
        if (!list) return;

        if (!this.notes.length) {
            list.innerHTML = `<div class="notes-empty"><i class="far fa-sticky-note"></i><p>No notes yet.</p></div>`;
            return;
        }

        list.innerHTML = this.notes.map(note => this.getNoteHTML(note)).join('');
        list.scrollTop = list.scrollHeight;
    },

    getNoteHTML(note) {
        const isPending = String(note.id).startsWith('temp-');
        const date = new Date(note.created_at);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const author = note.created_by_name || 'System';
        const source = note.source || 'user';

        return `
            <div class="note-card ${isPending ? 'note-pending' : ''} note-source-${source}" data-note-id="${note.id}">
                <div class="note-meta">
                    <span class="note-author">${this.escapeHtml(author)}</span>
                    <span class="note-timestamp">${isPending ? '<i class="fas fa-circle-notch fa-spin"></i>' : `${dateStr} ${timeStr}`}</span>
                </div>
                <div class="note-body">${this.escapeHtml(note.content)}</div>
            </div>
        `;
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    },

    appendNote(data) {
        if (!data || data.conversationId !== this.conversationId) return;

        const exists = this.notes.some(n => n.id === data.note.id);
        if (!exists) {
            this.notes.push(data.note);
            this.render();
        }
    },

    async saveNote() {
        const input = document.getElementById('notesInput');
        const content = input?.value.trim();
        if (!content || !this.conversationId) return;

        input.value = '';

        const tempId = 'temp-' + Date.now();
        const optimisticNote = {
            id: tempId,
            content,
            created_at: new Date().toISOString(),
            created_by_name: window.currentUser?.name || 'You',
            source: 'user'
        };
        this.notes.push(optimisticNote);
        this.render();

        try {
            const res = await fetch(`/api/notes/${this.conversationId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });
            const data = await res.json();

            if (data.success) {
                const idx = this.notes.findIndex(n => n.id === tempId);
                if (idx !== -1) this.notes[idx] = data.note;
                this.render();
            } else {
                throw new Error(data.error);
            }
        } catch (err) {
            console.error('Failed to save note:', err);
            this.notes = this.notes.filter(n => n.id !== tempId);
            this.render();
            input.value = content;
            alert('Failed to send note');
        }
        input?.focus();
    }
};

document.addEventListener('DOMContentLoaded', () => NotesPanel.init());
