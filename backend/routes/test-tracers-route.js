// backend/routes/test-tracers-route.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

router.post('/test-ssn', async (req, res) => {
    const { ssn } = req.body;
    const cleanSsn = ssn ? ssn.replace(/\D/g, '') : '';

    console.log(`[TEST] Searching SSN: ${cleanSsn}`);

    const payload = {
        "FirstName": "",
        "MiddleName": "",
        "LastName": "",
        "clientid": "",
        "Phone": "",
        "Email": "",
        "tahoeId": "",
        "DriverLicenseNumber": "",
        "Dob": "",
        "AgeRange": "",
        "SSN": cleanSsn,
        "Addresses": [
            {
                "Addressline1": "",
                "addressLine2": ""
            }
        ],
        "Page": 1,
        "ResultsPerPage": "100"
    };

    try {
        const response = await axios.post('https://api.galaxysearchapi.com/PersonSearch', payload, {
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'galaxy-ap-name': AP_NAME,
                'galaxy-ap-password': AP_PASSWORD,
                'galaxy-search-type': 'Person',
                'galaxy-client-type': 'Api'
            }
        });

        console.log(`[TEST] Raw response received`);
        res.json({
            success: true,
            payload: payload,
            response: response.data
        });

    } catch (error) {
        console.log(`[TEST] Error:`, error.message);
        res.json({
            success: false,
            payload: payload,
            error: error.response ? error.response.data : error.message
        });
    }
});

module.exports = router;
