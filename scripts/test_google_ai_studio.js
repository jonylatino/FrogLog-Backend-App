const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGoogleAI() {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
        console.error('GOOGLE_API_KEY is missing in .env');
        process.exit(1);
    }

    console.log('Testing Google AI Studio SDK...');

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });

        // console.log('Sending request...');
        // const result = await model.generateContent('Hello, are you working?');
        // const response = await result.response;
        // const text = response.text();

        // console.log('Response:', text);
        // console.log('Google AI Studio SDK is working correctly!');

        // List models
        // Note: listModels is not directly on genAI, it's on the ModelManager or similar?
        // Actually, checking docs/types...
        // It seems there isn't a direct listModels on the main client in the Node SDK easily accessible or I need to check docs.
        // But let's try a known model like 'gemini-pro' or 'gemini-1.5-flash' which are standard.

        // Let's try 'gemini-2.0-flash' as it's available.
        console.log('Trying gemini-2.0-flash...');
        const modelFlash = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
        const resultFlash = await modelFlash.generateContent('Hello');
        console.log('gemini-2.0-flash worked:', resultFlash.response.text());

    } catch (error) {
        console.error('Google AI Error:', error.message);
    }
}

testGoogleAI();
