// frontend/js/intelligence-tabs/edit-tab.js
import { LeadFormController } from '../lead-form-controller.js';

export class EditTab {
    constructor(parent) {
        this.parent = parent;
        // We initialize the Controller here so it's ready to work
        this.controller = new LeadFormController(parent);
    }

    // The Manager calls this when the tab is clicked
    // We override the standard behavior to open a modal instead
    openEditModal(conversation) {
        this.controller.openEditModal(conversation);
    }

    // Also expose the "Create" function so we can use it for the "+" button
    openCreateModal() {
        this.controller.openCreateModal();
    }

    // Standard Render (Fallback if we ever wanted it in the panel)
    render(container) {
        this.controller.renderEditTab(container);
    }
}
