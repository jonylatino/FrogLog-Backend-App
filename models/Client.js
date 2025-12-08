const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    logo: {
      type: String,
      default: null,
    },
    plan: {
      type: String,
      enum: ["basic", "premium", "enterprise"],
      default: "basic",
    },
    settings: {
      maxUsersPerClient: {
        type: Number,
        default: 100,
      },
      maxStoragePerUser: {
        type: Number, // in MB
        default: 1000,
      },
      allowCustomLogTypes: {
        type: Boolean,
        default: true,
      },
      allowAudioTranscription: {
        type: Boolean,
        default: true,
      },
      allowExports: {
        type: Boolean,
        default: true,
      },
      customBranding: {
        type: Boolean,
        default: false,
      },
    },
    contact: {
      adminEmail: {
        type: String,
        required: true,
        lowercase: true,
      },
      phone: {
        type: String,
        default: null,
      },
      address: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String,
      },
    },
    billing: {
      billingEmail: {
        type: String,
        lowercase: true,
      },
      taxId: String,
      currency: {
        type: String,
        default: "GBP",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to get user count
clientSchema.virtual("userCount", {
  ref: "User",
  localField: "_id",
  foreignField: "clientId",
  count: true,
});

// Virtual to get log type count
clientSchema.virtual("logTypeCount", {
  ref: "LogType",
  localField: "_id",
  foreignField: "clientId",
  count: true,
});

// Indexes for efficient queries (no duplicates with unique: true fields)
clientSchema.index({ "contact.adminEmail": 1 });
clientSchema.index({ plan: 1 });
clientSchema.index({ isActive: 1 });
clientSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Client", clientSchema);
