const mongoose = require('mongoose');
const LogType = require('../models/LogType');
const LogEntry = require('../models/LogEntry');
const User = require('../models/User');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/froglog';

async function verifySetup() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Get a user (assuming the first one is our test user)
        const user = await User.findOne();
        if (!user) {
            console.error('No user found');
            process.exit(1);
        }
        console.log(`User found: ${user.name} (${user.email})`);

        // 2. Check/Create "Frog AI Assistant" LogType
        let aiLogType = await LogType.findOne({
            clientId: user.clientId,
            category: 'ai_assistant'
        });

        if (!aiLogType) {
            console.log('Creating "Frog AI Assistant" LogType...');
            aiLogType = await LogType.create({
                clientId: user.clientId,
                name: "Frog AI Assistant",
                description: "AI-powered clinical partner",
                category: "ai_assistant",
                color: "#7C3AED",
                icon: "sparkles",
                fields: [],
                isSystem: true,
                settings: {
                    autoTranscribe: true,
                    allowAudio: true,
                    requireAudio: false,
                    allowAttachments: true,
                }
            });
            console.log('Created LogType:', aiLogType.name);
        } else {
            console.log('Found existing LogType:', aiLogType.name);
        }

        // 3. Create a Test Log Entry
        const testEntry = await LogEntry.create({
            userId: user._id,
            clientId: user.clientId,
            logTypeId: aiLogType._id,
            title: "Test AI Consultation",
            status: "draft",
            aiContextCategory: "consultation",
            notes: "Patient presents with mild chest pain.",
            data: {},
            tags: ["test", "ai"],
            participants: []
        });

        console.log('Created Test Log Entry:', testEntry._id);
        console.log('You can view this entry at: /log-entries/' + testEntry._id);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifySetup();
