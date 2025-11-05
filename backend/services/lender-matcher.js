// Lender Qualification and Matching Service
const fetch = require('node-fetch');
const { n8n } = require('../config/credentials');
const dbModule = require('../database/db');
const db = dbModule.getInstance();
const EventEmitter = require('events');

class LenderMatcher extends EventEmitter {
    constructor() {
        super();
        this.webhookUrl = 'https://dannyatorres.app.n8n.cloud/webhook/lender-qualify';
        this.timeout = 30000; // 30 seconds timeout
    }

    // Main qualification function
    async qualifyLenders(conversationId, businessData, fcsData = null) {
        try {
            console.log(`Running lender qualification for conversation ${conversationId}`);

            // Prepare qualification data
            const qualificationData = this.prepareQualificationData(businessData, fcsData);
            
            console.log('Sending to lender qualification webhook:', qualificationData);

            // Call n8n webhook for lender qualification
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(qualificationData),
                timeout: this.timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const responseText = await response.text();
            console.log('Raw lender qualification response:', responseText);

            let results;
            try {
                results = JSON.parse(responseText);
            } catch (parseError) {
                console.error('Failed to parse lender qualification response:', parseError);
                results = { qualified: [], nonQualified: [], summary: { qualified: 0, nonQualified: 0, totalProcessed: 0 } };
            }

            // Process and save results
            const processedResults = await this.processQualificationResults(conversationId, results, qualificationData);

            this.emit('lenders_qualified', {
                conversationId,
                results: processedResults,
                qualificationData
            });

            return processedResults;

        } catch (error) {
            console.error('Error qualifying lenders:', error);
            
            this.emit('qualification_error', {
                conversationId,
                error: error.message,
                businessData
            });

            throw error;
        }
    }

    // Prepare data for qualification API
    prepareQualificationData(businessData, fcsData = null) {
        // Calculate TIB (Time in Business) if start date is provided
        let tibMonths = 0;
        if (businessData.startDate) {
            tibMonths = this.calculateTIB(businessData.startDate);
        }

        // Use FCS data if available, otherwise use provided business data
        const revenue = fcsData?.monthly_revenue || businessData.monthlyRevenue || businessData.revenue || 0;
        const negativeDays = fcsData?.negative_days || businessData.negativeDays || 0;
        const depositsPerMonth = fcsData?.deposits_per_month || businessData.depositsPerMonth || 0;

        return {
            businessName: businessData.businessName || businessData.business_name || 'Business',
            requestedPosition: businessData.requestedPosition || businessData.position || 1,
            position: businessData.position || 1,
            startDate: businessData.startDate || '',
            tib: tibMonths,
            monthlyRevenue: revenue,
            revenue: revenue, // Keep both for compatibility
            fico: businessData.fico || 650, // Default FICO if not provided
            state: (businessData.state || '').toUpperCase(),
            industry: businessData.industry || '',
            depositsPerMonth: depositsPerMonth,
            negativeDays: negativeDays,
            isSoleProp: businessData.isSoleProp || businessData.soleProp || false,
            soleProp: businessData.soleProp || false, // Keep both
            isNonProfit: businessData.isNonProfit || businessData.nonProfit || false,
            nonProfit: businessData.nonProfit || false, // Keep both
            hasMercuryBank: businessData.hasMercuryBank || businessData.mercuryBank || false,
            mercuryBank: businessData.mercuryBank || false, // Keep both
            currentPositions: businessData.currentPositions || '',
            additionalNotes: businessData.additionalNotes || '',
            // Additional fields from FCS if available
            existingMCAs: fcsData?.existing_mcas || [],
            cashFlowScore: fcsData?.cash_flow_score || null,
            riskFactors: fcsData?.risk_factors || []
        };
    }

