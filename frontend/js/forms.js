// js/forms.js
import { Formatters, Validators } from './formatters.js';

/**
 * Form Manager
 * Handles scraping data from inputs, populating inputs, and clearing forms.
 */
export const FormManager = {

    // ============================================================
    //  ADD LEAD FORM (New Lead)
    // ============================================================

    /**
     * Scrapes data from the "Add Lead" modal
     */
    getNewLeadData() {
        const getVal = (id) => document.getElementById(id)?.value || '';
        const getBool = (id) => document.getElementById(id)?.checked || false;

        // Marketing Preferences
        const marketingVal = document.querySelector('input[name="marketingNotification"]:checked')?.value || 'BOTH';

        const data = {
            companyName: getVal('companyName'),
            dbaName: getVal('dbaName'),
            firstName: getVal('firstName'),
            lastName: getVal('lastName'),
            // Clean the phone numbers using our Formatter
            primaryPhone: Formatters.strip(getVal('primaryPhone')),
            cellPhone: Formatters.strip(getVal('cellPhone')),
            workPhone: Formatters.strip(getVal('workPhone')),
            businessEmail: getVal('businessEmail'),

            // Business Details
            federalTaxId: Formatters.strip(getVal('federalTaxId')),
            businessAddress: getVal('businessAddress'),
            businessCity: getVal('businessCity'),
            businessState: getVal('businessState'),
            businessZip: getVal('businessZip'),
            entityType: getVal('entityType'),
            industryType: getVal('industryType'),

            // Financials
            requestedAmount: Formatters.strip(getVal('requestedAmount')),
            annualRevenue: Formatters.strip(getVal('annualRevenue')),
            monthlyRevenue: Formatters.strip(getVal('monthlyRevenue')),

            // Meta
            leadSource: getVal('leadSource'),
            assignedTo: getVal('assignedTo'),
            marketing_opt_text: marketingVal === 'TEXT' || marketingVal === 'BOTH',
            marketing_opt_email: marketingVal === 'EMAIL' || marketingVal === 'BOTH',

            // Owner 1
            owner1: {
                firstName: getVal('owner1FirstName'),
                lastName: getVal('owner1LastName'),
                email: getVal('owner1Email'),
                ssn: Formatters.strip(getVal('owner1SSN')),
                dateOfBirth: getVal('owner1DateOfBirth'),
                ownershipPercentage: getVal('owner1OwnershipPercentage'),
                homeAddress: getVal('owner1HomeAddress'),
                homeState: getVal('owner1HomeState'),
                homeCity: getVal('owner1HomeCity'),
                homeZip: getVal('owner1HomeZip')
            }
        };

        // Add Owner 2 if checked
        if (getBool('addSecondOwner')) {
            data.owner2 = {
                firstName: getVal('owner2FirstName'),
                lastName: getVal('owner2LastName'),
                email: getVal('owner2Email'),
                ssn: Formatters.strip(getVal('owner2SSN')),
                dateOfBirth: getVal('owner2DateOfBirth'),
                ownershipPercentage: getVal('owner2OwnershipPercentage'),
                homeAddress: getVal('owner2HomeAddress'),
                homeState: getVal('owner2HomeState'),
                homeCity: getVal('owner2HomeCity'),
                homeZip: getVal('owner2HomeZip')
            };
        }

        return data;
    },

    /**
     * Validates the New Lead data
     * Returns array of error strings (empty if valid)
     */
    validateNewLead(data) {
        const errors = [];

        if (!Validators.required(data.companyName)) errors.push('Company Name is required');
        if (!Validators.required(data.primaryPhone)) errors.push('Primary Phone is required');

        if (data.businessEmail && !Validators.email(data.businessEmail)) {
            errors.push('Invalid Business Email');
        }

        return errors;
    },

    /**
     * Clears the Add Lead modal inputs
     */
    clearNewLeadForm() {
        const modal = document.getElementById('addLeadModal');
        if (!modal) return;

        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'checkbox') input.checked = false;
            else if (input.type === 'radio') input.checked = (input.value === 'BOTH');
            else input.value = '';
        });

        // Reset specific UI states
        const owner2Section = document.getElementById('owner2Info');
        if (owner2Section) owner2Section.style.display = 'none';
    },

    // ============================================================
    //  EDIT LEAD FORM
    // ============================================================

    /**
     * Populates the Edit Form with existing data
     */
    populateEditForm(conversation) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        // Basic Info
        setVal('editCompanyName', conversation.business_name);
        setVal('editDbaName', conversation.dba_name);
        setVal('editPrimaryPhone', Formatters.phone(conversation.lead_phone)); // Format for display
        setVal('editBusinessPhone', Formatters.phone(conversation.business_phone));
        setVal('editWebsite', conversation.website);
        setVal('editTaxId', conversation.tax_id); // Keep hidden/encrypted usually

        // Dropdowns
        setVal('editEntityType', conversation.entity_type_id || conversation.entity_type);
        setVal('editIndustryType', conversation.industry_type_id || conversation.industry_type);
        setVal('editLeadSource', conversation.lead_source_id || conversation.lead_source);

        // Financials
        setVal('editRequestedAmount', conversation.requested_amount);
        setVal('editMonthlyRevenue', conversation.monthly_revenue);
        setVal('editAnnualRevenue', conversation.annual_revenue);
        setVal('editTimeInBusiness', conversation.time_in_business_months);

        // Address
        setVal('editBusinessAddress', conversation.address);
        setVal('editBusinessCity', conversation.city);
        setVal('editBusinessState', conversation.state);
        setVal('editBusinessZip', conversation.zip);

        // Marketing Radio Buttons
        const marketingRadios = document.querySelectorAll('input[name="editMarketingNotification"]');
        marketingRadios.forEach(radio => {
            if (conversation.marketing_opt_text && conversation.marketing_opt_email) {
                radio.checked = (radio.value === 'BOTH');
            } else if (conversation.marketing_opt_text) {
                radio.checked = (radio.value === 'TEXT');
            } else if (conversation.marketing_opt_email) {
                radio.checked = (radio.value === 'EMAIL');
            } else {
                radio.checked = (radio.value === 'BOTH'); // Default
            }
        });

        // Note: Owners are usually populated via a separate logic or loop,
        // but here we map the primary owner fields if they exist in the flat conversation object
        setVal('editOwner1SSN', conversation.ssn);
        if (conversation.date_of_birth) {
             setVal('editOwner1DOB', conversation.date_of_birth.split('T')[0]);
        }
    },

    /**
     * Scrapes data from the "Edit Lead" modal
     */
    getEditLeadData() {
        const getVal = (id) => document.getElementById(id)?.value || '';
        const marketingPref = document.querySelector('input[name="editMarketingNotification"]:checked')?.value || 'BOTH';

        const data = {
            business_name: getVal('editCompanyName'),
            dba_name: getVal('editDbaName'),
            lead_phone: Formatters.strip(getVal('editPrimaryPhone')),
            business_phone: Formatters.strip(getVal('editBusinessPhone')),
            website: getVal('editWebsite'),
            tax_id_encrypted: Formatters.strip(getVal('editTaxId')),

            entity_type_id: getVal('editEntityType'),
            industry_type_id: getVal('editIndustryType'),
            lead_source_id: getVal('editLeadSource'),

            requested_amount: Formatters.strip(getVal('editRequestedAmount')),
            monthly_revenue: Formatters.strip(getVal('editMonthlyRevenue')),
            annual_revenue: Formatters.strip(getVal('editAnnualRevenue')),
            time_in_business_months: getVal('editTimeInBusiness'),

            address: getVal('editBusinessAddress'),
            city: getVal('editBusinessCity'),
            state: getVal('editBusinessState'),
            zip: getVal('editBusinessZip'),

            notes: getVal('editNotes'),

            marketing_opt_text: marketingPref === 'TEXT' || marketingPref === 'BOTH',
            marketing_opt_email: marketingPref === 'EMAIL' || marketingPref === 'BOTH',

            owners: [] // Populate this if you have specific owner fields in the edit modal
        };

        // Basic Owner 1 scraping for the edit form
        const o1First = getVal('editOwner1FirstName');
        const o1Last = getVal('editOwner1LastName');

        if (o1First || o1Last) {
            data.owners.push({
                first_name: o1First,
                last_name: o1Last,
                email: getVal('editOwner1Email'),
                ssn_encrypted: Formatters.strip(getVal('editOwner1SSN')),
                address: getVal('editOwner1HomeAddress'),
                state: getVal('editOwner1HomeState'),
                city: getVal('editOwner1HomeCity'),
                zip: getVal('editOwner1HomeZip'),
                ownership_percentage: getVal('editOwner1Ownership')
            });
        }

        return data;
    },

    clearEditForm() {
        const modal = document.getElementById('editLeadModal');
        if (!modal) return;

        const inputs = modal.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            if (input.type === 'radio') input.checked = (input.value === 'BOTH' && input.name === 'editMarketingNotification');
            else if (input.type === 'checkbox') input.checked = false;
            else input.value = '';
        });
    }
};
