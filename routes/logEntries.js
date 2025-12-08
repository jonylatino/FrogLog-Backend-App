const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const LogEntry = require("../models/LogEntry");
const LogType = require("../models/LogType");

const {
  authenticateToken,
  requireActiveSubscription,
  requireSameClient,
} = require("../middleware/auth");
const {
  parseFormDataJSON,
  validateLogEntry,
  validateLogEntryUpdate,
  validateObjectIdParam,
  validatePaginationQuery,
  validateSearchQuery,
} = require("../middleware/validation");
const { uploadAudio, handleUploadError } = require("../middleware/upload");

const router = express.Router();

// Create uploads directory
const UPLOADS_DIR = path.join(__dirname, "../uploads/audio");
fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(console.error);

// @route   GET /api/log-entries
// @desc    Get all log entries for current user
// @access  Private
router.get(
  "/",
  authenticateToken,
  validatePaginationQuery,
  validateSearchQuery,
  async (req, res) => {
    try {
      const user = req.user;
      const {
        page = 1,
        limit = 20,
        sort = "-createdAt",
        q,
        tags,
        status,
        logType,
        dateFrom,
        dateTo,
      } = req.query;

      let query = { userId: user._id };

      if (q) {
        query.$text = { $search: q };
      }

      if (tags && Array.isArray(tags)) {
        query.tags = { $in: tags };
      }

      if (status) {
        query.status = status;
      }

      if (logType) {
        query.logTypeId = logType;
      }

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) {
          query.createdAt.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          query.createdAt.$lte = new Date(dateTo);
        }
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: sort,
        populate: [
          { path: "logTypeId", select: "name category color icon" },
          { path: "userId", select: "name email" },
        ],
        select: "-__v",
      };

      const result = await LogEntry.paginate(query, options);

      // Manual population for demo user
      const isDemoUser = user._id === "507f1f77bcf86cd799439011";
      let docs = result.docs;

      if (isDemoUser) {
        const MOCK_LOG_TYPES = {
          "507f1f77bcf86cd799439021": {
            _id: "507f1f77bcf86cd799439021",
            name: "Procedure",
            category: "procedure",
            color: "#3B82F6",
            icon: "scissors",
            fields: []
          },
          "507f1f77bcf86cd799439022": {
            _id: "507f1f77bcf86cd799439022",
            name: "Consultation",
            category: "consultation",
            color: "#10B981",
            icon: "user-group",
            fields: []
          },
          "507f1f77bcf86cd799439023": {
            _id: "507f1f77bcf86cd799439023",
            name: "Teaching Session",
            category: "teaching",
            color: "#F59E0B",
            icon: "academic-cap",
            fields: []
          }
        };

        // Convert documents to plain objects if they aren't already (paginate usually returns Mongoose docs)
        docs = docs.map(doc => {
          const entry = doc.toObject ? doc.toObject() : doc;
          const typeId = entry.logTypeId ? (typeof entry.logTypeId === 'object' ? entry.logTypeId._id : entry.logTypeId.toString()) : null;

          if (typeId && MOCK_LOG_TYPES[typeId]) {
            entry.logTypeId = MOCK_LOG_TYPES[typeId];
          }
          return entry;
        });
      }

      res.json({
        entries: docs,
        pagination: {
          page: result.page,
          pages: result.totalPages,
          total: result.totalDocs,
          limit: result.limit,
          hasNext: result.hasNextPage,
          hasPrev: result.hasPrevPage,
        },
      });
    } catch (error) {
      console.error("Get log entries error:", error);
      res.status(500).json({
        error: "Failed to get log entries",
        code: "GET_ENTRIES_ERROR",
      });
    }
  }
);

