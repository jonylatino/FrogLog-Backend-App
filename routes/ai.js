const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const LogEntry = require("../models/LogEntry");
const User = require("../models/User");
const { authenticateToken, requireActiveSubscription } = require("../middleware/auth");
const { validateObjectIdParam } = require("../middleware/validation");
const path = require("path");
const fs = require("fs").promises;

const router = express.Router();

// Initialize Google Generative AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// @route   POST /api/ai/chat/:entryId
// @desc    Chat with AI about a specific log entry
// @access  Private
router.post(
    "/chat/:entryId",
    authenticateToken,
    requireActiveSubscription,
    validateObjectIdParam("entryId"),
    async (req, res) => {
        try {
            const { message, image } = req.body; // image is optional base64 string or url
            const entryId = req.params.entryId;
            const user = req.user;

            // 1. Fetch Log Entry and User Preferences
            const logEntry = await LogEntry.findOne({
                _id: entryId,
                userId: user._id,
            });

            if (!logEntry) {
                return res.status(404).json({ error: "Log entry not found" });
            }

            const userPrefs = user.preferences?.aiConfig || {
                medicalSpecialty: "General Practitioner",
                customInstructions: "",
                model: "gemini-2.5-pro",
            };

            // 2. Prepare Context (System Instruction)
            const contextCategory = logEntry.aiContextCategory
                ? logEntry.aiContextCategory.charAt(0).toUpperCase() + logEntry.aiContextCategory.slice(1)
                : "General";

            // Build comprehensive audio context
            let audioContext = "";
            if (logEntry.audioRecordings && logEntry.audioRecordings.length > 0) {
                audioContext = "\n\nAUDIO RECORDINGS:\n";
                logEntry.audioRecordings.forEach((audio, index) => {
                    audioContext += `\nRecording ${index + 1} (${new Date(audio.uploadedAt).toLocaleString()}):\n`;
                    if (audio.transcript) {
                        audioContext += `Transcript: "${audio.transcript}"\n`;
                    }
                    if (audio.aiResponse) {
                        audioContext += `Your previous response to this audio: "${audio.aiResponse}"\n`;
                    }
                });
            }

            const systemInstruction = `
You are an expert AI Clinical Partner assisting a ${userPrefs.medicalSpecialty}.
Your goal is to provide helpful, accurate, and safe clinical decision support based on the provided context.

CONTEXT:
- Log Title: "${logEntry.title}"
- Category: ${contextCategory}
- Notes: "${logEntry.notes || "No notes available."}"
- Patient Data: ${JSON.stringify(logEntry.data || {})}${audioContext}

USER INSTRUCTIONS:
${userPrefs.customInstructions || "Provide concise, evidence-based insights."}

IMPORTANT:
- Maintain patient confidentiality.
- Do not provide definitive medical diagnoses; offer differential diagnoses and suggestions.
- If images are provided, analyze them in the context of the clinical data.
- Remember ALL previous interactions including audio recordings and their transcripts.
- When the user references "the audio" or "the recording", consider ALL audio recordings in context.
`;

            // 3. Initialize Generative Model
            const model = genAI.getGenerativeModel({
                model: userPrefs.model,
                systemInstruction: systemInstruction,
            });

            // 4. Prepare Chat History
            // Convert stored history to Google Generative AI format
            const history = logEntry.aiChatHistory.map((msg) => ({
                role: msg.role,
                parts: [{ text: msg.content }],
            }));

            const chat = model.startChat({
                history: history,
            });

            // 5. Send Message
            let chatResult;
            if (image) {
                // Handle image input (assuming base64 for now)
                // TODO: Implement image handling logic
                chatResult = await chat.sendMessage(message);
            } else {
                chatResult = await chat.sendMessage(message);
            }

            const responseContent = chatResult.response.text();

            // 6. Save History
            logEntry.aiChatHistory.push({
                role: "user",
                content: message,
            });
            logEntry.aiChatHistory.push({
                role: "model",
                content: responseContent,
            });

            await logEntry.save();

            res.json({
                role: "model",
                content: responseContent,
            });

        } catch (error) {
            console.error("AI Chat Error:", error);
            res.status(500).json({
                error: "Failed to process AI request",
                details: error.message,
            });
        }
    }
);

