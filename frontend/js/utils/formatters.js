// js/utils/formatters.js

/**
 * Text Formatting Utilities
 * Pure functions that take a string and return a formatted string.
 */
export const Formatters = {
    /**
     * Formats 9 digits into XXX-XX-XXXX
     */
    ssn(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    },

    /**
     * Formats 10 digits into (XXX) XXX-XXXX
     */
    phone(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    },

    /**
     * Formats 9 digits into XX-XXXXXXX (Employer ID Number)
     */
    ein(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 2) return digits;
        return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
    },

    /**
     * Strips all non-numeric characters
     * Useful before sending data to API
     */
    strip(value) {
        if (!value) return '';
        return value.replace(/\D/g, '');
    },

    /**
     * Formats currency (USD)
     * e.g. 1000 -> $1,000
     */
    currency(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(value);
    }
};

/**
 * Validation Utilities
 * Pure functions that return boolean based on regex checks.
 */
export const Validators = {
    /**
     * Checks standard email format
     */
    email(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * Checks standard US phone formats
     */
    phone(phone) {
        const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
        return phoneRegex.test(phone);
    },

    /**
     * Checks if value is not empty/null/undefined
     */
    required(value) {
        return value !== null && value !== undefined && value.toString().trim() !== '';
    }
};