// @route   POST /api/log-entries
// @desc    Create new log entry
// @access  Private
router.post(
  "/",
  authenticateToken,
  requireActiveSubscription,
  uploadAudio,
  handleUploadError,
  validateLogEntry,
  async (req, res) => {
    try {
      const user = req.user;

      // Parse JSON fields from FormData
      let data = {};
      let tags = [];
      let participants = [];
      let location = {};

      if (req.body.data) {
        data =
          typeof req.body.data === "string"
            ? JSON.parse(req.body.data)
            : req.body.data;
      }

      if (req.body.tags) {
        tags =
          typeof req.body.tags === "string"
            ? JSON.parse(req.body.tags)
            : req.body.tags;
      }

      if (req.body.participants) {
        participants =
          typeof req.body.participants === "string"
            ? JSON.parse(req.body.participants)
            : req.body.participants;
      }

      if (req.body.location) {
        location =
          typeof req.body.location === "string"
            ? JSON.parse(req.body.location)
            : req.body.location;
      }

      const { title, logTypeId, notes, status } = req.body;
      const audioFile = req.file;

      // Verify log type exists (skip for demo mode)
      const isDemoUser = user._id === "507f1f77bcf86cd799439011";

      if (!isDemoUser) {
        const logType = await LogType.findOne({
          _id: logTypeId,
          clientId: user.clientId._id,
          isActive: true,
        });

        if (!logType) {
          return res.status(404).json({
            error: "Log type not found or inactive",
            code: "LOG_TYPE_NOT_FOUND",
          });
        }
      }

      // Create log entry data
      const entryData = {
        userId: user._id,
        clientId: user.clientId._id,
        logTypeId,
        title,
        data,
        notes: notes || "",
        tags,
        location,
        participants,
        status: status || "draft",
      };

      // Handle audio file if provided
      if (audioFile) {
        // Generate unique filename
        const timestamp = Date.now();
        const sanitizedFilename = audioFile.originalname.replace(
          /[^a-zA-Z0-9.-]/g,
          "_"
        );
        const filename = `${user._id}_${timestamp}_${sanitizedFilename}`;

        // Save audio file to disk
        const audioDir = path.join(__dirname, "../uploads/audio");
        const audioPath = path.join(audioDir, filename);
        await fs.writeFile(audioPath, audioFile.buffer);

        // Create audio recording object
        const audioRecording = {
          url: `/uploads/audio/${filename}`,
          filename: audioFile.originalname,
          size: audioFile.size,
          transcriptionStatus: "processing",
          uploadedAt: new Date()
        };

        // Add to audioRecordings array
        entryData.audioRecordings = [audioRecording];
      }

      const logEntry = new LogEntry(entryData);
      await logEntry.save();

      // Queue transcription job if audio was uploaded
      if (audioFile && logEntry.audioRecordings && logEntry.audioRecordings.length > 0) {
        const { transcriptionQueue, redisAvailable } = require("../config/queue");
        const audioUrl = logEntry.audioRecordings[0].url;

        if (redisAvailable && transcriptionQueue) {
          // Use background job queue if Redis is available
          try {
            const { defaultJobOptions } = require("../config/queue");
            await transcriptionQueue.add(
              {
                entryId: logEntry._id.toString(),
                audioUrl: audioUrl, // Pass the URL explicitly
                recordingIndex: 0 // Pass index to identify which recording
              },
              defaultJobOptions
            );
            console.log(`Queued transcription job for entry ${logEntry._id}`);
          } catch (queueError) {
            console.warn('Failed to queue job, falling back to sync:', queueError.message);
            // Fall back to synchronous transcription
            await transcribeSynchronously(logEntry);
          }
        } else {
          // Fall back to synchronous transcription if Redis not available
          console.log(`Transcribing synchronously for entry ${logEntry._id} (Redis not available)`);
          await transcribeSynchronously(logEntry);
        }
      }

      await logEntry.populate([
        { path: "logTypeId", select: "name category color icon" },
        { path: "userId", select: "name email" },
      ]);

      res.status(201).json({
        message: "Log entry created successfully",
        entry: logEntry,
      });
    } catch (error) {
      console.error("Create log entry error:", error);
      res.status(500).json({
        error: "Failed to create log entry",
        code: "CREATE_ENTRY_ERROR",
        details: error.message,
      });
    }
  }
);

