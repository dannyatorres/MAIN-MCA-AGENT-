// test-tracers.js
const axios = require('axios');
require('dotenv').config();

const AP_NAME = process.env.TRACERS_AP_NAME;
const AP_PASSWORD = process.env.TRACERS_AP_PASSWORD;

async function testSSN() {
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
        "SSN": "493705875",
        "Addresses": [
            {
                "Addressline1": "",
                "addressLine2": ""
            }
        ],
        "Page": 1,
        "ResultsPerPage": "100"
    };

    console.log("=== TRACERS TEST ===");
    console.log("AP_NAME:", AP_NAME);
    console.log("AP_PASSWORD:", AP_PASSWORD ? "[SET]" : "[MISSING]");
    console.log("PAYLOAD:", JSON.stringify(payload, null, 2));

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

        console.log("\n=== FULL RAW RESPONSE ===");
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.log("\n=== ERROR ===");
        if (error.response) {
            console.log("Status:", error.response.status);
            console.log("Data:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.log(error.message);
        }
    }
}

testSSN();
