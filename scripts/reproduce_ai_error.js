const axios = require('axios');

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OTJjZTAzMzIwMThjYjZjMjBkYTVkY2IiLCJjbGllbnRJZCI6IjY5MmNlMDMzMjAxOGNiNmMyMGRhNWRjOSIsImlhdCI6MTc2NDU0ODY2MCwiZXhwIjoxNzY1MTUzNDYwfQ.F7cbZgdbaBH_NdD5BcUQJzJCxe_gC_X1mAtt3MHe40Q";
const entryId = "692d6eb5e3c4a313270e526a";
const apiUrl = "http://localhost:5002/api/ai/chat/" + entryId;

const jwt = require('jsonwebtoken');
require('dotenv').config();

async function reproduceError() {
    // Verify token locally first
    try {
        const secret = process.env.JWT_SECRET || '4899577348rfhfjfjkd!';
        const decoded = jwt.verify(token, secret);
        console.log("Token is valid locally. User ID:", decoded.userId);
    } catch (err) {
        console.error("Token verification failed locally:", err.message);
        // Continue to request anyway to see backend response
    }

    try {
        console.log(`Sending request to ${apiUrl}...`);
        const response = await axios.post(
            apiUrl,
            { message: "Hello, this is a test." },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log("Success:", response.data);
    } catch (error) {
        console.error("Error Status:", error.response?.status);
        console.error("Error Data:", error.response?.data);
    }
}

reproduceError();