// Helper function for synchronous transcription
// Helper function for synchronous transcription
async function transcribeSynchronously(logEntry) {
  try {
    const { transcribeAudio } = require("../config/googleCloud");
    const fs = require("fs").promises;
    const path = require("path");

    // Check if we have recordings
    if (!logEntry.audioRecordings || logEntry.audioRecordings.length === 0) {
      console.warn(`No audio recordings found for entry ${logEntry._id}`);
      return;
    }

    // Process the first recording (or loop if needed, but for now just first)
    const recording = logEntry.audioRecordings[0];
    const audioPath = path.join(__dirname, "..", recording.url);
    const audioBuffer = await fs.readFile(audioPath);

    const result = await transcribeAudio(audioBuffer, "WEBM_OPUS", 48000, "en-US");

    // Update the recording object
    recording.transcript = result.transcript;
    recording.transcriptionStatus = "completed";
    recording.transcriptionTimestamp = new Date();

    // Mark the array as modified so Mongoose saves it
    logEntry.markModified('audioRecordings');
    await logEntry.save();

    console.log(`Synchronous transcription completed for entry ${logEntry._id}`);
  } catch (error) {
    console.error(`Synchronous transcription failed for entry ${logEntry._id}:`, error);

    if (logEntry.audioRecordings && logEntry.audioRecordings.length > 0) {
      logEntry.audioRecordings[0].transcriptionStatus = "failed";
      logEntry.audioRecordings[0].transcriptionError = error.message;
      logEntry.markModified('audioRecordings');
      await logEntry.save();
    }
  }
}

// @route   GET /api/log-entries/:id
// @desc    Get log entry by ID
// @access  Private
router.get(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.id;

      const isDemoUser = user._id === "507f1f77bcf86cd799439011";

      let logEntry;

      if (isDemoUser) {
        // Fetch without populate first
        const doc = await LogEntry.findOne({
          _id: entryId,
          userId: user._id,
        });

        if (!doc) {
          return res.status(404).json({
            error: "Log entry not found",
            code: "ENTRY_NOT_FOUND",
          });
        }

        logEntry = doc.toObject();

        const MOCK_LOG_TYPES = {
          "507f1f77bcf86cd799439021": {
            _id: "507f1f77bcf86cd799439021",
            name: "Procedure",
            category: "procedure",
            color: "#3B82F6",
            icon: "scissors",
            fields: []
          },
          "507f1f77bcf86cd799439022": {
            _id: "507f1f77bcf86cd799439022",
            name: "Consultation",
            category: "consultation",
            color: "#10B981",
            icon: "user-group",
            fields: []
          },
          "507f1f77bcf86cd799439023": {
            _id: "507f1f77bcf86cd799439023",
            name: "Teaching Session",
            category: "teaching",
            color: "#F59E0B",
            icon: "academic-cap",
            fields: []
          }
        };

        const typeId = logEntry.logTypeId ? logEntry.logTypeId.toString() : null;
        if (typeId && MOCK_LOG_TYPES[typeId]) {
          logEntry.logTypeId = MOCK_LOG_TYPES[typeId];
        }

        logEntry.userId = { _id: user._id, name: user.name, email: user.email };

      } else {
        logEntry = await LogEntry.findOne({
          _id: entryId,
          userId: user._id,
        }).populate([
          { path: "logTypeId", select: "name category color icon fields" },
          { path: "userId", select: "name email" },
        ]);

        if (!logEntry) {
          return res.status(404).json({
            error: "Log entry not found",
            code: "ENTRY_NOT_FOUND",
          });
        }
      }

      res.json({ entry: logEntry });
    } catch (error) {
      console.error("Get log entry error:", error);
      res.status(500).json({
        error: "Failed to get log entry",
        code: "GET_ENTRY_ERROR",
      });
    }
  }
);

