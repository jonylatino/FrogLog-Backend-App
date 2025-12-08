//middleware/upload.js

const multer = require("multer");
const path = require("path");

// Configure multer for audio file uploads
const audioStorage = multer.memoryStorage();

const audioFileFilter = (req, file, cb) => {
  // Check if the file is an audio file
  const allowedMimeTypes = [
    "audio/mpeg", // MP3
    "audio/mp3", // MP3
    "audio/wav", // WAV
    "audio/wave", // WAV
    "audio/x-wav", // WAV
    "audio/ogg", // OGG
    "audio/oga", // OGG
    "audio/webm", // WebM
    "audio/mp4", // MP4 audio
    "audio/m4a", // M4A
    "audio/x-m4a", // M4A
    "audio/aac", // AAC
    "audio/flac", // FLAC
  ];

  const allowedExtensions = [
    ".mp3",
    ".wav",
    ".ogg",
    ".webm",
    ".mp4",
    ".m4a",
    ".aac",
    ".flac",
  ];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (
    allowedMimeTypes.includes(file.mimetype) ||
    allowedExtensions.includes(fileExtension)
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid audio file type. Allowed types: ${allowedExtensions.join(
          ", "
        )}`
      ),
      false
    );
  }
};

const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Configure multer for general file uploads (attachments)
const attachmentStorage = multer.memoryStorage();

const attachmentFileFilter = (req, file, cb) => {
  // Check allowed file types for attachments
  const allowedMimeTypes = [
    // Images
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    // Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    // Audio (for attachments too)
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/mp4",
    "audio/m4a",
  ];

  const dangerousExtensions = [
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".scr",
    ".vbs",
    ".js",
    ".jar",
  ];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (dangerousExtensions.includes(fileExtension)) {
    cb(new Error("File type not allowed for security reasons"), false);
    return;
  }

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `File type not allowed. Allowed types: PDF, Word, Excel, PowerPoint, Images, Audio files`
      ),
      false
    );
  }
};

const uploadAttachment = multer({
  storage: attachmentStorage,
  fileFilter: attachmentFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for attachments
  },
});

// Middleware to handle upload errors
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(400).json({
          error: "File too large",
          message:
            err.field === "audio"
              ? "Audio file must be less than 100MB"
              : "File must be less than 50MB",
          code: "FILE_TOO_LARGE",
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          error: "Too many files",
          message: "Maximum number of files exceeded",
          code: "TOO_MANY_FILES",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          error: "Unexpected file field",
          message: "File field not expected",
          code: "UNEXPECTED_FILE",
        });
      default:
        return res.status(400).json({
          error: "File upload error",
          message: err.message,
          code: "UPLOAD_ERROR",
        });
    }
  } else if (err) {
    return res.status(400).json({
      error: "File validation error",
      message: err.message,
      code: "VALIDATION_ERROR",
    });
  }
  next();
};

// Helper function to get file metadata
const getFileMetadata = (file) => {
  return {
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extension: path.extname(file.originalname).toLowerCase(),
  };
};

// Helper function to generate unique filename
const generateUniqueFilename = (
  originalName,
  userId,
  timestamp = Date.now()
) => {
  const extension = path.extname(originalName);
  const nameWithoutExt = path.basename(originalName, extension);
  const sanitizedName = nameWithoutExt
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 50);
  return `${userId}/${timestamp}_${sanitizedName}${extension}`;
};

module.exports = {
  uploadAudio: uploadAudio.single("audio"),
  uploadAttachment: uploadAttachment.single("attachment"),
  uploadMultipleAttachments: uploadAttachment.array("attachments", 10),
  handleUploadError,
  getFileMetadata,
  generateUniqueFilename,
};
