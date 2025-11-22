// js/lookups.js
import { ApiService } from './api.js';

export const LookupManager = {
    data: {
        states: [],
        entityTypes: [],
        industryTypes: [],
        leadSources: [],
        users: []
    },

    async init() {
        console.log('🔧 LookupManager: Initializing...');
        await this.loadData();
        this.populateAllDropdowns();
    },

    async loadData() {
        try {
            // Uncomment when backend endpoint is ready:
            // const apiData = await ApiService.get('/api/lookups');
            // this.data = apiData;
            console.log('🔧 LookupManager: Using static default data');
            this.data = DEFAULT_DATA;
        } catch (error) {
            console.error('❌ LookupManager: Failed to load data', error);
            this.data = DEFAULT_DATA;
        }
    },

    populateAllDropdowns() {
        this.populateStates();
        this.populateEntities();
        this.populateIndustries();
        this.populateSources();
        this.populateUsers();
    },

    populateStates() {
        const ids = ['businessState', 'stateOfIncorporation', 'owner1HomeState', 'owner2HomeState', 'editBusinessState', 'editOwner1HomeState', 'editOwner2HomeState'];
        this._fillSelects(ids, this.data.states, (item) => `<option value="${item.code}">${item.name}</option>`);
    },

    populateEntities() {
        const ids = ['entityType', 'editEntityType'];
        this._fillSelects(ids, this.data.entityTypes, (item) => `<option value="${item.name}">${item.name}</option>`);
    },

    populateIndustries() {
        const ids = ['industryType', 'editIndustryType'];
        this._fillSelects(ids, this.data.industryTypes, (item) => `<option value="${item.name}">${item.name}</option>`);
    },

    populateSources() {
        const ids = ['leadSource', 'editLeadSource'];
        this._fillSelects(ids, this.data.leadSources, (item) => `<option value="${item.name}">${item.name}</option>`);
    },

    populateUsers() {
        const ids = ['assignedTo'];
        this._fillSelects(ids, this.data.users, (item) => `<option value="${item.first_name} ${item.last_name}">${item.first_name} ${item.last_name}</option>`);
    },

    _fillSelects(elementIds, dataArray, optionTemplateFn) {
        if (!dataArray || !Array.isArray(dataArray)) return;
        elementIds.forEach(id => {
            const select = document.getElementById(id);
            if (select) {
                const firstOption = select.options[0] ? select.options[0].outerHTML : '<option value="">Select...</option>';
                select.innerHTML = firstOption + dataArray.map(optionTemplateFn).join('');
            }
        });
    }
};

const DEFAULT_DATA = {
    states: [
        { code: 'AL', name: 'Alabama' },
        { code: 'AK', name: 'Alaska' },
        { code: 'AZ', name: 'Arizona' },
        { code: 'AR', name: 'Arkansas' },
        { code: 'CA', name: 'California' },
        { code: 'CO', name: 'Colorado' },
        { code: 'CT', name: 'Connecticut' },
        { code: 'DE', name: 'Delaware' },
        { code: 'FL', name: 'Florida' },
        { code: 'GA', name: 'Georgia' },
        { code: 'HI', name: 'Hawaii' },
        { code: 'ID', name: 'Idaho' },
        { code: 'IL', name: 'Illinois' },
        { code: 'IN', name: 'Indiana' },
        { code: 'IA', name: 'Iowa' },
        { code: 'KS', name: 'Kansas' },
        { code: 'KY', name: 'Kentucky' },
        { code: 'LA', name: 'Louisiana' },
        { code: 'ME', name: 'Maine' },
        { code: 'MD', name: 'Maryland' },
        { code: 'MA', name: 'Massachusetts' },
        { code: 'MI', name: 'Michigan' },
        { code: 'MN', name: 'Minnesota' },
        { code: 'MS', name: 'Mississippi' },
        { code: 'MO', name: 'Missouri' },
        { code: 'MT', name: 'Montana' },
        { code: 'NE', name: 'Nebraska' },
        { code: 'NV', name: 'Nevada' },
        { code: 'NH', name: 'New Hampshire' },
        { code: 'NJ', name: 'New Jersey' },
        { code: 'NM', name: 'New Mexico' },
        { code: 'NY', name: 'New York' },
        { code: 'NC', name: 'North Carolina' },
        { code: 'ND', name: 'North Dakota' },
        { code: 'OH', name: 'Ohio' },
        { code: 'OK', name: 'Oklahoma' },
        { code: 'OR', name: 'Oregon' },
        { code: 'PA', name: 'Pennsylvania' },
        { code: 'RI', name: 'Rhode Island' },
        { code: 'SC', name: 'South Carolina' },
        { code: 'SD', name: 'South Dakota' },
        { code: 'TN', name: 'Tennessee' },
        { code: 'TX', name: 'Texas' },
        { code: 'UT', name: 'Utah' },
        { code: 'VT', name: 'Vermont' },
        { code: 'VA', name: 'Virginia' },
        { code: 'WA', name: 'Washington' },
        { code: 'WV', name: 'West Virginia' },
        { code: 'WI', name: 'Wisconsin' },
        { code: 'WY', name: 'Wyoming' }
    ],
    entityTypes: [
        { id: 1, name: 'Corporation' },
        { id: 2, name: 'LLC' },
        { id: 3, name: 'Partnership' },
        { id: 4, name: 'Sole Proprietorship' },
        { id: 5, name: 'Non-Profit' }
    ],
    industryTypes: [
        { id: 1, name: 'Construction' },
        { id: 2, name: 'Restaurant' },
        { id: 3, name: 'Retail' },
        { id: 4, name: 'Professional Services' },
        { id: 5, name: 'Healthcare' },
        { id: 6, name: 'Manufacturing' },
        { id: 7, name: 'Transportation' },
        { id: 8, name: 'Wholesale' },
        { id: 9, name: 'Technology' },
        { id: 10, name: 'Other' }
    ],
    leadSources: [
        { id: 1, name: 'Google Ads' },
        { id: 2, name: 'Referral' },
        { id: 3, name: 'Website' },
        { id: 4, name: 'Cold Call' },
        { id: 5, name: 'Email Campaign' },
        { id: 6, name: 'Trade Show' },
        { id: 7, name: 'Social Media' }
    ],
    users: [
        { id: 1, first_name: 'John', last_name: 'Smith' },
        { id: 2, first_name: 'Sarah', last_name: 'Johnson' },
        { id: 3, first_name: 'Mike', last_name: 'Davis' }
    ]
};
