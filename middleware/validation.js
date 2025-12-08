const { body, param, query, validationResult } = require("express-validator");
const mongoose = require("mongoose");

// Middleware to parse JSON fields from FormData
const parseFormDataJSON = (req, res, next) => {
  try {
    const jsonFields = ["data", "tags", "participants", "location"];

    jsonFields.forEach((field) => {
      if (req.body[field] && typeof req.body[field] === "string") {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          if (field === "data" || field === "location") {
            req.body[field] = {};
          } else {
            req.body[field] = [];
          }
        }
      }
    });

    next();
  } catch (error) {
    console.error("FormData parsing error:", error);
    next();
  }
};

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error("Validation errors:", errors.array()); // ADD THIS for debugging
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
      code: "VALIDATION_ERROR",
    });
  }
  next();
};

// Custom validator for MongoDB ObjectId
const isValidObjectId = (value) => {
  return mongoose.Types.ObjectId.isValid(value);
};

// User validation rules
const validateUserRegistration = [
  body("email")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid email is required"),
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("clientDomain")
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage("Client domain must be between 2 and 100 characters"),
  handleValidationErrors,
];

const validateUserUpdate = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("preferences.emailNotifications")
    .optional()
    .isBoolean()
    .withMessage("Email notifications preference must be boolean"),
  body("preferences.autoTranscribe")
    .optional()
    .isBoolean()
    .withMessage("Auto transcribe preference must be boolean"),
  body("preferences.defaultLogType")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Default log type must be a valid ObjectId"),
  handleValidationErrors,
];

// Client validation rules
const validateClient = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Client name must be between 2 and 100 characters"),
  body("domain")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Domain must be between 2 and 100 characters"),
  body("contact.adminEmail")
    .isEmail()
    .normalizeEmail()
    .withMessage("Valid admin email is required"),
  body("plan")
    .optional()
    .isIn(["basic", "premium", "enterprise"])
    .withMessage("Plan must be basic, premium, or enterprise"),
  handleValidationErrors,
];

// Log type validation rules
const validateLogType = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(
      "Log type name is required and must be less than 100 characters"
    ),
  body("description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must be less than 500 characters"),
  body("category")
    .optional()
    .isIn([
      "procedure",
      "consultation",
      "teaching",
      "meeting",
      "research",
      "other",
    ])
    .withMessage("Invalid category"),
  body("color")
    .optional()
    .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
    .withMessage("Color must be a valid hex color"),
  body("fields").optional().isArray().withMessage("Fields must be an array"),
  body("fields.*.fieldName")
    .if(body("fields").exists())
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Field name is required and must be less than 50 characters"),
  body("fields.*.fieldType")
    .if(body("fields").exists())
    .isIn([
      "text",
      "textarea",
      "select",
      "multiselect",
      "date",
      "datetime",
      "number",
      "boolean",
      "file",
    ])
    .withMessage("Invalid field type"),
  body("fields.*.label")
    .if(body("fields").exists())
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage(
      "Field label is required and must be less than 100 characters"
    ),
  handleValidationErrors,
];

// Log entry validation rules
const validateLogEntry = (req, res, next) => {
  try {
    const { title, logTypeId, status } = req.body;

    // Parse JSON fields if they're strings (from FormData)
    if (req.body.data && typeof req.body.data === "string") {
      try {
        req.body.data = JSON.parse(req.body.data);
      } catch (e) {
        req.body.data = {};
      }
    }

    if (req.body.tags && typeof req.body.tags === "string") {
      try {
        req.body.tags = JSON.parse(req.body.tags);
      } catch (e) {
        req.body.tags = [];
      }
    }

    if (req.body.participants && typeof req.body.participants === "string") {
      try {
        req.body.participants = JSON.parse(req.body.participants);
      } catch (e) {
        req.body.participants = [];
      }
    }

    // Validate required fields
    if (!title || !title.trim()) {
      return res.status(400).json({
        error: "Title is required",
        code: "TITLE_REQUIRED",
      });
    }

    if (!logTypeId) {
      return res.status(400).json({
        error: "Log type is required",
        code: "LOG_TYPE_REQUIRED",
      });
    }

    // Validate status if provided
    const validStatuses = ["draft", "completed", "reviewed", "archived"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status value",
        code: "INVALID_STATUS",
      });
    }

    next();
  } catch (error) {
    console.error("Validation error:", error);
    return res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: error.message,
    });
  }
};

const validateLogEntryUpdate = [
  body("title")
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage("Title must be less than 200 characters"),
  body("data").optional().isObject().withMessage("Data must be an object"),
  body("notes")
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage("Notes must be less than 5000 characters"),
  body("tags").optional().isArray().withMessage("Tags must be an array"),
  body("status")
    .optional()
    .isIn(["draft", "completed", "reviewed", "archived"])
    .withMessage("Invalid status"),
  handleValidationErrors,
];

// Reflection validation rules
const validateReflection = [
  body("content")
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage(
      "Reflection content is required and must be less than 10000 characters"
    ),
  body("type")
    .optional()
    .isIn(["manual", "ai_generated"])
    .withMessage("Type must be manual or ai_generated"),
  body("competencies")
    .optional()
    .isArray()
    .withMessage("Competencies must be an array"),
  body("competencies.*")
    .if(body("competencies").exists())
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Each competency must be between 1 and 100 characters"),
  handleValidationErrors,
];

// Parameter validation rules
const validateObjectIdParam = (paramName = "id") => [
  param(paramName)
    .custom(isValidObjectId)
    .withMessage(`${paramName} must be a valid ObjectId`),
  handleValidationErrors,
];

// Query validation rules
const validatePaginationQuery = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("Limit must be between 1 and 100"),
  query("sort")
    .optional()
    .isIn([
      "createdAt",
      "-createdAt",
      "updatedAt",
      "-updatedAt",
      "title",
      "-title",
    ])
    .withMessage("Invalid sort field"),
  handleValidationErrors,
];

const validateSearchQuery = [
  query("q")
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Search query must be between 1 and 100 characters"),
  query("tags").optional().isArray().withMessage("Tags must be an array"),
  query("status")
    .optional()
    .isIn(["draft", "completed", "reviewed", "archived"])
    .withMessage("Invalid status"),
  query("logType")
    .optional()
    .custom(isValidObjectId)
    .withMessage("Log type must be a valid ObjectId"),
  query("dateFrom")
    .optional()
    .isISO8601()
    .withMessage("Date from must be a valid ISO8601 date"),
  query("dateTo")
    .optional()
    .isISO8601()
    .withMessage("Date to must be a valid ISO8601 date"),
  handleValidationErrors,
];

module.exports = {
  parseFormDataJSON,
  handleValidationErrors,
  validateUserRegistration,
  validateUserUpdate,
  validateClient,
  validateLogType,
  validateLogEntry,
  validateLogEntryUpdate,
  validateReflection,
  validateObjectIdParam,
  validatePaginationQuery,
  validateSearchQuery,
};
