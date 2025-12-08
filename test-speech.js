require("dotenv").config();
const {
  initializeSpeechToText,
  transcribeAudio,
} = require("./config/googleCloud");
const fs = require("fs");

async function testSpeechToText() {
  try {
    console.log("Initializing Speech-to-Text...");
    initializeSpeechToText();

    console.log("Testing with sample audio...");

    // You would need a sample audio file for real testing
    // For now, just check if initialization worked
    console.log("Speech-to-Text initialized successfully!");
    console.log("Project ID:", process.env.GOOGLE_CLOUD_PROJECT_ID);
  } catch (error) {
    console.error("Error:", error);
  }
}

testSpeechToText();
