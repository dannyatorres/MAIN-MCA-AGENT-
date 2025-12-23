// js/formatters.js

export const Formatters = {
    // Phone: (123) 456-7890
    phone(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    },

    // Currency: $1,234.56
    currency(value) {
        if (!value && value !== 0) return '';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0
        }).format(value);
    },

    // SSN: XXX-XX-XXXX
    ssn(value) {
        if (!value) return '';
        const digits = value.replace(/\D/g, '');
        if (digits.length <= 3) return digits;
        if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    },

    // Clean for API: Remove non-numeric characters (except dots for currency)
    strip(value) {
        if (!value) return null;
        return value.toString().replace(/[^0-9.]/g, '');
    }
};

// Expose globally for legacy HTML onclick handlers if needed
window.Formatters = Formatters;
