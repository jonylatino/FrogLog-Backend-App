//models/User.js

const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "client_admin"],
      default: "user",
    },
    subscriptionStatus: {
      type: String,
      enum: ["trial", "active", "inactive", "cancelled"],
      default: "trial",
    },
    trialEndDate: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      },
    },
    stripeCustomerId: {
      type: String,
      default: null,
    },
    stripeSubscriptionId: {
      type: String,
      default: null,
    },
    subscriptionEndDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    preferences: {
      // Original preferences
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      autoTranscribe: {
        type: Boolean,
        default: true,
      },
      defaultLogType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LogType",
        default: null,
      },
      // General settings
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "Europe/London",
      },
      dateFormat: {
        type: String,
        default: "DD/MM/YYYY",
      },
      // Notification settings
      pushNotifications: {
        type: Boolean,
        default: true,
      },
      weeklyDigest: {
        type: Boolean,
        default: true,
      },
      transcriptionComplete: {
        type: Boolean,
        default: true,
      },
      portfolioReminders: {
        type: Boolean,
        default: false,
      },
      // Privacy settings
      profileVisibility: {
        type: String,
        enum: ["private", "colleagues", "public"],
        default: "private",
      },
      dataSharing: {
        type: Boolean,
        default: false,
      },
      analyticsTracking: {
        type: Boolean,
        default: true,
      },
      // Audio settings
      audioQuality: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "high",
      },
      maxRecordingDuration: {
        type: Number,
        default: 300, // 5 minutes in seconds
      },
      // Export settings
      defaultExportFormat: {
        type: String,
        enum: ["pdf", "csv", "xlsx"],
        default: "pdf",
      },
      includeAudio: {
        type: Boolean,
        default: false,
      },
      includeReflections: {
        type: Boolean,
        default: true,
      },
      // AI Clinical Partner settings
      aiConfig: {
        medicalSpecialty: {
          type: String,
          default: "General Practitioner",
          trim: true,
        },
        customInstructions: {
          type: String,
          default: "",
          trim: true,
        },
        model: {
          type: String,
          default: "gemini-1.5-pro",
          enum: ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-2.0-flash"],
        },
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Add pagination plugin
userSchema.plugin(mongoosePaginate);

// Virtual to check if user has active subscription
userSchema.virtual("hasActiveSubscription").get(function () {
  if (this.subscriptionStatus === "trial") {
    return new Date() <= this.trialEndDate;
  }
  if (this.subscriptionStatus === "active") {
    return this.subscriptionEndDate
      ? new Date() <= this.subscriptionEndDate
      : true;
  }
  return false;
});

// Virtual to get days remaining in trial
userSchema.virtual("trialDaysRemaining").get(function () {
  if (this.subscriptionStatus !== "trial") return 0;
  const now = new Date();
  const diffTime = this.trialEndDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
});

// Indexes for efficient queries
userSchema.index({ clientId: 1 });
userSchema.index({ stripeCustomerId: 1 });
userSchema.index({ subscriptionStatus: 1 });
userSchema.index({ clientId: 1, role: 1 });
userSchema.index({ isActive: 1 });

module.exports = mongoose.model("User", userSchema);
