// routes/lookups.js - HANDLES: States, industries, etc. for dropdowns
// URLs like: /api/lookups

const express = require('express');
const router = express.Router();

// Get all lookup data (states, industries, etc.)
router.get('/', (req, res) => {
    const lookups = {
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
        industries: [
            'Retail',
            'Restaurant',
            'Construction',
            'Healthcare',
            'Professional Services',
            'Manufacturing',
            'Transportation',
            'Real Estate',
            'Technology',
            'Wholesale',
            'Agriculture',
            'Education',
            'Entertainment',
            'Hospitality',
            'Financial Services',
            'Legal Services',
            'Marketing/Advertising',
            'Auto Services',
            'Beauty/Salon',
            'Fitness',
            'E-commerce',
            'Consulting',
            'Other'
        ],
        priorities: [
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
            { value: 'urgent', label: 'Urgent' }
        ],
        conversation_states: [
            { value: 'NEW', label: 'New' },
            { value: 'ACTIVE', label: 'Active' },
            { value: 'QUALIFIED', label: 'Qualified' },
            { value: 'SUBMITTED', label: 'Submitted' },
            { value: 'FUNDED', label: 'Funded' },
            { value: 'DEAD', label: 'Dead/Cold' },
            { value: 'PAUSED', label: 'Paused' }
        ],
        conversation_steps: [
            { value: 'initial_contact', label: 'Initial Contact' },
            { value: 'qualifying', label: 'Qualifying' },
            { value: 'gathering_docs', label: 'Gathering Documents' },
            { value: 'fcs_analysis', label: 'FCS Analysis' },
            { value: 'fcs_completed', label: 'FCS Completed' },
            { value: 'lender_matching', label: 'Lender Matching' },
            { value: 'lender_qualification_completed', label: 'Lender Qualification Completed' },
            { value: 'presenting_offer', label: 'Presenting Offer' },
            { value: 'application_submitted', label: 'Application Submitted' },
            { value: 'awaiting_approval', label: 'Awaiting Approval' },
            { value: 'approved', label: 'Approved' },
            { value: 'funded', label: 'Funded' },
            { value: 'marked_dead', label: 'Marked Dead' }
        ],
        document_types: [
            { value: 'bank_statement', label: 'Bank Statement' },
            { value: 'tax_return', label: 'Tax Return' },
            { value: 'drivers_license', label: 'Driver\'s License' },
            { value: 'voided_check', label: 'Voided Check' },
            { value: 'business_license', label: 'Business License' },
            { value: 'credit_report', label: 'Credit Report' },
            { value: 'financial_statement', label: 'Financial Statement' },
            { value: 'other', label: 'Other' }
        ],
        message_types: [
            { value: 'sms', label: 'SMS' },
            { value: 'email', label: 'Email' },
            { value: 'internal_note', label: 'Internal Note' },
            { value: 'system', label: 'System' }
        ],
        lender_tiers: [
            { value: 'A', label: 'Tier A' },
            { value: 'B', label: 'Tier B' },
            { value: 'C', label: 'Tier C' },
            { value: 'D', label: 'Tier D' }
        ]
    };

    res.json({
        success: true,
        lookups: lookups
    });
});

// Get states only
router.get('/states', (req, res) => {
    const states = [
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
    ];

    res.json({
        success: true,
        states: states
    });
});

// Get industries only
router.get('/industries', (req, res) => {
    const industries = [
        'Retail',
        'Restaurant',
        'Construction',
        'Healthcare',
        'Professional Services',
        'Manufacturing',
        'Transportation',
        'Real Estate',
        'Technology',
        'Wholesale',
        'Agriculture',
        'Education',
        'Entertainment',
        'Hospitality',
        'Financial Services',
        'Legal Services',
        'Marketing/Advertising',
        'Auto Services',
        'Beauty/Salon',
        'Fitness',
        'E-commerce',
        'Consulting',
        'Other'
    ];

    res.json({
        success: true,
        industries: industries
    });
});

module.exports = router;