    // Process qualification results and save to database
    async processQualificationResults(conversationId, results, qualificationData) {
        const processedResults = {
            qualified: [],
            nonQualified: [],
            summary: {
                qualified: 0,
                nonQualified: 0,
                totalProcessed: 0
            }
        };

        // Process qualified lenders
        if (results.qualified && Array.isArray(results.qualified)) {
            processedResults.qualified = results.qualified.map((lender, index) => ({
                name: lender['Lender Name'] || lender.name || `Lender ${index + 1}`,
                tier: lender.Tier || lender.tier || null,
                position: qualificationData.position,
                qualified: true,
                is_preferred: lender.isPreferred || lender.is_preferred || false,
                max_amount: this.extractMaxAmount(lender),
                factor_rate: this.extractFactorRate(lender),
                term_months: this.extractTermMonths(lender),
                match_score: this.calculateMatchScore(lender, qualificationData),
                requirements: this.extractRequirements(lender)
            }));

            processedResults.summary.qualified = processedResults.qualified.length;
        }

        // Process non-qualified lenders
        if (results.nonQualified && Array.isArray(results.nonQualified)) {
            processedResults.nonQualified = results.nonQualified.map((item, index) => ({
                name: item.lender || item.name || `Lender ${index + 1}`,
                tier: item.Tier || item.tier || null,
                position: qualificationData.position,
                qualified: false,
                blocking_reason: item.blockingRule || item.reason || 'Criteria not met',
                is_preferred: false,
                max_amount: this.extractMaxAmount(item),
                factor_rate: this.extractFactorRate(item),
                term_months: this.extractTermMonths(item),
                match_score: null,
                requirements: this.extractRequirements(item)
            }));

            processedResults.summary.nonQualified = processedResults.nonQualified.length;
        }

        processedResults.summary.totalProcessed = processedResults.summary.qualified + processedResults.summary.nonQualified;

        // Save to database
        if (processedResults.qualified.length > 0 || processedResults.nonQualified.length > 0) {
            const allLenders = [...processedResults.qualified, ...processedResults.nonQualified];
            await db.saveLenderMatches(conversationId, allLenders);
        }

        // Log the qualification action (commented out - method doesn't exist)
        // await db.logAction(
        //     conversationId,
        //     'lender_qualification',
        //     {
        //         qualification_data: qualificationData,
        //         results_summary: processedResults.summary
        //     },
        //     'system'
        // );

        return processedResults;
    }

    // Calculate Time in Business in months
    calculateTIB(startDateStr) {
        if (!startDateStr || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(startDateStr)) {
            return 0;
        }
        
        const parts = startDateStr.split('/');
        const startDate = new Date(parts[2], parts[0] - 1, parts[1]);
        const today = new Date();
        
        const months = (today.getFullYear() - startDate.getFullYear()) * 12 + 
                      (today.getMonth() - startDate.getMonth());
        
        return months >= 0 ? months : 0;
    }

    // Extract maximum funding amount from lender data
    extractMaxAmount(lender) {
        // Look for amount in various fields
        const amountFields = ['maxAmount', 'max_amount', 'amount', 'fundingAmount'];
        
        for (const field of amountFields) {
            if (lender[field] && typeof lender[field] === 'number') {
                return lender[field];
            }
        }

        // Try to parse from text descriptions
        const description = lender.description || lender.notes || '';
        const amountMatch = description.match(/\$?([\d,]+)k?/);
        if (amountMatch) {
            let amount = parseInt(amountMatch[1].replace(/,/g, ''));
            if (description.includes('k') || description.includes('K')) {
                amount *= 1000;
            }
            return amount;
        }

        return null;
    }

    // Extract factor rate from lender data
    extractFactorRate(lender) {
        const rateFields = ['factorRate', 'factor_rate', 'rate'];
        
        for (const field of rateFields) {
            if (lender[field] && typeof lender[field] === 'number') {
                return lender[field];
            }
        }

        // Parse from text
        const description = lender.description || lender.notes || '';
        const rateMatch = description.match(/([\d.]+)x/);
        if (rateMatch) {
            return parseFloat(rateMatch[1]);
        }

        return null;
    }

    // Extract term length in months
    extractTermMonths(lender) {
        const termFields = ['termMonths', 'term_months', 'term'];
        
        for (const field of termFields) {
            if (lender[field] && typeof lender[field] === 'number') {
                return lender[field];
            }
        }

        // Parse from text
        const description = lender.description || lender.notes || '';
        const termMatch = description.match(/(\d+)\s*month/i);
        if (termMatch) {
            return parseInt(termMatch[1]);
        }

        return 12; // Default to 12 months
    }

    // Calculate match score based on various factors
    calculateMatchScore(lender, qualificationData) {
        let score = 50; // Base score

        // Tier bonus (lower tier = higher score)
        const tier = lender.Tier || lender.tier;
        if (tier && typeof tier === 'number') {
            score += (6 - Math.min(tier, 5)) * 10; // Tier 1 gets 50 bonus, Tier 5 gets 10 bonus
        }

        // Preferred industry match
        if (lender.isPreferred || lender.is_preferred) {
            score += 20;
        }

        // Revenue matching
        const lenderMaxAmount = this.extractMaxAmount(lender);
        if (lenderMaxAmount && qualificationData.monthlyRevenue) {
            const requestedAmount = qualificationData.monthlyRevenue * 3; // Typical 3x monthly revenue
            if (lenderMaxAmount >= requestedAmount) {
                score += 15;
            }
        }

        // FICO score consideration
        if (qualificationData.fico >= 700) {
            score += 10;
        } else if (qualificationData.fico >= 650) {
            score += 5;
        }

        // Time in business bonus
        if (qualificationData.tib >= 24) {
            score += 10;
        } else if (qualificationData.tib >= 12) {
            score += 5;
        }

        // Negative days penalty
        if (qualificationData.negativeDays > 30) {
            score -= 10;
        } else if (qualificationData.negativeDays > 15) {
            score -= 5;
        }

        return Math.max(0, Math.min(100, score)); // Clamp between 0-100
    }

