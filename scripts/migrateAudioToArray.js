const mongoose = require('mongoose');
const LogEntry = require('../models/LogEntry');
require('dotenv').config();

// Migration script to convert single audio fields to audioRecordings array
async function migrateAudioData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Find all entries with old audio fields
        const entries = await LogEntry.find({
            $or: [
                { audioUrl: { $exists: true, $ne: null } },
                { transcript: { $exists: true, $ne: null } }
            ]
        });

        console.log(`Found ${entries.length} entries to migrate`);

        let migratedCount = 0;
        for (const entry of entries) {
            // Only migrate if audioUrl exists and audioRecordings is empty
            if (entry.audioUrl && (!entry.audioRecordings || entry.audioRecordings.length === 0)) {
                entry.audioRecordings = [{
                    url: entry.audioUrl,
                    filename: entry.audioFilename || 'recording.webm',
                    duration: entry.audioDuration,
                    size: entry.audioSize,
                    transcript: entry.transcript,
                    transcriptionStatus: entry.transcriptionStatus || 'not_requested',
                    transcriptionError: entry.transcriptionError,
                    transcriptionTimestamp: entry.transcriptionTimestamp,
                    uploadedAt: entry.createdAt,
                }];

                // Remove old fields (optional - can keep for backwards compatibility)
                entry.audioUrl = undefined;
                entry.audioFilename = undefined;
                entry.audioDuration = undefined;
                entry.audioSize = undefined;
                entry.transcript = undefined;
                entry.transcriptionStatus = undefined;
                entry.transcriptionError = undefined;
                entry.transcriptionTimestamp = undefined;

                await entry.save();
                migratedCount++;
                console.log(`Migrated entry ${entry._id}`);
            }
        }

        console.log(`Migration complete. Migrated ${migratedCount} entries.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run migration
migrateAudioData();
