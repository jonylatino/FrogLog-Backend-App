const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const attachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  uploadDate: {
    type: Date,
    default: Date.now,
  },
});

const reflectionSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["manual", "ai_generated"],
    default: "manual",
  },
  prompt: {
    type: String,
    default: null, // Store the AI prompt used
  },
  competencies: [
    {
      type: String,
    },
  ], // GMC competencies or other frameworks
  createdAt: {
    type: Date,
    default: Date.now,
  },
  editedAt: {
    type: Date,
    default: null,
  },
});

const logEntrySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    logTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LogType",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Audio Recordings (multiple audio support)
    audioRecordings: [
      {
        url: {
          type: String,
          required: true,
        },
        filename: {
          type: String,
          required: true,
        },
        duration: {
          type: Number,
          default: null,
        },
        size: {
          type: Number,
          default: null,
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        // Transcription
        transcript: {
          type: String,
          default: null,
        },
        transcriptionStatus: {
          type: String,
          enum: ["pending", "processing", "completed", "failed", "not_requested"],
          default: "not_requested",
        },
        transcriptionError: {
          type: String,
          default: null,
        },
        transcriptionTimestamp: {
          type: Date,
          default: null,
        },
        // Improved transcript
        improvedTranscript: {
          type: String,
          default: null,
        },
        improvedTranscriptTimestamp: {
          type: Date,
          default: null,
        },
        // AI Response for this audio
        aiResponse: {
          type: String,
          default: null,
        },
        aiResponseTimestamp: {
          type: Date,
          default: null,
        },
      },
    ],
    // Notes and reflections
    notes: {
      type: String,
      default: "",
    },
    // AI Context Category (for Frog AI Assistant entries)
    aiContextCategory: {
      type: String,
      enum: ["procedure", "consultation", "teaching", "meeting", "research", "other"],
      default: null,
    },
    // AI Chat History
    aiChatHistory: [
      {
        role: {
          type: String,
          enum: ["user", "model"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    reflections: [reflectionSchema],
    // Attachments
    attachments: [attachmentSchema],
    // Metadata
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    location: {
      name: {
        type: String,
        trim: true,
      },
      department: {
        type: String,
        trim: true,
      },
      hospital: {
        type: String,
        trim: true,
      },
    },
    participants: [
      {
        name: {
          type: String,
          required: true,
          trim: true,
        },
        role: {
          type: String,
          required: true,
          trim: true,
        },
        email: {
          type: String,
          lowercase: true,
          trim: true,
        },
      },
    ],
    // Status and visibility
    status: {
      type: String,
      enum: ["draft", "completed", "reviewed", "archived"],
      default: "draft",
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Export tracking
    exports: [
      {
        format: {
          type: String,
          enum: ["pdf", "csv", "excel"],
          required: true,
        },
        exportedAt: {
          type: Date,
          default: Date.now,
        },
        exportedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        filename: String,
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to check if entry has audio
logEntrySchema.virtual("hasAudio").get(function () {
  return this.audioRecordings && this.audioRecordings.length > 0;
});

// Virtual to check if entry has any transcripts
logEntrySchema.virtual("hasTranscript").get(function () {
  return this.audioRecordings && this.audioRecordings.some(audio => audio.transcript);
});

// Indexes for efficient queries
logEntrySchema.index({ userId: 1, createdAt: -1 });
logEntrySchema.index({ clientId: 1, createdAt: -1 });
logEntrySchema.index({ logTypeId: 1, createdAt: -1 });
logEntrySchema.index({ userId: 1, logTypeId: 1, createdAt: -1 });
logEntrySchema.index({ clientId: 1, status: 1 });
logEntrySchema.index({ tags: 1 });
logEntrySchema.index({ "location.department": 1 });
logEntrySchema.index({ transcriptionStatus: 1 });

// Text search index
logEntrySchema.index({
  title: "text",
  notes: "text",
  "audioRecordings.transcript": "text",
  tags: "text",
});

// Middleware to update log type usage stats
logEntrySchema.post("save", async function (doc) {
  if (doc.isNew) {
    try {
      const LogType = mongoose.model("LogType");
      await LogType.findByIdAndUpdate(doc.logTypeId, {
        $inc: { "usage.totalEntries": 1 },
        $set: { "usage.lastUsed": new Date() },
      });
    } catch (error) {
      console.error("Error updating log type usage:", error);
    }
  }
});

logEntrySchema.plugin(mongoosePaginate);

module.exports = mongoose.model("LogEntry", logEntrySchema);
