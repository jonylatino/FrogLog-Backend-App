//routes/audio.js

const express = require("express");
const {
  authenticateToken,
  requireActiveSubscription,
} = require("../middleware/auth");
const { uploadAudio, handleUploadError } = require("../middleware/upload");
const { validateObjectIdParam } = require("../middleware/validation");
const {
  transcribeAudio,
  transcribeLongAudio,
} = require("../config/googleCloud");
const LogEntry = require("../models/LogEntry");

const router = express.Router();

// @route   POST /api/audio/upload/:entryId
// @desc    Upload audio file for a log entry
// @access  Private
router.post(
  "/upload/:entryId",
  authenticateToken,
  requireActiveSubscription,
  uploadAudio,
  handleUploadError,
  async (req, res) => {
    try {
      const audioFile = req.file;
      const entryId = req.params.entryId;
      const user = req.user;

      if (!audioFile) {
        return res.status(400).json({
          error: "No audio file provided",
          code: "NO_AUDIO_FILE",
        });
      }

      const logEntry = await LogEntry.findOne({
        _id: entryId,
        userId: user._id,
      });

      if (!logEntry) {
        return res.status(404).json({
          error: "Log entry not found",
          code: "ENTRY_NOT_FOUND",
        });
      }

      // Initialize audioRecordings array if it doesn't exist
      if (!logEntry.audioRecordings) {
        logEntry.audioRecordings = [];
      }

      // Save audio file to disk (since we're using memoryStorage)
      const fs = require("fs").promises;
      const path = require("path");

      const timestamp = Date.now();
      const audioDir = path.join(__dirname, "..", "uploads", "audio");
      const filename = `${user._id}_${timestamp}_${audioFile.originalname}`;
      const audioPath = path.join(audioDir, filename);

      // Ensure directory exists
      await fs.mkdir(audioDir, { recursive: true });

      // Write file to disk
      await fs.writeFile(audioPath, audioFile.buffer);

      // Add new audio recording to array
      const newAudio = {
        url: `/uploads/audio/${filename}`,
        filename: audioFile.originalname,
        size: audioFile.size,
        duration: parseInt(req.body.duration) || null,
        uploadedAt: new Date(),
      };

      console.log("Uploading audio:", {
        entryId,
        filename,
        url: newAudio.url,
        audioIndex: logEntry.audioRecordings.length,
      });

      logEntry.audioRecordings.push(newAudio);
      await logEntry.save();

      const audioIndex = logEntry.audioRecordings.length - 1;

      // Auto-trigger transcription
      logEntry.audioRecordings[audioIndex].transcriptionStatus = "processing";
      await logEntry.save();

      // Start transcription asynchronously (don't wait for it)
      ProcessTranscription(logEntry, audioIndex).catch(err => {
        console.error("Auto-transcription failed:", err);
      });

      res.json({
        message: "Audio uploaded successfully",
        audioIndex,
        audio: {
          ...newAudio,
          transcriptionStatus: "processing"
        },
      });
    } catch (error) {
      console.error("Upload audio error:", error);
      res.status(500).json({
        error: "Failed to upload audio",
        code: "UPLOAD_ERROR",
        details: error.message,
      });
    }
  }
);

