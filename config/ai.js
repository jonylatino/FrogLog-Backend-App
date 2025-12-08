const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Initialize Google Generative AI
// Use GOOGLE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY from environment variables
const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

let genAI;

if (apiKey) {
    genAI = new GoogleGenerativeAI(apiKey);
    console.log("Google Generative AI initialized successfully");
} else {
    console.warn("Google AI API key not found. AI features will be disabled.");
    // Mock object to prevent crashes, but methods will fail if called
    genAI = {
        getGenerativeModel: () => ({
            generateContent: async () => {
                throw new Error("Google AI API key not configured");
            },
        }),
    };
}

module.exports = { genAI };