// @route   PUT /api/log-entries/:id
// @desc    Update log entry
// @access  Private
router.put(
  "/:id",
  authenticateToken,
  requireActiveSubscription,
  validateObjectIdParam("id"),
  parseFormDataJSON,
  validateLogEntryUpdate,
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.id;
      const updates = req.body;

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

      // Verify log type exists (skip for demo mode)
      const isDemoUser = user._id === "507f1f77bcf86cd799439011";

      if (
        !isDemoUser &&
        updates.logTypeId &&
        (!logEntry.logTypeId || updates.logTypeId !== logEntry.logTypeId.toString())
      ) {
        const newLogType = await LogType.findOne({
          _id: updates.logTypeId,
          clientId: user.clientId._id,
          isActive: true,
        });

        if (!newLogType) {
          return res.status(404).json({
            error: "Log type not found or inactive",
            code: "LOG_TYPE_NOT_FOUND",
          });
        }
      }

      const allowedUpdates = [
        "title",
        "logTypeId",
        "data",
        "notes",
        "tags",
        "status",
        "location",
        "participants",
      ];

      allowedUpdates.forEach((field) => {
        if (updates[field] !== undefined) {
          logEntry[field] = updates[field];
        }
      });

      if (updates.status) {
        if (updates.status === "completed" && logEntry.status !== "completed") {
          logEntry.completedAt = new Date();
        }
        if (updates.status === "reviewed" && logEntry.status !== "reviewed") {
          logEntry.reviewedAt = new Date();
          logEntry.reviewedBy = user._id;
        }
      }

      await logEntry.save();

      // Handle population based on user type
      // isDemoUser is already defined above

      let entryToSend;

      if (isDemoUser) {
        // For demo user, manual population of mock types
        entryToSend = logEntry.toObject();

        const MOCK_LOG_TYPES = {
          "507f1f77bcf86cd799439021": {
            _id: "507f1f77bcf86cd799439021",
            name: "Procedure",
            category: "procedure",
            color: "#3B82F6",
            icon: "scissors"
          },
          "507f1f77bcf86cd799439022": {
            _id: "507f1f77bcf86cd799439022",
            name: "Consultation",
            category: "consultation",
            color: "#10B981",
            icon: "user-group"
          },
          "507f1f77bcf86cd799439023": {
            _id: "507f1f77bcf86cd799439023",
            name: "Teaching Session",
            category: "teaching",
            color: "#F59E0B",
            icon: "academic-cap"
          }
        };

        const typeId = entryToSend.logTypeId ? entryToSend.logTypeId.toString() : null;
        if (typeId && MOCK_LOG_TYPES[typeId]) {
          entryToSend.logTypeId = MOCK_LOG_TYPES[typeId];
        }

        // Populate user manually if needed (or minimal)
        entryToSend.userId = { _id: user._id, name: user.name, email: user.email };

      } else {
        // Normal user population
        await logEntry.populate([
          { path: "logTypeId", select: "name category color icon" },
          { path: "userId", select: "name email" },
        ]);
        entryToSend = logEntry;
      }

      res.json({
        message: "Log entry updated successfully",
        entry: entryToSend,
      });
    } catch (error) {
      console.error("Update log entry error:", error);
      res.status(500).json({
        error: "Failed to update log entry",
        code: "UPDATE_ENTRY_ERROR",
      });
    }
  }
);

// @route   DELETE /api/log-entries/:id
// @desc    Delete log entry
// @access  Private
router.delete(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.id;

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

      // Delete audio files if they exist
      // Handle old format (single audioUrl)
      if (logEntry.audioUrl && !logEntry.audioUrl.includes("placeholder")) {
        const audioPath = path.join(__dirname, "..", logEntry.audioUrl);
        try {
          await fs.unlink(audioPath);
          console.log(`Deleted audio file: ${logEntry.audioUrl}`);
        } catch (err) {
          console.error(`Failed to delete audio file: ${err.message}`);
        }
      }

      // Handle new format (audioRecordings array)
      if (logEntry.audioRecordings && logEntry.audioRecordings.length > 0) {
        for (const audio of logEntry.audioRecordings) {
          if (audio.url && !audio.url.includes("placeholder")) {
            const relativeUrl = audio.url.startsWith('/') ? audio.url.substring(1) : audio.url;
            const audioPath = path.join(__dirname, "..", relativeUrl);
            try {
              await fs.unlink(audioPath);
              console.log(`Deleted audio file: ${audio.url}`);
            } catch (err) {
              console.error(`Failed to delete audio file: ${err.message}`);
            }
          }
        }
      }

      await LogEntry.findByIdAndDelete(entryId);

      res.json({
        message: "Log entry deleted successfully",
      });
    } catch (error) {
      console.error("Delete log entry error:", error);
      res.status(500).json({
        error: "Failed to delete log entry",
        code: "DELETE_ENTRY_ERROR",
      });
    }
  }
);