    // Extract requirements from lender data
    extractRequirements(lender) {
        const requirements = {};

        // Common requirement fields
        const reqFields = {
            min_revenue: ['minRevenue', 'min_revenue', 'minimumRevenue'],
            min_fico: ['minFico', 'min_fico', 'minimumFico'],
            min_tib: ['minTIB', 'min_tib', 'minimumTIB'],
            max_negative_days: ['maxNegativeDays', 'max_negative_days'],
            states_excluded: ['excludedStates', 'excluded_states'],
            industries_excluded: ['excludedIndustries', 'excluded_industries']
        };

        for (const [reqKey, fields] of Object.entries(reqFields)) {
            for (const field of fields) {
                if (lender[field] !== undefined) {
                    requirements[reqKey] = lender[field];
                    break;
                }
            }
        }

        return requirements;
    }

    // Get qualified lenders for a conversation
    async getQualifiedLenders(conversationId) {
        try {
            return await db.getLenderMatches(conversationId);
        } catch (error) {
            console.error('Error getting qualified lenders:', error);
            return [];
        }
    }

    // Get top lender recommendation
    async getTopLenderRecommendation(conversationId) {
        try {
            const lenders = await this.getQualifiedLenders(conversationId);
            
            if (lenders.length === 0) {
                return null;
            }

            // Sort by tier (lower is better), then by match score (higher is better)
            lenders.sort((a, b) => {
                if (a.tier !== b.tier) {
                    return (a.tier || 999) - (b.tier || 999);
                }
                return (b.match_score || 0) - (a.match_score || 0);
            });

            return lenders[0];

        } catch (error) {
            console.error('Error getting top lender recommendation:', error);
            return null;
        }
    }

    // Format lenders for display/messaging
    formatLendersForDisplay(lenders, maxLenders = 5) {
        if (!lenders || lenders.length === 0) {
            return "No qualified lenders found.";
        }

        const topLenders = lenders.slice(0, maxLenders);
        let message = `Found ${lenders.length} qualified lender${lenders.length > 1 ? 's' : ''}:\n\n`;

        // Group by tier
        const tierGroups = {};
        topLenders.forEach(lender => {
            const tier = lender.tier || 'Other';
            if (!tierGroups[tier]) tierGroups[tier] = [];
            tierGroups[tier].push(lender);
        });

        // Sort tiers
        const sortedTiers = Object.keys(tierGroups).sort((a, b) => {
            if (a === 'Other') return 1;
            if (b === 'Other') return -1;
            return parseInt(a) - parseInt(b);
        });

        sortedTiers.forEach(tier => {
            message += `Tier ${tier}:\n`;
            tierGroups[tier].forEach(lender => {
                const preferred = lender.is_preferred ? ' ⭐' : '';
                message += `• ${lender.lender_name}${preferred}\n`;
            });
            message += '\n';
        });

        if (lenders.length > maxLenders) {
            message += `...and ${lenders.length - maxLenders} more lenders available.`;
        }

        return message.trim();
    }

    // Format lenders for SMS (shorter format)
    formatLendersForSMS(lenders, maxLenders = 3) {
        if (!lenders || lenders.length === 0) {
            return "No qualified lenders found.";
        }

        const topLenders = lenders.slice(0, maxLenders);
        let message = `${lenders.length} lender${lenders.length > 1 ? 's' : ''} qualified:\n`;

        topLenders.forEach((lender, index) => {
            const preferred = lender.is_preferred ? '⭐' : '';
            message += `${index + 1}. ${lender.lender_name} (T${lender.tier || '?'})${preferred}\n`;
        });

        if (lenders.length > maxLenders) {
            message += `+${lenders.length - maxLenders} more available`;
        }

        return message.trim();
    }

    // Re-qualify lenders (for when business data changes)
    async requalifyLenders(conversationId) {
        try {
            // Get conversation and context
            const conversation = await db.supabase
                .from('conversations')
                .select('*')
                .eq('id', conversationId)
                .single();

            if (!conversation.data) {
                throw new Error('Conversation not found');
            }

            // Get business context
            const context = await db.getAllContext(conversationId);
            
            // Get FCS data if available
            const fcsData = await db.getFCSResults(conversationId);

            // Prepare business data
            const businessData = {
                businessName: conversation.data.business_name,
                position: context.requested_position || 1,
                revenue: context.monthly_revenue || fcsData?.monthly_revenue,
                fico: context.fico_score || 650,
                state: context.state || '',
                industry: context.industry || '',
                startDate: context.business_start_date || '',
                depositsPerMonth: context.deposits_per_month || fcsData?.deposits_per_month,
                negativeDays: context.negative_days || fcsData?.negative_days
            };

            return await this.qualifyLenders(conversationId, businessData, fcsData);

        } catch (error) {
            console.error('Error re-qualifying lenders:', error);
            throw error;
        }
    }
}

module.exports = LenderMatcher;