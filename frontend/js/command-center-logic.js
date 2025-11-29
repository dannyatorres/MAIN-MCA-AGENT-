        // Comprehensive CRM Form Functions
        let lookupData = {};
        
        // Load lookup data for dropdowns
        async function loadLookupData() {
            try {
                console.log('🔧 Loading lookup data for dropdowns...');
                
                // For now, use static data since server might be having issues
                lookupData = {
                    states: [
                        { code: 'CA', name: 'California' },
                        { code: 'NY', name: 'New York' },
                        { code: 'TX', name: 'Texas' },
                        { code: 'FL', name: 'Florida' },
                        { code: 'IL', name: 'Illinois' }
                    ],
                    entityTypes: [
                        { id: 1, name: 'Corporation' },
                        { id: 2, name: 'LLC' },
                        { id: 3, name: 'Partnership' },
                        { id: 4, name: 'Sole Proprietorship' }
                    ],
                    industryTypes: [
                        { id: 1, name: 'Construction' },
                        { id: 2, name: 'Restaurant' },
                        { id: 3, name: 'Retail' },
                        { id: 4, name: 'Professional Services' },
                        { id: 5, name: 'Manufacturing' }
                    ],
                    leadSources: [
                        { id: 1, name: 'Google Ads' },
                        { id: 2, name: 'Facebook' },
                        { id: 3, name: 'LinkedIn' },
                        { id: 4, name: 'Referral' },
                        { id: 5, name: 'Website' }
                    ],
                    users: [
                        { id: 1, first_name: 'John', last_name: 'Smith' },
                        { id: 2, first_name: 'Sarah', last_name: 'Johnson' },
                        { id: 3, first_name: 'Mike', last_name: 'Wilson' }
                    ]
                };
                
                console.log('✅ Lookup data loaded successfully');
                populateDropdowns();
            } catch (error) {
                console.error('❌ Error loading lookup data:', error);
                // Initialize with empty arrays to prevent errors
                if (!lookupData || typeof lookupData !== 'object') {
                    lookupData = {
                        states: [],
                        entityTypes: [],
                        industryTypes: [],
                        leadSources: [],
                        users: []
                    };
                }
                console.log('⚠️ Using fallback empty data');
                populateDropdowns();
            }
        }
        
        // Populate dropdown options
        function populateDropdowns() {
            try {
                console.log('🔧 Populating dropdowns with lookup data...');
                
                // Check if lookupData is properly loaded
                if (!lookupData || typeof lookupData !== 'object') {
                    console.warn('⚠️ lookupData is not available, skipping dropdown population');
                    return;
                }
                
                // States
                const stateSelects = ['businessState', 'stateOfIncorporation', 'owner1HomeState', 'owner2HomeState'];
                if (lookupData.states && Array.isArray(lookupData.states)) {
                    stateSelects.forEach(selectId => {
                        const select = document.getElementById(selectId);
                        if (select) {
                            select.innerHTML = '<option value="">Select State...</option>';
                            lookupData.states.forEach(state => {
                                select.innerHTML += `<option value="${state.code}">${state.name}</option>`;
                            });
                        }
                    });
                    console.log('✅ States populated successfully');
                } else {
                    console.warn('⚠️ States data not available');
                }
                
                // Entity Types
                const entitySelect = document.getElementById('entityType');
                if (entitySelect && lookupData.entityTypes && Array.isArray(lookupData.entityTypes)) {
                    entitySelect.innerHTML = '<option value="">Select Entity Type...</option>';
                    lookupData.entityTypes.forEach(type => {
                        entitySelect.innerHTML += `<option value="${type.name}">${type.name}</option>`;
                    });
                    console.log('✅ Entity types populated successfully');
                } else {
                    console.warn('⚠️ Entity types data not available');
                }
                
                // Industry Types
                const industrySelect = document.getElementById('industryType');
                if (industrySelect && lookupData.industryTypes && Array.isArray(lookupData.industryTypes)) {
                    industrySelect.innerHTML = '<option value="">Select Industry...</option>';
                    lookupData.industryTypes.forEach(type => {
                        industrySelect.innerHTML += `<option value="${type.name}">${type.name}</option>`;
                    });
                    console.log('✅ Industry types populated successfully');
                } else {
                    console.warn('⚠️ Industry types data not available');
                }
                
                // Lead Sources
                const leadSourceSelect = document.getElementById('leadSource');
                if (leadSourceSelect && lookupData.leadSources && Array.isArray(lookupData.leadSources)) {
                    leadSourceSelect.innerHTML = '<option value="">Select Lead Source...</option>';
                    lookupData.leadSources.forEach(source => {
                        leadSourceSelect.innerHTML += `<option value="${source.name}">${source.name}</option>`;
                    });
                    console.log('✅ Lead sources populated successfully');
                } else {
                    console.warn('⚠️ Lead sources data not available');
                }
                
                // Users
                const assignedToSelect = document.getElementById('assignedTo');
                if (assignedToSelect && lookupData.users && Array.isArray(lookupData.users)) {
                    assignedToSelect.innerHTML = '<option value="">Select User...</option>';
                    lookupData.users.forEach(user => {
                        assignedToSelect.innerHTML += `<option value="${user.first_name} ${user.last_name}">${user.first_name} ${user.last_name}</option>`;
                    });
                    console.log('✅ Users populated successfully');
                } else {
                    console.warn('⚠️ Users data not available');
                }
                
                console.log('✅ Dropdown population completed');
            } catch (error) {
                console.error('❌ Error populating dropdowns:', error);
                // Don't throw the error to prevent the global error handler from triggering
            }
        }
        
        // Toggle collapsible sections
        function toggleSection(sectionId) {
            const content = document.getElementById(sectionId);
            const toggle = content.previousElementSibling.querySelector('.section-toggle');
            
            if (content.classList.contains('collapsed')) {
                content.classList.remove('collapsed');
                toggle.textContent = '−';
                toggle.classList.remove('collapsed');
            } else {
                content.classList.add('collapsed');
                toggle.textContent = '+';
                toggle.classList.add('collapsed');
            }
        }
        
        // Toggle Partner section
        function toggleOwner2Section() {
            try {
                console.log('🔄 Toggling Partner section...');
                
                const checkbox = document.getElementById('addSecondOwner');
                const owner2Info = document.getElementById('owner2Info');
                const owner2Toggle = document.getElementById('owner2Toggle');
                
                if (!checkbox) {
                    console.warn('⚠️ addSecondOwner checkbox not found');
                    return;
                }
                
                if (!owner2Info) {
                    console.warn('⚠️ owner2Info element not found');
                    return;
                }
                
                if (!owner2Toggle) {
                    console.warn('⚠️ owner2Toggle element not found');
                    return;
                }
                
                if (checkbox.checked) {
                    owner2Info.style.display = 'block';
                    owner2Toggle.style.display = 'block';
                    console.log('✅ Partner section shown');
                } else {
                    owner2Info.style.display = 'none';
                    owner2Toggle.style.display = 'none';
                    console.log('✅ Partner section hidden');
                    
                    // Clear Partner fields safely
                    try {
                        const owner2Fields = owner2Info.querySelectorAll('input, select');
                        owner2Fields.forEach((field, index) => {
                            try {
                                field.value = '';
                            } catch (fieldError) {
                                console.warn(`⚠️ Error clearing Partner field ${index}:`, fieldError);
                            }
                        });
                        console.log('✅ Partner fields cleared');
                    } catch (clearError) {
                        console.warn('⚠️ Error clearing Partner fields:', clearError);
                    }
                }
                
            } catch (error) {
                console.error('🚨 Error in toggleOwner2Section:', error);
                // Don't re-throw, just log and continue
            }
        }
        
        // Collect comprehensive form data
        function collectComprehensiveFormData() {
            const formData = {
                // Business Information
                companyName: document.getElementById('companyName').value,
                dbaName: document.getElementById('dbaName').value,
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                businessAddress: document.getElementById('businessAddress').value,
                businessAddress2: document.getElementById('businessAddress2').value,
                businessCountry: document.getElementById('businessCountry').value,
                businessState: document.getElementById('businessState').value,
                businessCity: document.getElementById('businessCity').value,
                businessZip: document.getElementById('businessZip').value,
                primaryPhone: document.getElementById('primaryPhone').value,
                cellPhone: document.getElementById('cellPhone').value,
                workPhone: document.getElementById('workPhone').value,
                faxPhone: document.getElementById('faxPhone').value,
                federalTaxId: document.getElementById('federalTaxId').value,
                businessStartDate: document.getElementById('businessStartDate').value,
                lengthOfOwnership: document.getElementById('lengthOfOwnership').value,
                website: document.getElementById('website').value,
                stateOfIncorporation: document.getElementById('stateOfIncorporation').value,
                entityType: document.getElementById('entityType').value,
                industryType: document.getElementById('industryType').value,
                businessEmail: document.getElementById('businessEmail').value,
                productSold: document.getElementById('productSold').value,
                useOfProceeds: document.getElementById('useOfProceeds').value,
                annualRevenue: document.getElementById('annualRevenue').value,
                monthlyRevenue: document.getElementById('monthlyRevenue').value,
                requestedAmount: document.getElementById('requestedAmount').value,
                leadSource: document.getElementById('leadSource').value,
                leadStatus: document.getElementById('leadStatus').value,
                assignedTo: document.getElementById('assignedTo').value,
                disposition: document.getElementById('disposition').value,
                campaign: document.getElementById('campaign').value,
                optOutDripCampaign: document.getElementById('optOutDripCampaign').value === 'true',
                marketingNotification: document.querySelector('input[name="marketingNotification"]:checked')?.value || 'BOTH',
                
                // Owner Information
                owner1: {
                    firstName: document.getElementById('owner1FirstName').value,
                    lastName: document.getElementById('owner1LastName').value,
                    email: document.getElementById('owner1Email').value,
                    ownershipPercentage: document.getElementById('owner1OwnershipPercentage').value,
                    homeAddress: document.getElementById('owner1HomeAddress').value,
                    homeAddress2: document.getElementById('owner1HomeAddress2').value,
                    homeCountry: document.getElementById('owner1HomeCountry').value,
                    homeState: document.getElementById('owner1HomeState').value,
                    homeCity: document.getElementById('owner1HomeCity').value,
                    homeZip: document.getElementById('owner1HomeZip').value,
                    ssn: document.getElementById('owner1SSN').value,
                    dateOfBirth: document.getElementById('owner1DateOfBirth').value
                }
            };
            
            // Add Partner if checkbox is checked
            if (document.getElementById('addSecondOwner').checked) {
                formData.owner2 = {
                    firstName: document.getElementById('owner2FirstName').value,
                    lastName: document.getElementById('owner2LastName').value,
                    email: document.getElementById('owner2Email').value,
                    ownershipPercentage: document.getElementById('owner2OwnershipPercentage').value,
                    homeAddress: document.getElementById('owner2HomeAddress').value,
                    homeAddress2: document.getElementById('owner2HomeAddress2').value,
                    homeCountry: document.getElementById('owner2HomeCountry').value,
                    homeState: document.getElementById('owner2HomeState').value,
                    homeCity: document.getElementById('owner2HomeCity').value,
                    homeZip: document.getElementById('owner2HomeZip').value,
                    ssn: document.getElementById('owner2SSN').value,
                    dateOfBirth: document.getElementById('owner2DateOfBirth').value
                };
            }
            
            return formData;
        }
        
        // Validate comprehensive form
        function validateComprehensiveForm(data) {
            const errors = [];
            
            // Required fields
            if (!data.companyName) errors.push('Company Name is required');
            if (!data.primaryPhone) errors.push('Primary Phone is required');
            
            // Phone validation
            const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
            if (data.primaryPhone && !phoneRegex.test(data.primaryPhone)) {
                errors.push('Primary Phone must be a valid phone number');
            }
            
            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (data.businessEmail && !emailRegex.test(data.businessEmail)) {
                errors.push('Business Email must be valid');
            }
            
            if (data.owner1?.email && !emailRegex.test(data.owner1.email)) {
                errors.push('Owner Email must be valid');
            }
            
            if (data.owner2?.email && !emailRegex.test(data.owner2.email)) {
                errors.push('Partner Email must be valid');
            }
            
            return errors;
        }
        
        // Clear comprehensive form with null safety
        function clearComprehensiveForm() {
            try {
                console.log('🧹 Clearing comprehensive form...');
                const modal = document.getElementById('addLeadModal');
                
                if (!modal) {
                    console.warn('⚠️ Modal not found, skipping form clear');
                    return;
                }
                
                const inputs = modal.querySelectorAll('input, select, textarea');
                console.log(`🔍 Found ${inputs.length} form inputs to clear`);
                
                inputs.forEach((input, index) => {
                    try {
                        if (input.type === 'radio') {
                            input.checked = input.value === 'BOTH' && input.name === 'marketingNotification';
                        } else if (input.type === 'checkbox') {
                            input.checked = false;
                        } else {
                            input.value = '';
                        }
                    } catch (inputError) {
                        console.warn(`⚠️ Error clearing input ${index}:`, inputError);
                    }
                });
                
                // Reset lead status to default (with null check)
                const leadStatusEl = document.getElementById('leadStatus');
                if (leadStatusEl) {
                    leadStatusEl.value = 'SUBMITTED';
                    console.log('✅ Lead status reset to SUBMITTED');
                } else {
                    console.warn('⚠️ leadStatus element not found');
                }
                
                // Hide Partner section (with null checks)
                const owner2Info = document.getElementById('owner2Info');
                const owner2Toggle = document.getElementById('owner2Toggle');
                
                if (owner2Info) {
                    owner2Info.style.display = 'none';
                    console.log('✅ Partner info hidden');
                } else {
                    console.warn('⚠️ owner2Info element not found');
                }
                
                if (owner2Toggle) {
                    owner2Toggle.style.display = 'none';
                    console.log('✅ Partner toggle hidden');
                } else {
                    console.warn('⚠️ owner2Toggle element not found');
                }
                
                console.log('✅ Form cleared successfully');
                
            } catch (error) {
                console.error('🚨 Error in clearComprehensiveForm:', error);
                // Don't re-throw error - just log and continue silently
                // This prevents modal opening issues
            }
        }
        
        // DEPRECATED - These functions are replaced by the event listener in DOMContentLoaded
        // See line ~3260 for the new Add Lead button handler
        /*
        function showEditModalForNewLead() { ... }
        function openAddLeadModal() { ... }
        */

        // Clear edit form function
        function clearEditForm() {
            const modal = document.getElementById('editLeadModal');
            if (!modal) return;

            console.log('🧹 Clearing edit form...');

            const inputs = modal.querySelectorAll('input, select, textarea');
            inputs.forEach(input => {
                if (input.type === 'radio') {
                    input.checked = input.value === 'BOTH' && input.name === 'editMarketingNotification';
                } else if (input.type === 'checkbox') {
                    input.checked = false;
                } else {
                    input.value = '';
                }
            });

            console.log('✅ Form cleared');
        }
        
        // DEPRECATED - testSimpleAdd function removed
        // Use the Add Lead button which opens the Edit modal in create mode
        
        // Enhanced debug logging
        console.log('🔧 Main script loading...');
        
        // Debug all required classes
        window.debugClasses = function() {
            console.log('🔍 Class availability check:');
            console.log('- CommandCenter:', typeof CommandCenter);
            console.log('- ConversationUI:', typeof ConversationUI);
            console.log('- StateManager:', typeof StateManager);
            console.log('- WebSocketManager:', typeof WebSocketManager);
        };
        
        // Debug API connection
        window.testAPI = async function() {
            console.log('🧪 Testing API connection...');
            try {
                const response = await fetch('/api/conversations');
                const data = await response.json();
                console.log('✅ API Response:', data);
                return data;
            } catch (error) {
                console.error('❌ API Error:', error);
                return null;
            }
        };
        
        // Force conversations reload
        window.forceReload = function() {
            console.log('🚀 Force reload conversations...');
            fetch('/api/conversations')
                .then(response => response.json())
                .then(data => {
                    console.log('📋 Got conversations data:', data);
                    if (window.commandCenter && window.commandCenter.conversationUI) {
                        // Force update the UI
                        const conversationsList = document.getElementById('conversationsList');
                        if (conversationsList) {
                            conversationsList.innerHTML = '<div class="loading">✅ API Working - Found ' + data.length + ' conversations</div>';
                        }
                    }
                })
                .catch(error => {
                    console.error('❌ Force reload failed:', error);
                    const conversationsList = document.getElementById('conversationsList');
                    if (conversationsList) {
                        conversationsList.innerHTML = '<div class="error">❌ API Error: ' + error.message + '</div>';
                    }
                });
        };
        
        // Debug DOM elements
        window.debugDOM = function() {
            console.log('🔍 DOM elements check:');
            const addLeadBtn = document.getElementById('addLeadBtn');
            const testBtn = document.getElementById('testAddLeadBtn');
            const modal = document.getElementById('addLeadModal');
            
            console.log('- Add Lead Button:', addLeadBtn);
            console.log('- Add Lead Button text:', addLeadBtn ? addLeadBtn.textContent : 'null');
            console.log('- Add Lead Button visible:', addLeadBtn ? (addLeadBtn.offsetWidth > 0 && addLeadBtn.offsetHeight > 0) : false);
            console.log('- Test Button:', testBtn);
            console.log('- Test Button visible:', testBtn ? (testBtn.offsetWidth > 0 && testBtn.offsetHeight > 0) : false);
            console.log('- Add Lead Modal:', modal);
        };
        
        // Manual button test
        window.testAddLeadButton = function() {
            const modal = document.getElementById('addLeadModal');
            if (modal) {
                modal.style.display = 'flex';
                console.log('✅ Modal opened manually');
            } else {
                console.log('❌ Modal not found');
            }
        };
        
        // Initialize comprehensive form
        function initializeComprehensiveForm() {
            console.log('🔧 Initializing comprehensive form...');
            
            // Load lookup data
            loadLookupData();
            
            // Set up modal event listeners
            const modal = document.getElementById('addLeadModal');
            const closeBtn = document.getElementById('closeAddLeadModal');
            const cancelBtn = document.getElementById('cancelAddLead');
            const confirmBtn = document.getElementById('confirmAddLead');
            
            if (!modal) {
                console.warn('⚠️ Modal not found during initialization');
                return;
            }
            
            if (closeBtn) {
                closeBtn.onclick = () => {
                    modal.style.display = 'none';
                    clearComprehensiveForm();
                };
            }
            
            if (cancelBtn) {
                cancelBtn.onclick = () => {
                    modal.style.display = 'none';
                    clearComprehensiveForm();
                };
            }
            
            if (confirmBtn) {
                confirmBtn.onclick = async () => {
                    console.log('🚀 Creating comprehensive lead...');
                    
                    const formData = collectComprehensiveFormData();
                    const errors = validateComprehensiveForm(formData);
                    
                    if (errors.length > 0) {
                        alert('Please fix the following errors:\n' + errors.join('\n'));
                        return;
                    }
                    
                    try {
                        // For now, create a simplified lead for the existing API
                        const leadData = {
                            businessName: formData.companyName,
                            phone: formData.primaryPhone,
                            message: `Comprehensive lead created from CRM form. Industry: ${formData.industryType}`,
                            requestedAmount: formData.requestedAmount,
                            priority: 'normal'
                        };
                        
                        console.log('📤 Sending lead data:', leadData);
                        
                        const response = await fetch('/api/conversations', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(leadData)
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            alert('✅ Lead created successfully!');
                            modal.style.display = 'none';
                            clearComprehensiveForm();
                            location.reload(); // Refresh to show new lead
                        } else {
                            alert('❌ Error creating lead: ' + (result.error || 'Unknown error'));
                        }
                        
                    } catch (error) {
                        console.error('Error creating lead:', error);
                        alert('❌ Connection error: ' + error.message);
                    }
                };
            }
            
            // Close modal when clicking outside
            modal.onclick = (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                    clearComprehensiveForm();
                }
            };
            
            console.log('✅ Comprehensive form initialized');
        }
        
        // Global error handler
        window.addEventListener('error', (e) => {
            console.error('🚨 Global JavaScript Error:', e.error);
        });

        // Global Modal Helpers (Keep these if your buttons rely on onclick="...")
        window.reloadConversations = function() {
            if (window.commandCenter?.conversationUI) {
                window.commandCenter.conversationUI.loadConversations();
            }
        };

        // Initialize simple UI interactions that don't depend on the main app
        document.addEventListener('DOMContentLoaded', () => {
            console.log('🚀 DOM Content Loaded');

            // 🛑 REMOVED: window.commandCenter = new CommandCenter();
            // Why: command-center.js already does this!

            // Initialize comprehensive form - Re-enabled for standalone Add Lead modal
            setTimeout(initializeComprehensiveForm, 100);

            // Run debug checks
            setTimeout(debugClasses, 100);
            setTimeout(debugDOM, 500);

            // Setup basic UI toggles that might exist outside the main app logic
            const leadActionsBtn = document.getElementById('leadActionsBtn');
            if (leadActionsBtn) {
                leadActionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const menu = document.getElementById('leadActionsMenu');
                    if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
                });

                document.addEventListener('click', () => {
                    const menu = document.getElementById('leadActionsMenu');
                    if (menu) menu.style.display = 'none';
                });
            }
        });

        // Lead Management Functionality
        let currentEditingLeadId = null;
        let currentConversationId = null;
        let currentConversation = null;

        // Initialize lead management functionality
        function initializeLeadManagement() {
            console.log('🔧 Initializing lead management...');

            // Lead actions dropdown functionality
            const leadActionsBtn = document.getElementById('leadActionsBtn');
            const leadActionsMenu = document.getElementById('leadActionsMenu');
            
            if (leadActionsBtn && leadActionsMenu) {
                leadActionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleLeadActionsDropdown();
                });

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (!leadActionsBtn.contains(e.target) && !leadActionsMenu.contains(e.target)) {
                        closeLeadActionsDropdown();
                    }
                });
            }

            // Edit lead button
            const editLeadBtn = document.getElementById('editLeadBtn');
            if (editLeadBtn) {
                editLeadBtn.addEventListener('click', () => {
                    closeLeadActionsDropdown();
                    openEditLeadModal();
                });
            }

            // Clone lead button
            const cloneLeadBtn = document.getElementById('cloneLeadBtn');
            if (cloneLeadBtn) {
                cloneLeadBtn.addEventListener('click', () => {
                    closeLeadActionsDropdown();
                    cloneLead();
                });
            }

            // Archive lead button
            const archiveLeadBtn = document.getElementById('archiveLeadBtn');
            if (archiveLeadBtn) {
                archiveLeadBtn.addEventListener('click', () => {
                    closeLeadActionsDropdown();
                    showArchiveConfirmation();
                });
            }

            // Delete lead button
            const deleteLeadBtn = document.getElementById('deleteLeadBtn');
            if (deleteLeadBtn) {
                deleteLeadBtn.addEventListener('click', () => {
                    closeLeadActionsDropdown();
                    showDeleteConfirmation();
                });
            }

            // Edit modal event listeners
            setupEditModalEventListeners();
            setupConfirmationDialogs();
        }

        function toggleLeadActionsDropdown() {
            const btn = document.getElementById('leadActionsBtn');
            const menu = document.getElementById('leadActionsMenu');
            
            const isOpen = btn.classList.contains('open');
            
            if (isOpen) {
                closeLeadActionsDropdown();
            } else {
                btn.classList.add('open');
                menu.classList.add('show');
                menu.style.display = 'block';
                
                // Animate in
                setTimeout(() => {
                    menu.style.opacity = '1';
                    menu.style.transform = 'translateY(0)';
                }, 10);
            }
        }

        function closeLeadActionsDropdown() {
            const btn = document.getElementById('leadActionsBtn');
            const menu = document.getElementById('leadActionsMenu');
            
            btn.classList.remove('open');
            menu.classList.remove('show');
            
            setTimeout(() => {
                menu.style.display = 'none';
            }, 200);
        }

        async function openEditLeadModal() {
            // Get current conversation from ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            const selectedConversationId = conversationUI?.currentConversationId;
            const selectedConversation = conversationUI?.selectedConversation;
            
            if (!selectedConversationId || !selectedConversation) {
                showNotification('Please select a lead to edit', 'error');
                console.warn('No conversation selected. ConversationUI state:', {
                    conversationUI: !!conversationUI,
                    currentConversationId: selectedConversationId,
                    selectedConversation: !!selectedConversation
                });
                return;
            }

            try {
                // Show loading
                showNotification('Loading lead data...', 'info');

                // 1. Fetch the latest data
                const response = await fetch(`/api/conversations/${selectedConversationId}`);
                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to load lead data');
                }

                // API returns conversation directly, not wrapped in .conversation
                const conversation = result.conversation || result;

                console.log('📝 Edit modal - conversation data:', conversation);

                currentEditingLeadId = selectedConversationId;

                // 2. [CRITICAL FIX] Populate Dropdowns FIRST so the <options> exist
                // We await this to ensure the DOM is ready before setting values
                await populateEditDropdowns();

                // 3. Now populate the form values (including the selects)
                populateEditForm(conversation);

                // 4. Show the modal
                const modal = document.getElementById('editLeadModal');
                modal.style.display = 'flex';

                // Ensure the title is correct
                const modalTitle = modal.querySelector('.modal-header h3');
                if (modalTitle) modalTitle.textContent = 'Edit Lead - Comprehensive CRM';

                showNotification('Lead data loaded successfully', 'success');

            } catch (error) {
                console.error('Error opening edit modal:', error);
                showNotification('Failed to load lead data: ' + error.message, 'error');
            }
        }

        function populateEditForm(conversation) {
            console.log('📝 Populating edit form with conversation data:', conversation);

            // Debug: Log specific fields we're looking for
            console.log('📍 Address fields:', {
                address: conversation.address,
                city: conversation.city,
                zip: conversation.zip,
                us_state: conversation.us_state,
                state: conversation.state,
                tax_id: conversation.tax_id,
                tax_id_encrypted: conversation.tax_id_encrypted
            });

            // [FIX] Force expand the sections so the user sees the data immediately
            const sections = ['editBusinessInfo', 'editOwner1Info', 'editOwner2Info', 'editMarketingNotes'];
            sections.forEach(id => {
                const el = document.getElementById(id);
                const toggle = el?.previousElementSibling?.querySelector('.section-toggle');

                if (el) {
                    el.style.display = 'block'; // Force show
                    el.classList.remove('collapsed');
                }
                if (toggle) {
                    toggle.textContent = '−'; // Set to minus sign
                    toggle.classList.remove('collapsed');
                }
            });

            // Business Information - map database fields to form fields
            const setFieldValue = (fieldId, value) => {
                const field = document.getElementById(fieldId);
                if (field) {
                    field.value = value || '';
                    if (value) console.log(`✅ Set ${fieldId} = ${value}`);
                } else {
                    console.warn(`Field ${fieldId} not found in edit form`);
                }
            };

            // Helper to format date for input fields
            const formatDate = (dateStr) => {
                if (!dateStr) return '';
                try {
                    return dateStr.split('T')[0];
                } catch (e) {
                    return '';
                }
            };

            // === BUSINESS INFORMATION ===
            setFieldValue('editCompanyName', conversation.business_name);
            setFieldValue('editDbaName', conversation.dba_name);
            setFieldValue('editPrimaryPhone', conversation.lead_phone);
            setFieldValue('editBusinessPhone', conversation.business_phone);
            setFieldValue('editWebsite', conversation.website);
            setFieldValue('editTaxId', conversation.tax_id || conversation.tax_id_encrypted);
            setFieldValue('editEntityType', conversation.entity_type_id || conversation.entity_type);
            setFieldValue('editIndustryType', conversation.industry_type_id || conversation.industry || conversation.business_type);
            setFieldValue('editTimeInBusiness', conversation.time_in_business_months);
            setFieldValue('editRequestedAmount', conversation.requested_amount || conversation.funding_amount);
            setFieldValue('editMonthlyRevenue', conversation.monthly_revenue);
            setFieldValue('editAnnualRevenue', conversation.annual_revenue);

            // === BUSINESS ADDRESS ===
            setFieldValue('editBusinessAddress', conversation.address || conversation.business_address);
            setFieldValue('editBusinessCity', conversation.city || conversation.business_city);
            setFieldValue('editBusinessState', conversation.us_state || conversation.state || conversation.address_state);
            setFieldValue('editBusinessZip', conversation.zip || conversation.business_zip);

            // === OTHER BUSINESS FIELDS ===
            setFieldValue('editLeadSource', conversation.lead_source_id);
            setFieldValue('editPriority', conversation.priority || 'medium');
            setFieldValue('editNotes', conversation.notes);

            // === OWNER 1 INFORMATION (from CSV import) ===
            setFieldValue('editOwner1FirstName', conversation.first_name || conversation.owner_first_name);
            setFieldValue('editOwner1LastName', conversation.last_name || conversation.owner_last_name);
            setFieldValue('editOwner1Email', conversation.email || conversation.owner_email);
            setFieldValue('editOwner1Phone', conversation.owner_phone || conversation.lead_phone);
            setFieldValue('editOwner1SSN', conversation.ssn || conversation.ssn_encrypted);
            setFieldValue('editOwner1DOB', formatDate(conversation.date_of_birth || conversation.dob));
            setFieldValue('editOwner1Ownership', conversation.ownership_percentage || '100');

            // === OWNER 1 HOME ADDRESS ===
            setFieldValue('editOwner1HomeAddress', conversation.owner_address || conversation.owner_home_address);
            setFieldValue('editOwner1HomeCity', conversation.owner_city || conversation.owner_home_city);
            setFieldValue('editOwner1HomeState', conversation.owner_state || conversation.owner_home_state);
            setFieldValue('editOwner1HomeZip', conversation.owner_zip || conversation.owner_home_zip);

            // === BUSINESS START DATE ===
            setFieldValue('businessStartDate', formatDate(conversation.business_start_date));
            setFieldValue('editBusinessStartDate', formatDate(conversation.business_start_date));

            // === MARKETING PREFERENCES ===
            const marketingRadios = document.querySelectorAll('input[name="editMarketingNotification"]');
            marketingRadios.forEach(radio => {
                if (conversation.marketing_opt_text && conversation.marketing_opt_email) {
                    radio.checked = radio.value === 'BOTH';
                } else if (conversation.marketing_opt_text) {
                    radio.checked = radio.value === 'TEXT';
                } else if (conversation.marketing_opt_email) {
                    radio.checked = radio.value === 'EMAIL';
                } else {
                    radio.checked = radio.value === 'BOTH'; // Default
                }
            });

            console.log('✅ Edit form populated with all conversation data');
        }

        async function populateEditDropdowns() {
            try {
                console.log('📋 Populating edit dropdowns...');

                // Entity Types - Static data
                const entityTypes = [
                    'LLC', 'Corporation', 'Partnership', 'Sole Proprietorship', 'S-Corp', 'C-Corp', 'Non-Profit', 'Other'
                ];
                const editEntitySelect = document.getElementById('editEntityType');
                if (editEntitySelect) {
                    editEntitySelect.innerHTML = '<option value="">Select Entity Type...</option>';
                    entityTypes.forEach(type => {
                        editEntitySelect.innerHTML += `<option value="${type}">${type}</option>`;
                    });
                }

                // Industry Types - Static data
                const industryTypes = [
                    'Restaurant', 'Retail', 'Construction', 'Healthcare', 'Professional Services',
                    'Manufacturing', 'Transportation', 'Real Estate', 'Technology', 'Hospitality',
                    'Education', 'Finance', 'Other'
                ];
                const editIndustrySelect = document.getElementById('editIndustryType');
                if (editIndustrySelect) {
                    editIndustrySelect.innerHTML = '<option value="">Select Industry...</option>';
                    industryTypes.forEach(type => {
                        editIndustrySelect.innerHTML += `<option value="${type}">${type}</option>`;
                    });
                }

                // Lead Sources - Static data
                const leadSources = [
                    'Website', 'Referral', 'Cold Call', 'Email Campaign', 'Social Media',
                    'Trade Show', 'Partner', 'Advertisement', 'Direct Mail', 'Other'
                ];
                const editLeadSourceSelect = document.getElementById('editLeadSource');
                if (editLeadSourceSelect) {
                    editLeadSourceSelect.innerHTML = '<option value="">Select Source...</option>';
                    leadSources.forEach(source => {
                        editLeadSourceSelect.innerHTML += `<option value="${source}">${source}</option>`;
                    });
                }

                // States for business and owners
                const states = [
                    { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
                    { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
                    { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
                    { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
                    { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
                    { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
                    { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
                    { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
                    { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
                    { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
                    { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
                    { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
                    { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
                    { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
                    { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
                    { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
                    { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
                    { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
                    { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
                    { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
                    { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
                    { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
                    { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
                    { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
                    { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
                ];

                const stateSelects = ['editBusinessState', 'editOwner1HomeState', 'editOwner2HomeState'];
                stateSelects.forEach(selectId => {
                    const select = document.getElementById(selectId);
                    if (select) {
                        select.innerHTML = '<option value="">Select State...</option>';
                        states.forEach(state => {
                            select.innerHTML += `<option value="${state.code}">${state.name}</option>`;
                        });
                    }
                });

                console.log('✅ Edit dropdowns populated');
            } catch (error) {
                console.error('❌ Error populating edit dropdowns:', error);
            }
        }

        function setupEditModalEventListeners() {
            // Close buttons
            const closeBtn = document.getElementById('closeEditLeadModal');
            const cancelBtn = document.getElementById('cancelEditLead');
            const saveBtn = document.getElementById('saveEditLead');

            if (closeBtn) {
                closeBtn.addEventListener('click', closeEditModal);
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', closeEditModal);
            }

            if (saveBtn) {
                saveBtn.addEventListener('click', saveLeadChanges);
            }
        }

        function closeEditModal() {
            const modal = document.getElementById('editLeadModal');
            modal.style.display = 'none';

            // Reset mode back to edit
            modal.dataset.mode = 'edit';

            // Reset button text
            const saveBtn = document.getElementById('saveEditLead');
            if (saveBtn) {
                saveBtn.textContent = 'Save Changes';
            }

            // Reset title
            const modalTitle = modal.querySelector('.modal-header h3');
            if (modalTitle) {
                modalTitle.textContent = 'Edit Lead - Comprehensive CRM';
            }

            currentEditingLeadId = null;
        }

        async function saveLeadChanges() {
            const modal = document.getElementById('editLeadModal');
            const mode = modal?.dataset.mode || 'edit';

            console.log('💾 Saving lead in mode:', mode);

            if (mode === 'edit' && !currentEditingLeadId) {
                showNotification('No lead selected for editing', 'error');
                return;
            }

            try {
                // Show loading
                showNotification(mode === 'create' ? 'Creating lead...' : 'Saving changes...', 'info');

                // Collect form data
                const leadData = collectEditFormData();

                console.log('📤 Sending lead data:', leadData);

                let response;

                if (mode === 'create') {
                    // CREATE mode - POST to /api/conversations
                    response = await fetch('/api/conversations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(leadData)
                    });
                } else {
                    // EDIT mode - PUT to /api/conversations/:id
                    response = await fetch(`/api/conversations/${currentEditingLeadId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(leadData)
                    });
                }

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || `Failed to ${mode} lead`);
                }

                // Success
                showNotification(
                    mode === 'create' ? 'Lead created successfully!' : 'Lead updated successfully!',
                    'success'
                );

                closeEditModal();

                // Refresh the conversation list
                if (window.commandCenter?.conversationUI) {
                    await window.commandCenter.conversationUI.loadConversations();

                    // If we created a new lead, select it
                    if (mode === 'create' && result.conversation?.id) {
                        setTimeout(() => {
                            window.commandCenter.conversationUI.selectConversation(result.conversation.id);
                        }, 500);
                    } else if (mode === 'edit') {
                        // If this is the currently selected conversation, refresh it
                        const selectedConversationId = window.commandCenter.conversationUI.currentConversationId;
                        if (selectedConversationId === currentEditingLeadId) {
                            window.commandCenter.conversationUI.selectConversation(selectedConversationId);
                        }
                    }
                }

            } catch (error) {
                console.error('❌ Error saving lead:', error);
                showNotification('Failed to save lead: ' + error.message, 'error');
            }
        }

        function collectEditFormData() {
            // Marketing preferences
            const marketingRadio = document.querySelector('input[name="editMarketingNotification"]:checked');
            const marketingPref = marketingRadio ? marketingRadio.value : 'BOTH';

            const leadData = {
                // Business information
                business_name: document.getElementById('editCompanyName').value,
                dba_name: document.getElementById('editDbaName').value,
                lead_phone: document.getElementById('editPrimaryPhone').value,
                business_phone: document.getElementById('editBusinessPhone').value,
                website: document.getElementById('editWebsite').value,
                tax_id_encrypted: document.getElementById('editTaxId').value,
                entity_type_id: document.getElementById('editEntityType').value || null,
                industry_type_id: document.getElementById('editIndustryType').value || null,
                time_in_business_months: parseInt(document.getElementById('editTimeInBusiness').value) || null,
                requested_amount: parseInt(document.getElementById('editRequestedAmount').value) || null,
                monthly_revenue: parseInt(document.getElementById('editMonthlyRevenue').value) || null,
                annual_revenue: parseInt(document.getElementById('editAnnualRevenue').value) || null,
                address: document.getElementById('editBusinessAddress').value,
                city: document.getElementById('editBusinessCity').value,
                state: document.getElementById('editBusinessState').value,
                zip: document.getElementById('editBusinessZip').value,
                lead_source_id: document.getElementById('editLeadSource').value || null,
                priority: document.getElementById('editPriority').value,
                notes: document.getElementById('editNotes').value,
                marketing_opt_text: marketingPref === 'TEXT' || marketingPref === 'BOTH',
                marketing_opt_email: marketingPref === 'EMAIL' || marketingPref === 'BOTH',
                owners: []
            };

            // Owner data
            const owner1FirstName = document.getElementById('editOwner1FirstName').value;
            const owner1LastName = document.getElementById('editOwner1LastName').value;
            if (owner1FirstName || owner1LastName) {
                leadData.owners.push({
                    first_name: owner1FirstName,
                    last_name: owner1LastName,
                    email: document.getElementById('editOwner1Email').value,
                    phone: document.getElementById('editOwner1Phone').value,
                    ownership_percentage: parseInt(document.getElementById('editOwner1Ownership').value) || null,
                    date_of_birth: document.getElementById('editOwner1DOB').value || null,
                    address: document.getElementById('editOwner1HomeAddress').value,
                    city: document.getElementById('editOwner1HomeCity').value,
                    state: document.getElementById('editOwner1HomeState').value,
                    zip: document.getElementById('editOwner1HomeZip').value,
                    ssn_encrypted: document.getElementById('editOwner1SSN').value
                });
            }

            // Partner data (if provided)
            const owner2FirstName = document.getElementById('editOwner2FirstName').value;
            const owner2LastName = document.getElementById('editOwner2LastName').value;
            if (owner2FirstName || owner2LastName) {
                leadData.owners.push({
                    first_name: owner2FirstName,
                    last_name: owner2LastName,
                    email: document.getElementById('editOwner2Email').value,
                    phone: document.getElementById('editOwner2Phone').value,
                    ownership_percentage: parseInt(document.getElementById('editOwner2Ownership').value) || null,
                    date_of_birth: document.getElementById('editOwner2DOB').value || null,
                    address: document.getElementById('editOwner2HomeAddress').value,
                    city: document.getElementById('editOwner2HomeCity').value,
                    state: document.getElementById('editOwner2HomeState').value,
                    zip: document.getElementById('editOwner2HomeZip').value,
                    ssn_encrypted: document.getElementById('editOwner2SSN').value
                });
            }

            return leadData;
        }

        async function cloneLead() {
            // Get current conversation from ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            const selectedConversationId = conversationUI?.currentConversationId;
            
            if (!selectedConversationId) {
                showNotification('Please select a lead to clone', 'error');
                return;
            }

            try {
                showNotification('Cloning lead...', 'info');

                const response = await fetch(`/api/conversations/${selectedConversationId}/clone`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to clone lead');
                }

                showNotification('Lead cloned successfully!', 'success');
                window.commandCenter?.conversationUI?.loadConversations();

            } catch (error) {
                console.error('Error cloning lead:', error);
                showNotification('Failed to clone lead: ' + error.message, 'error');
            }
        }

        function showArchiveConfirmation() {
            // Get current conversation from ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            const selectedConversation = conversationUI?.selectedConversation;
            
            if (!selectedConversation) {
                showNotification('Please select a lead to archive', 'error');
                return;
            }

            // Populate confirmation dialog
            document.getElementById('archiveLeadName').textContent = selectedConversation.business_name || 'Unknown';
            document.getElementById('archiveLeadPhone').textContent = selectedConversation.lead_phone || 'N/A';

            const modal = document.getElementById('archiveConfirmModal');
            modal.style.display = 'flex';
        }

        function showDeleteConfirmation() {
            // Get current conversation from ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            const selectedConversation = conversationUI?.selectedConversation;
            
            if (!selectedConversation) {
                showNotification('Please select a lead to delete', 'error');
                return;
            }

            // Populate confirmation dialog
            document.getElementById('deleteLeadName').textContent = selectedConversation.business_name || 'Unknown';
            document.getElementById('deleteLeadPhone').textContent = selectedConversation.lead_phone || 'N/A';

            const modal = document.getElementById('deleteConfirmModal');
            modal.style.display = 'flex';
        }

        function setupConfirmationDialogs() {
            // Archive confirmation
            const archiveModal = document.getElementById('archiveConfirmModal');
            const closeArchiveBtn = document.getElementById('closeArchiveConfirmModal');
            const cancelArchiveBtn = document.getElementById('cancelArchive');
            const confirmArchiveBtn = document.getElementById('confirmArchive');

            if (closeArchiveBtn) closeArchiveBtn.addEventListener('click', () => archiveModal.style.display = 'none');
            if (cancelArchiveBtn) cancelArchiveBtn.addEventListener('click', () => archiveModal.style.display = 'none');
            if (confirmArchiveBtn) confirmArchiveBtn.addEventListener('click', confirmArchiveLead);

            // Delete confirmation
            const deleteModal = document.getElementById('deleteConfirmModal');
            const closeDeleteBtn = document.getElementById('closeDeleteConfirmModal');
            const cancelDeleteBtn = document.getElementById('cancelDelete');
            const confirmDeleteBtn = document.getElementById('confirmDelete');

            if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', () => deleteModal.style.display = 'none');
            if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => deleteModal.style.display = 'none');
            if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', confirmDeleteLead);
        }

        async function confirmArchiveLead() {
            if (!currentConversationId) return;

            try {
                showNotification('Archiving lead...', 'info');

                const response = await fetch(`/api/conversations/${currentConversationId}/archive`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to archive lead');
                }

                showNotification('Lead archived successfully!', 'success');
                document.getElementById('archiveConfirmModal').style.display = 'none';
                window.commandCenter?.conversationUI?.loadConversations();
                clearConversationView();

            } catch (error) {
                console.error('Error archiving lead:', error);
                showNotification('Failed to archive lead: ' + error.message, 'error');
            }
        }

        async function confirmDeleteLead() {
            // Get current conversation from ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            const selectedConversationId = conversationUI?.currentConversationId;
            
            if (!selectedConversationId) return;

            try {
                showNotification('Deleting lead...', 'info');

                const response = await fetch(`/api/conversations/${selectedConversationId}`, {
                    method: 'DELETE'
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error || 'Failed to delete lead');
                }

                showNotification('Lead deleted successfully!', 'warning');
                document.getElementById('deleteConfirmModal').style.display = 'none';
                window.commandCenter?.conversationUI?.loadConversations();
                clearConversationView();

            } catch (error) {
                console.error('Error deleting lead:', error);
                showNotification('Failed to delete lead: ' + error.message, 'error');
            }
        }

        function clearConversationView() {
            // Clear conversation selection in ConversationUI
            const conversationUI = window.commandCenter?.conversationUI;
            if (conversationUI) {
                conversationUI.currentConversationId = null;
                conversationUI.selectedConversation = null;
            }
            
            const conversationActions = document.getElementById('conversationActions');
            const messageInputContainer = document.getElementById('messageInputContainer');
            const messagesContainer = document.getElementById('messagesContainer');
            const conversationInfo = document.getElementById('conversationInfo');
            
            if (conversationActions) conversationActions.style.display = 'none';
            if (messageInputContainer) messageInputContainer.style.display = 'none';
            if (messagesContainer) {
                messagesContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <h3>No conversation selected</h3>
                        <p>Select a conversation from the left panel to view the message thread</p>
                    </div>
                `;
            }
            if (conversationInfo) {
                conversationInfo.className = 'conversation-info';
                conversationInfo.innerHTML = `
                    <h2>Select a conversation</h2>
                    <p>Choose a conversation from the left to view messages</p>
                `;
            }
        }

        // Initialize lead management when page loads
        initializeLeadManagement();
    </script>

    <!-- FCS Generation Modal -->
    <div id="fcsModal" class="modal fcs-modal" style="display: none;">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Generate FCS Report</h3>
                <button class="modal-close" id="closeFCSModalBtn">&times;</button>
            </div>
            <div class="modal-body">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <p style="margin: 0;">Select bank statements to analyze:</p>
                    <button id="toggleAllFcsBtn" class="btn btn-sm" style="font-size: 12px; padding: 4px 12px;">Select All</button>
                </div>
                <div id="fcsDocumentSelection" style="max-height: 300px; overflow-y: auto; border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px;">
                    <!-- Documents will be populated here -->
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelFcs">Cancel</button>
                <button id="confirmFcs" class="btn btn-primary">Generate FCS</button>
            </div>
        </div>
    </div>

    <!-- Processing Indicator -->
    <div id="processingIndicator" class="processing-overlay" style="display: none;">
        <div class="processing-content">
            <div class="spinner"></div>
            <div class="processing-text">Processing...</div>
            <div class="processing-subtext" id="processingSubtext">Please wait while we process your request</div>
        </div>
    </div>

    <!-- Lender Submission Modal -->
    <div id="lenderSubmissionModal" class="modal" style="display: none;">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h2>Send Submissions to Lenders</h2>
                <button class="modal-close" id="closeLenderSubmissionModal">&times;</button>
            </div>
            <div class="modal-body">
                <!-- Lenders Selection -->
                <div class="form-section">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h3 style="margin: 0;">Select Lenders</h3>
                        <button type="button" id="toggleAllLendersBtn" class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px;">
                            Deselect All
                        </button>
                    </div>
                    <div id="lenderSelectionList" style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <!-- Documents Selection -->
                <div class="form-section" style="margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h3 style="margin: 0;">Select Documents</h3>
                        <button type="button" id="toggleAllDocumentsBtn" class="btn btn-secondary" style="padding: 4px 12px; font-size: 12px;">
                            Select All
                        </button>
                    </div>
                    <div id="submissionDocumentList" style="max-height: 200px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
                        <!-- Populated dynamically -->
                    </div>
                </div>

                <!-- Message -->
                <div class="form-section" style="margin-top: 20px;">
                    <h3>Message</h3>
                    <textarea id="submissionMessage" rows="6" style="width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-family: inherit; font-size: 14px;"></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" id="cancelLenderSubmission">Cancel</button>
                <button class="btn btn-primary" id="confirmLenderSubmission">
                    <span id="sendSubmissionsText">Send Submissions</span>
                    <span id="sendSubmissionsLoading" style="display: none;">Sending...</span>
                </button>
            </div>
        </div>
    </div>

    <!-- Global Functions - Loaded BEFORE module script -->
    <script>
        console.log('🌐 Loading global openLeadModal function...');

        // Define openLeadModal in global scope IMMEDIATELY
        window.openLeadModal = function(mode = 'create', conversationData = null) {
            console.log(`📝 openLeadModal called in ${mode.toUpperCase()} mode`);

            // Wait for intelligence module if not ready
            if (!window.conversationUI?.intelligence) {
                console.log('⏳ Intelligence not ready, waiting...');
                setTimeout(() => window.openLeadModal(mode, conversationData), 100);
                return;
            }

            const modal = document.getElementById('editLeadInlineModal');
            const modalContent = document.getElementById('editLeadInlineContent');

            if (!modal || !modalContent) {
                console.error('❌ Modal elements not found');
                return;
            }

            const intelligence = window.conversationUI.intelligence;

            if (mode === 'create') {
                console.log('✅ Opening in CREATE mode');

                // Empty conversation data
                const emptyConversation = {
                    business_name: '', dba_name: '', lead_phone: '', business_phone: '',
                    website: '', tax_id: '', entity_type: '', industry_type: '',
                    business_address: '', business_address2: '', business_city: '',
                    business_state: '', business_zip: '', business_country: 'United States',
                    cell_phone: '', work_phone: '', fax_phone: '', annual_revenue: '',
                    monthly_revenue: '', requested_amount: '', time_in_business: '',
                    credit_score: '', years_in_business: '', owner_first_name: '',
                    owner_last_name: '', owner_email: '', owner_home_address: '',
                    owner_home_address2: '', owner_home_city: '', owner_home_state: '',
                    owner_home_zip: '', owner_home_country: 'United States',
                    ownership_percent: '', ssn: '', date_of_birth: '',
                    business_start_date: '', length_of_ownership: '', product_sold: '',
                    use_of_proceeds: '', lead_source: '', campaign: '', lead_status: '',
                    business_email: '', factor_rate: '', term_months: '', funding_date: '',
                    lead_details: {}
                };

                const formHTML = intelligence.createEditFormTemplate(emptyConversation);
                modalContent.innerHTML = formHTML;

                const modalTitle = modal.querySelector('.modal-header h3');
                if (modalTitle) modalTitle.textContent = 'Add New Lead - Comprehensive CRM';

                const generateBtn = modalContent.querySelector('#generateApplicationBtn');
                if (generateBtn) generateBtn.style.display = 'none';

                const submitBtn = modalContent.querySelector('.update-btn');
                if (submitBtn) {
                    submitBtn.textContent = 'Create Lead';
                    submitBtn.style.background = '#10b981';
                }

                // Attach form submission handler
                const form = modalContent.querySelector('#editLeadForm');
                if (form) {
                    form.onsubmit = async (e) => {
                        e.preventDefault();
                        await handleCreateFormSubmit(e);
                    };
                    console.log('✅ Form submit handler attached');
                }

                console.log('✅ Form generated for CREATE mode');
            } else if (mode === 'edit') {
                console.log('✅ Opening in EDIT mode');

                if (!conversationData) {
                    console.error('❌ No conversation data provided for edit mode');
                    return;
                }

                const formHTML = intelligence.createEditFormTemplate(conversationData);
                modalContent.innerHTML = formHTML;

                const modalTitle = modal.querySelector('.modal-header h3');
                if (modalTitle) modalTitle.textContent = 'Edit Lead Information';

                // Attach form submission handler for edit
                const form = modalContent.querySelector('#editLeadForm');
                if (form) {
                    form.onsubmit = async (e) => {
                        e.preventDefault();
                        await handleEditFormSubmit(e, conversationData.id);
                    };
                    console.log('✅ Edit form submit handler attached');
                }

                console.log('✅ Form generated for EDIT mode');
            }

            // Close handlers
            const closeBtn = document.getElementById('closeEditLeadInlineModal');
            if (closeBtn) {
                closeBtn.onclick = () => { modal.style.display = 'none'; };
            }

            modal.onclick = (e) => {
                if (e.target === modal) modal.style.display = 'none';
            };

            modal.style.display = 'flex';
            console.log('✅ Modal displayed');
        };

        console.log('✅ openLeadModal defined globally');

        // Debug helper to test modal function
        window.testOpenLeadModal = function() {
            console.log('🧪 Testing openLeadModal function...');
            console.log('Function exists:', !!window.openLeadModal);
            console.log('Function type:', typeof window.openLeadModal);

            if (window.openLeadModal) {
                console.log('Calling openLeadModal("create")...');
                try {
                    window.openLeadModal('create');
                    console.log('✅ Function executed');
                } catch (error) {
                    console.error('❌ Error:', error);
                }
            }
        };

        console.log('💡 Test helper added: window.testOpenLeadModal()');

        // Auto-formatting functions
        function formatSSN(value) {
            const digits = value.replace(/\D/g, '');
            if (digits.length <= 3) return digits;
            if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
            return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
        }

        function formatPhone(value) {
            const digits = value.replace(/\D/g, '');
            if (digits.length <= 3) return digits;
            if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
            return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
        }

        function formatEIN(value) {
            const digits = value.replace(/\D/g, '');
            if (digits.length <= 2) return digits;
            return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
        }

        function stripFormatting(value) {
            return value.replace(/\D/g, '');
        }

        function attachInputFormatters(form) {
            // SSN fields
            const ssnFields = form.querySelectorAll('input[name="ownerSSN"]');
            ssnFields.forEach(field => {
                field.addEventListener('input', (e) => {
                    const cursorPos = e.target.selectionStart;
                    const oldLength = e.target.value.length;
                    e.target.value = formatSSN(e.target.value);
                    const newLength = e.target.value.length;
                    e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
                });
            });

            // Phone fields
            const phoneFields = form.querySelectorAll('input[name="primaryPhone"], input[name="cellPhone"], input[name="workPhone"], input[name="faxPhone"]');
            phoneFields.forEach(field => {
                field.addEventListener('input', (e) => {
                    const cursorPos = e.target.selectionStart;
                    const oldLength = e.target.value.length;
                    e.target.value = formatPhone(e.target.value);
                    const newLength = e.target.value.length;
                    e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
                });
            });

            // EIN/Tax ID fields
            const einFields = form.querySelectorAll('input[name="federalTaxId"]');
            einFields.forEach(field => {
                field.addEventListener('input', (e) => {
                    const cursorPos = e.target.selectionStart;
                    const oldLength = e.target.value.length;
                    e.target.value = formatEIN(e.target.value);
                    const newLength = e.target.value.length;
                    e.target.setSelectionRange(cursorPos + (newLength - oldLength), cursorPos + (newLength - oldLength));
                });
            });
        }

        // Handle new lead form submission
        async function handleNewLeadSubmit(e) {
            e.preventDefault();
            console.log('📤 Submitting new lead...');

            const formData = new FormData(e.target);
            const data = {};

            // Convert form data to object - use exact field names the backend expects
            for (const [key, value] of formData.entries()) {
                if (value) {
                    // Strip formatting from SSN, phone, and EIN fields
                    if (key === 'ownerSSN' || key === 'primaryPhone' || key === 'cellPhone' ||
                        key === 'workPhone' || key === 'faxPhone' || key === 'federalTaxId') {
                        data[key] = stripFormatting(value);
                    } else {
                        data[key] = value;
                    }
                }
            }

            const submitBtn = e.target.querySelector('[type="submit"]');
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Creating...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/conversations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    alert('✅ Lead created successfully!');
                    document.getElementById('addLeadModal').style.display = 'none';
                    location.reload(); // Refresh to show new lead
                } else {
                    throw new Error(result.error || 'Failed to create lead');
                }
            } catch (error) {
                console.error('Error creating lead:', error);
                alert('❌ Error: ' + error.message);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }

        // Simple standalone function to open the add lead modal
        window.openNewLeadModal = function() {
            console.log('🆕 Opening standalone Add Lead modal');
            const modal = document.getElementById('addLeadModal');
            if (!modal) {
                console.error('❌ Add Lead modal not found');
                return;
            }

            // Inject the generated form
            const modalBody = modal.querySelector('.modal-body');
            if (modalBody && typeof generateNewLeadForm === 'function') {
                modalBody.innerHTML = generateNewLeadForm();

                // Attach submit handler
                const form = document.getElementById('newLeadForm');
                if (form) {
                    form.onsubmit = async (e) => {
                        e.preventDefault();
                        await handleNewLeadSubmit(e);
                    };

                    // Attach auto-formatters
                    attachInputFormatters(form);
                }
            }

            modal.style.display = 'flex';
        };

        // Toggle delete mode - show/hide checkboxes
        window.toggleDeleteMode = function() {
            const conversationsList = document.querySelector('.conversations-list');
            const toggleBtn = document.getElementById('toggleDeleteModeBtn');

            if (!conversationsList) return;

            // Toggle delete mode class
            const isDeleteMode = conversationsList.classList.toggle('delete-mode');

            // Update button text and style
            if (isDeleteMode) {
                toggleBtn.textContent = 'Cancel';
                toggleBtn.classList.remove('secondary');
                toggleBtn.classList.add('danger');
            } else {
                toggleBtn.textContent = 'Delete Conversations';
                toggleBtn.classList.remove('danger');
                toggleBtn.classList.add('secondary');

                // Clear any selections and hide delete button
                if (window.conversationUI && window.conversationUI.core) {
                    window.conversationUI.core.selectedForDeletion.clear();
                    window.conversationUI.core.updateDeleteButtonVisibility();

                    // Uncheck all checkboxes
                    document.querySelectorAll('.delete-checkbox').forEach(checkbox => {
                        checkbox.checked = false;
                    });

                    // Remove checked styling
                    document.querySelectorAll('.conversation-item').forEach(item => {
                        item.classList.remove('checked-for-deletion');
                    });
                }
            }
        };

        // Close button handler
        document.addEventListener('DOMContentLoaded', function() {
            const closeBtn = document.getElementById('closeAddLeadModal');
            const cancelBtn = document.getElementById('cancelAddLead');
            const modal = document.getElementById('addLeadModal');

            if (closeBtn) {
                closeBtn.addEventListener('click', function() {
                    modal.style.display = 'none';
                });
            }

            if (cancelBtn) {
                cancelBtn.addEventListener('click', function() {
                    modal.style.display = 'none';
                });
            }

            // Close on outside click
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) {
                        modal.style.display = 'none';
                    }
                });
            }
        });

        console.log('✅ openNewLeadModal defined globally');

        // ==========================================
        // [MODULE: MARKET NEWS FEED - FINAL FIX]
        // ==========================================

        // 1. Make function globally available immediately
        window.loadMarketNews = async function() {
            console.log("📰 loadMarketNews: Attempting to load...");

            const container = document.getElementById('newsFeedContainer');
            if (!container) {
                console.warn("❌ News container not found yet.");
                return;
            }

            // 2. Show Loading UI immediately (so you know it's trying)
            if (container.innerHTML.trim() === '') {
                container.innerHTML = `
                    <div style="padding: 40px 20px; text-align: center; color: #9ca3af;">
                        <i class="fas fa-circle-notch fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                        <div style="font-size: 12px; font-weight: 500;">Connecting to Wire...</div>
                    </div>
                `;
            }

            try {
                // Use direct fetch instead of commandCenter.apiCall
                console.log("📡 Fetching news...");
                const response = await fetch('/api/news', {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Local-Dev': 'true'  // Bypass auth for local dev
                    },
                    credentials: 'include'  // Include session cookies
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                if (data.success && data.data && data.data.length > 0) {
                    renderNewsItems(container, data.data);
                    console.log("✅ News loaded successfully");
                } else {
                    throw new Error("No data returned");
                }

            } catch (error) {
                console.error("❌ News Load Failed:", error);
                loadMockNews(container);
            }
        };

        // Helper: Render the cards
        function renderNewsItems(container, items) {
            container.innerHTML = ''; // Clear loading
            items.forEach(item => {
                // Calculate Time
                let timeDisplay = item.date;
                if (item.pubDate) {
                    const diff = Math.floor((new Date() - new Date(item.pubDate)) / 1000);
                    if (diff < 3600) timeDisplay = Math.floor(diff / 60) + "m ago";
                    else if (diff < 86400) timeDisplay = Math.floor(diff / 3600) + "h ago";
                    else timeDisplay = Math.floor(diff / 86400) + "d ago";
                }

                // Style Logic
                const isDebanked = (item.source || '').toLowerCase().includes('debanked');
                const bgStyle = isDebanked ? '#dcfce7' : '#f3f4f6';
                const iconColor = isDebanked ? '#166534' : '#9ca3af';
                const icon = isDebanked ? 'fas fa-bolt' : 'fas fa-newspaper';

                const html = `
                    <div class="news-card" onclick="window.open('${item.link}', '_blank')">
                        <div class="news-image" style="background-color: ${bgStyle};">
                            <i class="${icon}" style="color: ${iconColor};"></i>
                        </div>
                        <div class="news-content">
                            <div class="news-meta">
                                <span class="news-source ${isDebanked ? 'source-highlight' : ''}">${item.source}</span>
                                <span class="news-dot">•</span>
                                <span class="news-time">${timeDisplay}</span>
                            </div>
                            <h4 class="news-title">${item.title}</h4>
                        </div>
                        <div class="news-arrow"><i class="fas fa-chevron-right"></i></div>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
            });
        }

        function loadMockNews(container) {
            console.log("⚠️ Using Mock Data");
            const mocks = [
                { title: "NY Disclosure Laws: Compliance Guide 2025", source: "deBanked", date: "2h ago", link: "#" },
                { title: "Lender 'Credibly' Reports Record Volume", source: "DailyFunder", date: "5h ago", link: "#" }
            ];
            renderNewsItems(container, mocks);
        }

        // 4. AUTO-START TRIGGER
        document.addEventListener('DOMContentLoaded', () => {
            // Try to load immediately
            if (!window.currentConversationId) {
                window.loadMarketNews();
            }
        });

        console.log('✅ News feed module loaded');
