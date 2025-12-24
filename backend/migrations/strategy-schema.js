// backend/migrations/strategy-schema.js
// Auto-runs on server start to ensure schema is up to date

async function runStrategyMigration(db) {
    console.log('🔧 Running Strategy Schema Migration...');

    try {
        // 1. Add columns to lead_strategy if they don't exist
        await db.query(`
            ALTER TABLE lead_strategy
            ADD COLUMN IF NOT EXISTS fcs_analysis_id UUID,
            ADD COLUMN IF NOT EXISTS raw_ai_response JSONB,
            ADD COLUMN IF NOT EXISTS avg_revenue NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS avg_balance NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS current_positions INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS total_withholding NUMERIC(5,2),
            ADD COLUMN IF NOT EXISTS recommended_funding_min NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS recommended_funding_max NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS recommended_payment NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS recommended_term INTEGER,
            ADD COLUMN IF NOT EXISTS recommended_term_unit VARCHAR(10),
            ADD COLUMN IF NOT EXISTS analysis_version VARCHAR(20) DEFAULT 'v1';
        `);
        console.log('   ✅ lead_strategy columns updated');

        // 2. Create strategy_scenarios table
        await db.query(`
            CREATE TABLE IF NOT EXISTS strategy_scenarios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                strategy_id UUID,
                conversation_id UUID,
                tier VARCHAR(20) NOT NULL,
                funding_amount NUMERIC(12,2),
                term INTEGER,
                term_unit VARCHAR(10),
                payment_amount NUMERIC(12,2),
                payment_frequency VARCHAR(10),
                factor_rate NUMERIC(5,4),
                withhold_addition NUMERIC(5,2),
                total_withhold NUMERIC(5,2),
                reasoning TEXT,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);

        // Create indexes if they don't exist
        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_scenarios_conversation ON strategy_scenarios(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_scenarios_tier ON strategy_scenarios(tier);
        `);
        console.log('   ✅ strategy_scenarios table ready');

        // 3. Create offer_comparisons table
        await db.query(`
            CREATE TABLE IF NOT EXISTS offer_comparisons (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                conversation_id UUID,
                strategy_id UUID,
                lender_submission_id UUID,
                lender_name VARCHAR(255),

                predicted_funding NUMERIC(12,2),
                predicted_term INTEGER,
                predicted_payment NUMERIC(12,2),
                predicted_factor NUMERIC(5,4),

                actual_funding NUMERIC(12,2),
                actual_term INTEGER,
                actual_payment NUMERIC(12,2),
                actual_factor NUMERIC(5,4),

                funding_variance NUMERIC(12,2),
                funding_variance_pct NUMERIC(5,2),

                was_accepted BOOLEAN DEFAULT FALSE,
                was_funded BOOLEAN DEFAULT FALSE,
                funded_date DATE,

                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_comparisons_conversation ON offer_comparisons(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_comparisons_funded ON offer_comparisons(was_funded);
        `);
        console.log('   ✅ offer_comparisons table ready');

        // 4. Create analytics view
        await db.query(`
            CREATE OR REPLACE VIEW strategy_accuracy_report AS
            SELECT
                DATE_TRUNC('week', oc.created_at) as week,
                COUNT(*) as total_offers,
                COUNT(*) FILTER (WHERE oc.was_funded) as funded_deals,
                ROUND(AVG(oc.funding_variance_pct)::numeric, 2) as avg_variance_pct,
                ROUND(AVG(oc.actual_funding)::numeric FILTER (WHERE oc.was_funded), 2) as avg_funded_amount,
                ROUND(AVG(ls.avg_revenue)::numeric, 2) as avg_merchant_revenue,
                COUNT(*) FILTER (WHERE ABS(COALESCE(oc.funding_variance_pct, 0)) < 10) as accurate_predictions
            FROM offer_comparisons oc
            LEFT JOIN lead_strategy ls ON oc.strategy_id = ls.id
            GROUP BY DATE_TRUNC('week', oc.created_at)
            ORDER BY week DESC;
        `);
        console.log('   ✅ strategy_accuracy_report view created');

        console.log('✅ Strategy Schema Migration Complete!');
        return true;

    } catch (error) {
        console.error('❌ Strategy Migration Error:', error.message);
        // Don't crash the server, just log it
        return false;
    }
}

module.exports = { runStrategyMigration };
