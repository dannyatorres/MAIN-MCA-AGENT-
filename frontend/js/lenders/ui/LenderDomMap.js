export const DOM = {
    FORM: {
        ID: 'lenderForm',
        INPUTS: {
            BUSINESS_NAME: 'lenderBusinessName',
            POSITION: 'lenderPosition',
            START_DATE: 'lenderStartDate',
            REVENUE: 'lenderRevenue',
            FICO: 'lenderFico',
            STATE: 'lenderState',
            INDUSTRY: 'lenderIndustry',
            DEPOSITS: 'lenderDepositsPerMonth',
            NEGATIVE_DAYS: 'lenderNegativeDays',
            WITHHOLDING: 'lenderWithholding',
            CURRENT_POSITIONS: 'lenderCurrentPositions',
            ADDITIONAL_NOTES: 'lenderAdditionalNotes'
        },
        CHECKBOXES: {
            SOLE_PROP: 'lenderSoleProp',
            NON_PROFIT: 'lenderNonProfit',
            MERCURY_BANK: 'lenderMercuryBank',
            REVERSE_CONSOLIDATION: 'lenderReverseConsolidation'
        },
        BUTTONS: {
            PROCESS: 'processLendersBtn',
            SKIP: 'skipToSendBtn',
            CLEAR_CACHE: 'clearLenderCacheBtn'
        }
    },
    RESULTS: {
        CONTAINER: 'lenderResults',
        QUALIFIED_SECTION: 'qualifiedSection',
        NON_QUAL_LIST: 'nonQualList'
    },
    SUBMISSION: {
        MODAL: 'lenderSubmissionModal',
        LENDER_LIST: 'lenderSelectionList',
        DOC_LIST: 'submissionDocumentList',
        SEND_BTN: 'confirmLenderSubmission',
        SEARCH_INPUT: 'lenderSearchInput',
        TOGGLE_LENDERS: 'deselectAllLendersBtn',
        TOGGLE_DOCS: 'selectAllDocsBtn',
        SHOW_ALL_TOGGLE: 'overrideToggleBtn',
        COUNT: 'lenderCountCard'
    },
    RESPONSE: {
        MODAL: 'lenderResponseModal',
        SAVE_BTN: 'saveLenderResponse'
    },
    INLINE_MODAL: {
        WRAP: 'lendersInlineModal',
        CONTENT: 'lendersInlineContent',
        CLOSE_BTN: 'closeLendersInlineModal'
    }
};
