const { VertexAI } = require('@google-cloud/vertexai');
require('dotenv').config();

async function testVertexAI() {
    const project = process.env.GOOGLE_CLOUD_PROJECT_ID || 'froglog-medical';
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    console.log(`Testing Vertex AI with Project: ${project}, Location: ${location}`);

    try {
        const vertex_ai = new VertexAI({ project: project, location: location });
        const model = vertex_ai.getGenerativeModel({ model: 'gemini-1.5-pro' });

        const request = {
            contents: [{ role: 'user', parts: [{ text: 'Hello, are you working?' }] }],
        };

        console.log('Sending request...');
        const result = await model.generateContent(request);
        const response = await result.response;
        const text = response.candidates[0].content.parts[0].text;

        console.log('Response:', text);
        console.log('Vertex AI is working correctly!');
    } catch (error) {
        console.error('Vertex AI Error:', error.message);
        if (error.message.includes('credential')) {
            console.error('Authentication failed. Please check GOOGLE_APPLICATION_CREDENTIALS.');
        }
    }
}

testVertexAI();
