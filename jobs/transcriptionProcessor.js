//jobs/transcriptionProcessor.js

const { transcriptionQueue } = require('../config/queue');
const { transcribeAudio } = require('../config/googleCloud');
const LogEntry = require('../models/LogEntry');
const fs = require('fs').promises;
const path = require('path');

// Process transcription jobs only if queue is initialized
if (transcriptionQueue) {
    transcriptionQueue.process(async (job) => {
        const { entryId, audioUrl } = job.data;

        console.log(`Processing transcription for entry ${entryId}`);

        try {
            // Find the log entry
            const logEntry = await LogEntry.findById(entryId);

            if (!logEntry) {
                throw new Error(`Log entry ${entryId} not found`);
            }

            // Determine which recording to process
            // If index is passed in job data, use it. Otherwise default to 0.
            const index = job.data.recordingIndex || 0;

            if (!logEntry.audioRecordings || !logEntry.audioRecordings[index]) {
                throw new Error(`No audio recording found at index ${index} for entry ${entryId}`);
            }

            const recording = logEntry.audioRecordings[index];

            if (!recording.url) {
                throw new Error(`No audio URL found for recording ${index} in entry ${entryId}`);
            }

            // Update status to processing
            recording.transcriptionStatus = 'processing';
            logEntry.markModified('audioRecordings');
            await logEntry.save();

            // Read audio file
            const audioPath = path.join(__dirname, '..', recording.url);
            const audioBuffer = await fs.readFile(audioPath);

            // Transcribe audio
            const transcriptionResult = await transcribeAudio(
                audioBuffer,
                'WEBM_OPUS', // Adjust based on your audio format
                48000, // Sample rate
                'en-US' // Language code
            );

            // Update log entry with transcript
            // Re-fetch to avoid race conditions? Mongoose document is in memory.
            // Ideally we should re-fetch but for now let's use the instance.
            recording.transcript = transcriptionResult.transcript;
            recording.transcriptionStatus = 'completed';
            recording.transcriptionTimestamp = new Date();
            recording.transcriptionError = null;

            logEntry.markModified('audioRecordings');
            await logEntry.save();

            console.log(`Transcription completed for entry ${entryId} recording ${index}`);

            return {
                entryId,
                transcript: transcriptionResult.transcript,
                confidence: transcriptionResult.confidence,
            };
        } catch (error) {
            console.error(`Transcription error for entry ${entryId}:`, error);

            // Update log entry with error
            const logEntry = await LogEntry.findById(entryId);
            if (logEntry && logEntry.audioRecordings) {
                const index = job.data.recordingIndex || 0;
                if (logEntry.audioRecordings[index]) {
                    logEntry.audioRecordings[index].transcriptionStatus = 'failed';
                    logEntry.audioRecordings[index].transcriptionError = error.message;
                    logEntry.markModified('audioRecordings');
                    await logEntry.save();
                }
            }

            throw error; // Re-throw for Bull to handle retries
        }
    });
}

// Export for graceful shutdown
module.exports = transcriptionQueue;