// @route   POST /api/ai/audio-response/:entryId/:audioIndex
// @desc    Get AI response for a specific audio recording
// @access  Private
router.post(
    "/audio-response/:entryId/:audioIndex",
    authenticateToken,
    requireActiveSubscription,
    validateObjectIdParam("entryId"),
    async (req, res) => {
        try {
            const entryId = req.params.entryId;
            const audioIndex = parseInt(req.params.audioIndex);
            const user = req.user;

            // 1. Fetch Log Entry
            const logEntry = await LogEntry.findOne({
                _id: entryId,
                userId: user._id,
            });

            if (!logEntry) {
                return res.status(404).json({ error: "Log entry not found" });
            }

            const audio = logEntry.audioRecordings[audioIndex];
            if (!audio) {
                return res.status(404).json({ error: "Audio recording not found" });
            }

            if (!audio.transcript) {
                return res.status(400).json({ error: "Audio must be transcribed first" });
            }

            const userPrefs = user.preferences?.aiConfig || {
                medicalSpecialty: "General Practitioner",
                customInstructions: "",
                model: "gemini-2.5-pro",
            };

            // 2. Prepare Context
            const contextCategory = logEntry.aiContextCategory
                ? logEntry.aiContextCategory.charAt(0).toUpperCase() + logEntry.aiContextCategory.slice(1)
                : "General";

            const systemInstruction = `
You are an expert AI Clinical Partner assisting a ${userPrefs.medicalSpecialty}.
Your goal is to provide helpful, accurate, and safe clinical decision support based on audio recordings.

CONTEXT:
- Log Title: "${logEntry.title}"
- Category: ${contextCategory}
- Notes: "${logEntry.notes || "No notes available."}"
- Patient Data: ${JSON.stringify(logEntry.data || {})}\n
USER INSTRUCTIONS:
${userPrefs.customInstructions || "Provide concise, evidence-based insights."}

IMPORTANT:
- Analyze the audio transcript and provide clinical insights.
- Maintain patient confidentiality.
- Do not provide definitive medical diagnoses; offer differential diagnoses and suggestions.
`;

            // 3. Initialize Model
            const model = genAI.getGenerativeModel({
                model: userPrefs.model,
                systemInstruction: systemInstruction,
            });

            // 4. Generate Response
            const prompt = `Please analyze the following audio transcript and provide clinical insights:\n\n"${audio.transcript}"`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const responseContent = response.text();

            // 5. Save AI Response
            logEntry.audioRecordings[audioIndex].aiResponse = responseContent;
            logEntry.audioRecordings[audioIndex].aiResponseTimestamp = new Date();

            // Also add to chat history for context continuity
            logEntry.aiChatHistory.push({
                role: "user",
                content: `[Audio Recording ${audioIndex + 1}]: ${audio.transcript}`,
            });
            logEntry.aiChatHistory.push({
                role: "model",
                content: responseContent,
            });

            await logEntry.save();

            res.json({
                role: "model",
                content: responseContent,
                audioIndex,
            });

        } catch (error) {
            console.error("AI Audio Response Error:", error);
            res.status(500).json({
                error: "Failed to generate AI response",
                details: error.message,
            });
        }
    }
);

// @route   DELETE /api/ai/chat/:entryId
// @desc    Clear chat history for a log entry
// @access  Private
router.delete(
    "/chat/:entryId",
    authenticateToken,
    requireActiveSubscription,
    validateObjectIdParam("entryId"),
    async (req, res) => {
        try {
            const entryId = req.params.entryId;
            const user = req.user;

            const logEntry = await LogEntry.findOne({
                _id: entryId,
                userId: user._id,
            });

            if (!logEntry) {
                return res.status(404).json({ error: "Log entry not found" });
            }

            logEntry.aiChatHistory = [];
            await logEntry.save();

            res.json({ message: "Chat history cleared" });
        } catch (error) {
            console.error("Clear Chat Error:", error);
            res.status(500).json({ error: "Failed to clear chat history" });
        }
    }
);

module.exports = router;