// @route   POST /api/audio/transcribe/:entryId/:audioIndex
// @desc    Request transcription for specific audio
// @access  Private
router.post(
  "/transcribe/:entryId/:audioIndex",
  authenticateToken,
  requireActiveSubscription,
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.entryId;
      const audioIndex = parseInt(req.params.audioIndex);

      const logEntry = await LogEntry.findOne({
        _id: entryId,
        userId: user._id,
      });

      if (!logEntry) {
        return res.status(404).json({
          error: "Log entry not found",
          code: "ENTRY_NOT_FOUND",
        });
      }

      if (!logEntry.audioRecordings || !logEntry.audioRecordings[audioIndex]) {
        return res.status(400).json({
          error: "Audio recording not found",
          code: "AUDIO_NOT_FOUND",
        });
      }

      const audio = logEntry.audioRecordings[audioIndex];

      if (audio.transcriptionStatus === "processing") {
        return res.status(400).json({
          error: "Transcription already in progress",
          code: "TRANSCRIPTION_IN_PROGRESS",
        });
      }

      // Update status to processing
      logEntry.audioRecordings[audioIndex].transcriptionStatus = "processing";
      await logEntry.save();

      // Process transcription synchronously (for simplicity)
      try {
        await ProcessTranscription(logEntry, audioIndex);

        res.json({
          message: "Transcription completed",
          audioIndex,
          transcript: logEntry.audioRecordings[audioIndex].transcript,
        });
      } catch (transcriptionError) {
        // Error already saved in ProcessTranscription
        throw transcriptionError;
      }
    } catch (error) {
      console.error("Transcription error:", error);
      res.status(500).json({
        error: "Failed to transcribe audio",
        code: "TRANSCRIPTION_ERROR",
        details: error.message,
      });
    }
  }
);
// @route   POST /api/audio/improve-transcript/:entryId/:audioIndex
// @desc    Use AI to improve/restructure transcript
// @access  Private
router.post(
  "/improve-transcript/:entryId/:audioIndex",
  authenticateToken,
  requireActiveSubscription,
  validateObjectIdParam("entryId"),
  async (req, res) => {
    try {
      const entryId = req.params.entryId;
      const audioIndex = parseInt(req.params.audioIndex);
      const user = req.user;

      // Find log entry
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

      // Use Gemini to improve transcript
      const { genAI } = require("../config/ai");
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash-exp",
        systemInstruction: `You are a professional medical transcript editor. Your task is to restructure and format medical transcripts for clarity and professionalism.

INSTRUCTIONS:
- Add clear headlines and subheadings using markdown (## for sections, ### for subsections)
- Organize content into logical paragraphs
- Use bullet points (* or -) for lists
- Preserve all medical terminology and details exactly as stated
- Use **bold** for emphasis on key medical terms or findings
- Maintain professional medical documentation standards
- DO NOT add information that wasn't in the original transcript
- DO NOT remove any important medical details

Format output in clean markdown that will be rendered as HTML.`,
      });

      const prompt = `Please restructure and improve the following medical transcript. Add appropriate headings, organize into sections, and improve readability while preserving all clinical information:\n\n${audio.transcript}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const improvedTranscript = response.text();

      // Save improved transcript
      logEntry.audioRecordings[audioIndex].improvedTranscript = improvedTranscript;
      logEntry.audioRecordings[audioIndex].improvedTranscriptTimestamp = new Date();
      await logEntry.save();

      res.json({
        message: "Transcript improved successfully",
        improvedTranscript,
      });
    } catch (error) {
      console.error("Improve transcript error:", error);
      res.status(500).json({
        error: "Failed to improve transcript",
        details: error.message,
      });
    }
  }
);


// Helper function for processing transcription
async function ProcessTranscription(logEntry, audioIndex) {
  try {
    const fs = require("fs").promises;
    const path = require("path");

    const audio = logEntry.audioRecordings[audioIndex];
    // Remove leading slash from URL for proper path.join
    const relativeUrl = audio.url.startsWith('/') ? audio.url.substring(1) : audio.url;
    const audioPath = path.join(__dirname, "..", relativeUrl);
    console.log("Transcribing audio:", { audioPath, url: audio.url });

    // Check file size to determine which API to use
    const stats = await fs.stat(audioPath);
    const fileSizeInMB = stats.size / (1024 * 1024);

    const audioBuffer = await fs.readFile(audioPath);

    let result;
    // Use long-running API for files > 1MB (roughly 60 seconds of audio)
    if (fileSizeInMB > 1) {
      console.log(`Using long-running transcription for ${fileSizeInMB.toFixed(2)}MB file`);
      result = await transcribeLongAudio(audioBuffer, "WEBM_OPUS", 48000, "en-US");
    } else {
      console.log(`Using sync transcription for ${fileSizeInMB.toFixed(2)}MB file`);
      result = await transcribeAudio(audioBuffer, "WEBM_OPUS", 48000, "en-US");
    }

    const transcript = result.transcript || "";

    logEntry.audioRecordings[audioIndex].transcript = transcript;
    logEntry.audioRecordings[audioIndex].transcriptionStatus = "completed";
    logEntry.audioRecordings[audioIndex].transcriptionTimestamp = new Date();
    await logEntry.save();

    return result;
  } catch (error) {
    logEntry.audioRecordings[audioIndex].transcriptionStatus = "failed";
    logEntry.audioRecordings[audioIndex].transcriptionError = error.message;
    await logEntry.save();
    throw error;
  }
}

// @route   GET /api/audio/transcription/:entryId/:audioIndex
// @desc    Get transcription status and result for specific audio
// @access  Private
router.get(
  "/transcription/:entryId/:audioIndex",
  authenticateToken,
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.entryId;
      const audioIndex = parseInt(req.params.audioIndex);

      const logEntry = await LogEntry.findOne({
        _id: entryId,
        userId: user._id,
      });

      if (!logEntry) {
        return res.status(404).json({
          error: "Log entry not found",
          code: "ENTRY_NOT_FOUND",
        });
      }

      const audio = logEntry.audioRecordings[audioIndex];
      if (!audio) {
        return res.status(404).json({
          error: "Audio recording not found",
          code: "AUDIO_NOT_FOUND",
        });
      }

      res.json({
        transcriptionStatus: audio.transcriptionStatus,
        transcript: audio.transcript,
        transcriptionError: audio.transcriptionError,
        transcriptionTimestamp: audio.transcriptionTimestamp,
      });
    } catch (error) {
      console.error("Get transcription error:", error);
      res.status(500).json({
        error: "Failed to get transcription",
        code: "GET_TRANSCRIPTION_ERROR",
      });
    }
  }
);

// @route   DELETE /api/audio/:entryId/:audioIndex
// @desc    Delete specific audio recording
// @access  Private
router.delete(
  "/:entryId/:audioIndex",
  authenticateToken,
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.entryId;
      const audioIndex = parseInt(req.params.audioIndex);

      const logEntry = await LogEntry.findOne({
        _id: entryId,
        userId: user._id,
      });

      if (!logEntry) {
        return res.status(404).json({
          error: "Log entry not found",
          code: "ENTRY_NOT_FOUND",
        });
      }

      if (!logEntry.audioRecordings || !logEntry.audioRecordings[audioIndex]) {
        return res.status(400).json({
          error: "Audio recording not found",
          code: "AUDIO_NOT_FOUND",
        });
      }

      // TODO: Delete audio file from storage
      const audioUrl = logEntry.audioRecordings[audioIndex].url;
      console.log(`TODO: Delete audio file: ${audioUrl}`);

      // Remove from array
      logEntry.audioRecordings.splice(audioIndex, 1);
      await logEntry.save();

      res.json({
        message: "Audio recording deleted successfully",
      });
    } catch (error) {
      console.error("Delete audio error:", error);
      res.status(500).json({
        error: "Failed to delete audio recording",
        code: "DELETE_AUDIO_ERROR",
      });
    }
  }
);

module.exports = router;
