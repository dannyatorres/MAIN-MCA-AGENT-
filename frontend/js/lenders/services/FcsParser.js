export const parseFcsReport = (reportText) => {
    if (!reportText) return {};

    return {
        businessName: (reportText.match(/Business Name:\s*(.+?)(?:•|\n|$)/i) || [])[1]?.trim(),
        position: (reportText.match(/Looking for\s*(\d+)/i) || [])[1],
        revenue: (reportText.match(/Average True Revenue:\s*\$([\d,]+)/i) || [])[1]?.replace(/,/g, ''),
        negativeDays: (reportText.match(/Average Negative Days:\s*(\d+)/i) || [])[1],
        deposits: (reportText.match(/Average Number of Deposits:\s*(\d+)/i) || [])[1],
        state: (reportText.match(/State:\s*([A-Z]{2})/i) || [])[1],
        industry: (reportText.match(/Industry:\s*(.+?)(?:•|\n|$)/i) || [])[1]?.trim()
    };
};