// Reflection routes...
router.post(
  "/:id/reflection",
  authenticateToken,
  requireActiveSubscription,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.id;
      const { content, type = "manual", competencies = [] } = req.body;

      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          error: "Reflection content is required",
          code: "CONTENT_REQUIRED",
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

      logEntry.reflections.push({
        content: content.trim(),
        type,
        competencies,
      });
      await logEntry.save();

      res.json({
        message: "Reflection added successfully",
        reflection: logEntry.reflections[logEntry.reflections.length - 1],
      });
    } catch (error) {
      console.error("Add reflection error:", error);
      res.status(500).json({
        error: "Failed to add reflection",
        code: "ADD_REFLECTION_ERROR",
      });
    }
  }
);

// Stats route
router.get("/stats/dashboard", authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { days = 30 } = req.query;
    const dateFrom = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const statsResult = await LogEntry.aggregate([
      { $match: { userId: user._id, createdAt: { $gte: dateFrom } } },
      {
        $facet: {
          total: [{ $count: "count" }],
          byLogType: [
            { $group: { _id: "$logTypeId", count: { $sum: 1 } } },
            {
              $lookup: {
                from: "logtypes",
                localField: "_id",
                foreignField: "_id",
                as: "logType",
              },
            },
            {
              $project: {
                count: 1,
                logType: { $arrayElemAt: ["$logType", 0] },
              },
            },
          ],
          byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
          dailyTrend: [
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          withAudio: [
            { $match: { audioUrl: { $ne: null } } },
            { $count: "count" },
          ],
          withTranscript: [
            { $match: { transcript: { $ne: null } } },
            { $count: "count" },
          ],
        },
      },
    ]);

    const result = statsResult[0];

    res.json({
      stats: {
        totalEntries: result.total[0]?.count || 0,
        entriesWithAudio: result.withAudio[0]?.count || 0,
        entriesWithTranscripts: result.withTranscript[0]?.count || 0,
        entriesThisMonth: result.total[0]?.count || 0,
        entriesByLogType: result.byLogType.map((item) => ({
          logType: item.logType?.name || "Unknown",
          count: item.count,
          color: item.logType?.color || "#6B7280",
        })),
        byStatus: result.byStatus,
        dailyTrend: result.dailyTrend.map((item) => ({
          date: item._id,
          count: item.count,
        })),
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    res.status(500).json({
      error: "Failed to get dashboard statistics",
      code: "GET_DASHBOARD_STATS_ERROR",
    });
  }
});

// Audio streaming route
router.get(
  "/:id/audio",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const entryId = req.params.id;

      const logEntry = await LogEntry.findOne({
        _id: entryId,
        userId: user._id,
      });

      if (!logEntry || !logEntry.audioUrl) {
        return res.status(404).json({
          error: "Audio not found",
          code: "AUDIO_NOT_FOUND",
        });
      }

      const audioPath = path.join(__dirname, "..", logEntry.audioUrl);

      try {
        await fs.access(audioPath);
      } catch {
        return res.status(404).json({
          error: "Audio file not found on server",
          code: "FILE_NOT_FOUND",
        });
      }

      res.setHeader("Content-Type", "audio/webm");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${logEntry.audioFilename}"`
      );

      const fileStream = require("fs").createReadStream(audioPath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Stream audio error:", error);
      res.status(500).json({
        error: "Failed to stream audio",
        code: "STREAM_AUDIO_ERROR",
      });
    }
  }
);

module.exports = router;
