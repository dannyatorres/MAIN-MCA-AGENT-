// Standalone New Lead Form Generator
// This creates the exact same form as the Intelligence tab's Edit Lead function

function generateNewLeadForm() {
    const usStates = [
        { value: '', label: 'Select State...' },
        { value: 'AL', label: 'Alabama' },
        { value: 'AK', label: 'Alaska' },
        { value: 'AZ', label: 'Arizona' },
        { value: 'AR', label: 'Arkansas' },
        { value: 'CA', label: 'California' },
        { value: 'CO', label: 'Colorado' },
        { value: 'CT', label: 'Connecticut' },
        { value: 'DE', label: 'Delaware' },
        { value: 'FL', label: 'Florida' },
        { value: 'GA', label: 'Georgia' },
        { value: 'HI', label: 'Hawaii' },
        { value: 'ID', label: 'Idaho' },
        { value: 'IL', label: 'Illinois' },
        { value: 'IN', label: 'Indiana' },
        { value: 'IA', label: 'Iowa' },
        { value: 'KS', label: 'Kansas' },
        { value: 'KY', label: 'Kentucky' },
        { value: 'LA', label: 'Louisiana' },
        { value: 'ME', label: 'Maine' },
        { value: 'MD', label: 'Maryland' },
        { value: 'MA', label: 'Massachusetts' },
        { value: 'MI', label: 'Michigan' },
        { value: 'MN', label: 'Minnesota' },
        { value: 'MS', label: 'Mississippi' },
        { value: 'MO', label: 'Missouri' },
        { value: 'MT', label: 'Montana' },
        { value: 'NE', label: 'Nebraska' },
        { value: 'NV', label: 'Nevada' },
        { value: 'NH', label: 'New Hampshire' },
        { value: 'NJ', label: 'New Jersey' },
        { value: 'NM', label: 'New Mexico' },
        { value: 'NY', label: 'New York' },
        { value: 'NC', label: 'North Carolina' },
        { value: 'ND', label: 'North Dakota' },
        { value: 'OH', label: 'Ohio' },
        { value: 'OK', label: 'Oklahoma' },
        { value: 'OR', label: 'Oregon' },
        { value: 'PA', label: 'Pennsylvania' },
        { value: 'RI', label: 'Rhode Island' },
        { value: 'SC', label: 'South Carolina' },
        { value: 'SD', label: 'South Dakota' },
        { value: 'TN', label: 'Tennessee' },
        { value: 'TX', label: 'Texas' },
        { value: 'UT', label: 'Utah' },
        { value: 'VT', label: 'Vermont' },
        { value: 'VA', label: 'Virginia' },
        { value: 'WA', label: 'Washington' },
        { value: 'WV', label: 'West Virginia' },
        { value: 'WI', label: 'Wisconsin' },
        { value: 'WY', label: 'Wyoming' }
    ];

    const stateOptions = usStates.map(state =>
        `<option value="${state.value}">${state.label}</option>`
    ).join('');

    return `
        <div class="edit-form-container">
            <form class="edit-lead-form" id="newLeadForm">

                <div class="form-section">
                    <h4>Business Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Company Name</label>
                            <input type="text" name="businessName" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>DBA</label>
                            <input type="text" name="dbaName" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Business Address</label>
                            <input type="text" name="businessAddress" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Address Line 2</label>
                            <input type="text" name="businessAddress2" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>City</label>
                            <input type="text" name="businessCity" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>State</label>
                            <select name="businessState" class="form-input">
                                ${stateOptions}
                            </select>
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>ZIP Code</label>
                            <input type="text" name="businessZip" class="form-input" maxlength="10" placeholder="12345">
                        </div>
                        <div class="form-group">
                            <label>Country</label>
                            <input type="text" name="businessCountry" value="United States" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Phone</label>
                            <input type="tel" name="primaryPhone" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Cell Phone</label>
                            <input type="tel" name="cellPhone" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Work Phone</label>
                            <input type="tel" name="workPhone" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Fax</label>
                            <input type="tel" name="faxPhone" class="form-input">
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Tax ID (EIN)</label>
                            <input type="text" name="federalTaxId" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Start Date</label>
                            <input type="date" name="businessStartDate" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Length of Ownership</label>
                            <input type="text" name="lengthOfOwnership" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Website</label>
                            <input type="url" name="website" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Industry Type</label>
                            <input type="text" name="industryType" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Entity Type</label>
                            <select name="entityType" class="form-input">
                                <option value="">Select Entity Type</option>
                                <option value="Corporation">Corporation</option>
                                <option value="LLC">LLC</option>
                                <option value="Partnership">Partnership</option>
                                <option value="Sole Proprietorship">Sole Proprietorship</option>
                                <option value="S-Corporation">S-Corporation</option>
                                <option value="C-Corporation">C-Corporation</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Business Email</label>
                            <input type="email" name="businessEmail" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Product Sold</label>
                            <input type="text" name="productSold" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Use of Proceeds</label>
                            <input type="text" name="useOfProceeds" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Lead Source</label>
                            <input type="text" name="leadSource" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Campaign</label>
                            <input type="text" name="campaign" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Lead Status</label>
                            <select name="leadStatus" class="form-input">
                                <option value="">Select Status...</option>
                                <option value="INTERESTED">Interested</option>
                                <option value="FCS_RUNNING">FCS Running</option>
                                <option value="COLLECTING_INFO">Collecting Info</option>
                                <option value="QUALIFIED">Qualified</option>
                                <option value="OFFER_SENT">Offer Sent</option>
                                <option value="NEGOTIATING">Negotiating</option>
                                <option value="ACCEPTED">Accepted</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Financial Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Annual Revenue</label>
                            <input type="number" name="annualRevenue" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Monthly Revenue</label>
                            <input type="number" name="monthlyRevenue" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Requested Amount</label>
                            <input type="number" name="requestedAmount" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Time in Business</label>
                            <input type="text" name="timeInBusiness" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Credit Score</label>
                            <input type="number" name="creditScore" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Years in Business</label>
                            <input type="number" name="yearsInBusiness" class="form-input">
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Factor Rate</label>
                            <input type="number" step="0.01" name="factorRate" class="form-input" placeholder="e.g. 1.25">
                        </div>
                        <div class="form-group">
                            <label>Term (Months)</label>
                            <input type="number" name="termMonths" class="form-input" placeholder="e.g. 12">
                        </div>
                        <div class="form-group">
                            <label>Funding Date</label>
                            <input type="date" name="fundingDate" class="form-input">
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h4>Owner Information</h4>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>First Name</label>
                            <input type="text" name="ownerFirstName" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Last Name</label>
                            <input type="text" name="ownerLastName" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Owner Email</label>
                            <input type="email" name="ownerEmail" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Ownership %</label>
                            <input type="number" name="ownershipPercent" class="form-input" min="0" max="100">
                        </div>
                        <div class="form-group">
                            <label>Owner Home Address</label>
                            <input type="text" name="ownerHomeAddress" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Owner Address Line 2</label>
                            <input type="text" name="ownerHomeAddress2" class="form-input">
                        </div>
                    </div>
                    <div class="form-row-six">
                        <div class="form-group">
                            <label>Owner City</label>
                            <input type="text" name="ownerHomeCity" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Owner State</label>
                            <select name="ownerHomeState" class="form-input">
                                ${stateOptions}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Owner ZIP</label>
                            <input type="text" name="ownerHomeZip" class="form-input" maxlength="10" placeholder="12345">
                        </div>
                        <div class="form-group">
                            <label>Owner Country</label>
                            <input type="text" name="ownerHomeCountry" value="United States" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>SSN</label>
                            <input type="text" name="ownerSSN" class="form-input">
                        </div>
                        <div class="form-group">
                            <label>Date of Birth</label>
                            <input type="date" name="ownerDOB" class="form-input">
                        </div>
                    </div>
                </div>

                <div class="form-actions" style="display: flex; gap: 16px; justify-content: center; margin-top: 30px; padding: 20px;">
                    <button type="submit" class="update-btn" style="padding: 12px 24px; background: #10b981; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer;">
                        Create Lead
                    </button>
                </div>
            </form>
        </div>
    `;
}

// Export for use in main file
if (typeof window !== 'undefined') {
    window.generateNewLeadForm = generateNewLeadForm;
}
