const mongoose = require('mongoose');

const fieldSchema = new mongoose.Schema({
  fieldName: {
    type: String,
    required: true,
    trim: true
  },
  fieldType: {
    type: String,
    enum: ['text', 'textarea', 'select', 'multiselect', 'date', 'datetime', 'number', 'boolean', 'file'],
    required: true
  },
  label: {
    type: String,
    required: true,
    trim: true
  },
  placeholder: {
    type: String,
    default: ''
  },
  required: {
    type: Boolean,
    default: false
  },
  options: [{
    type: String,
    trim: true
  }], // For select/multiselect fields
  validation: {
    min: Number,
    max: Number,
    minLength: Number,
    maxLength: Number,
    pattern: String
  },
  defaultValue: mongoose.Schema.Types.Mixed,
  order: {
    type: Number,
    default: 0
  }
});

const logTypeSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    enum: ['procedure', 'consultation', 'teaching', 'meeting', 'research', 'other', 'ai_assistant'],
    default: 'procedure'
  },
  color: {
    type: String,
    default: '#3B82F6' // blue-500
  },
  icon: {
    type: String,
    default: 'clipboard-document-list'
  },
  fields: [fieldSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  isSystem: {
    type: Boolean,
    default: false // System log types cannot be deleted
  },
  settings: {
    allowAudio: {
      type: Boolean,
      default: true
    },
    requireAudio: {
      type: Boolean,
      default: false
    },
    autoTranscribe: {
      type: Boolean,
      default: true
    },
    allowAttachments: {
      type: Boolean,
      default: true
    },
    maxAudioDuration: {
      type: Number, // in minutes
      default: 30
    }
  },
  usage: {
    totalEntries: {
      type: Number,
      default: 0
    },
    lastUsed: {
      type: Date,
      default: null
    }
  }
}, {
  timestamps: true
});

// Virtual to get entry count for this log type
logTypeSchema.virtual('entryCount', {
  ref: 'LogEntry',
  localField: '_id',
  foreignField: 'logTypeId',
  count: true
});

// Index for efficient queries
logTypeSchema.index({ clientId: 1, name: 1 }, { unique: true });
logTypeSchema.index({ clientId: 1, category: 1 });
logTypeSchema.index({ clientId: 1, isActive: 1 });

// Pre-save middleware to update usage stats
logTypeSchema.pre('save', function (next) {
  if (this.isModified('fields')) {
    // Sort fields by order
    this.fields.sort((a, b) => a.order - b.order);
  }
  next();
});

module.exports = mongoose.model('LogType', logTypeSchema);