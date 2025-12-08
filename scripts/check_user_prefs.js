const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

const userId = "692ce0332018cb6c20da5dcb";

async function checkAndUpdatePrefs() {
    const uri = process.env.MONGODB_URI;
    if (!uri) return;

    try {
        await mongoose.connect(uri);
        console.log("MongoDB Connected");

        const user = await User.findById(userId);
        if (!user) {
            console.log("User not found");
            return;
        }

        console.log("Current AI Config:", user.preferences?.aiConfig);

        // Update model to gemini-2.0-flash
        if (!user.preferences) user.preferences = {};
        if (!user.preferences.aiConfig) user.preferences.aiConfig = {};

        user.preferences.aiConfig.model = "gemini-2.0-flash";

        // Mark modified because preferences might be a mixed type or nested
        user.markModified('preferences');

        await user.save();
        console.log("Updated AI Config to gemini-2.0-flash");
        console.log("New AI Config:", user.preferences.aiConfig);

        await mongoose.connection.close();
    } catch (error) {
        console.error("Error:", error);
    }
}

checkAndUpdatePrefs();
