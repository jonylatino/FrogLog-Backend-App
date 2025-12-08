//routes/logTypes.js

const express = require("express");
const LogType = require("../models/LogType");
const LogEntry = require("../models/LogEntry");
const {
  authenticateToken,
  requireActiveSubscription,
  requireClientAdmin,
} = require("../middleware/auth");
const {
  validateLogType,
  validateObjectIdParam,
} = require("../middleware/validation");

const router = express.Router();

// IMPORTANT: Routes with specific paths must come BEFORE parameterized routes

// @route   POST /api/log-types/seed-defaults
// @desc    Create default log types for client
// @access  Private (Client Admin)
router.post(
  "/seed-defaults",
  authenticateToken,
  requireClientAdmin,
  async (req, res) => {
    try {
      const user = req.user;

      const existingCount = await LogType.countDocuments({
        clientId: user.clientId._id,
      });
      if (existingCount > 0) {
        return res.status(400).json({
          error: "Client already has log types",
          code: "LOG_TYPES_EXIST",
        });
      }

      const defaultLogTypes = [
        {
          name: "Procedure",
          description: "Medical procedures and operations",
          category: "procedure",
          color: "#3B82F6",
          icon: "scissors",
          fields: [
            {
              fieldName: "procedure_type",
              fieldType: "select",
              label: "Procedure Type",
              required: true,
              options: ["Minor", "Major", "Emergency"],
              order: 1,
            },
            {
              fieldName: "supervisor",
              fieldType: "text",
              label: "Supervisor",
              required: true,
              order: 2,
            },
            {
              fieldName: "patient_age",
              fieldType: "number",
              label: "Patient Age",
              required: false,
              order: 3,
            },
            {
              fieldName: "complications",
              fieldType: "textarea",
              label: "Complications",
              required: false,
              order: 4,
            },
          ],
          isSystem: true,
        },
        {
          name: "Consultation",
          description: "Patient consultations and assessments",
          category: "consultation",
          color: "#10B981",
          icon: "user-group",
          fields: [
            {
              fieldName: "consultation_type",
              fieldType: "select",
              label: "Type",
              required: true,
              options: ["Initial", "Follow-up", "Emergency"],
              order: 1,
            },
            {
              fieldName: "diagnosis",
              fieldType: "text",
              label: "Primary Diagnosis",
              required: false,
              order: 2,
            },
            {
              fieldName: "treatment_plan",
              fieldType: "textarea",
              label: "Treatment Plan",
              required: false,
              order: 3,
            },
          ],
          isSystem: true,
        },
        {
          name: "Teaching Session",
          description: "Medical education and training activities",
          category: "teaching",
          color: "#F59E0B",
          icon: "academic-cap",
          fields: [
            {
              fieldName: "session_type",
              fieldType: "select",
              label: "Session Type",
              required: true,
              options: ["Lecture", "Tutorial", "Bedside Teaching"],
              order: 1,
            },
            {
              fieldName: "topic",
              fieldType: "text",
              label: "Topic",
              required: true,
              order: 2,
            },
            {
              fieldName: "participants",
              fieldType: "number",
              label: "Number of Participants",
              required: false,
              order: 3,
            },
          ],
          isSystem: true,
        },
        {
          name: "Ward Round",
          description: "Ward rounds and patient reviews",
          category: "consultation",
          color: "#8B5CF6",
          icon: "clipboard-document-list",
          fields: [
            {
              fieldName: "ward",
              fieldType: "text",
              label: "Ward",
              required: true,
              order: 1,
            },
            {
              fieldName: "patients_seen",
              fieldType: "number",
              label: "Patients Seen",
              required: false,
              order: 2,
            },
            {
              fieldName: "consultant",
              fieldType: "text",
              label: "Consultant",
              required: false,
              order: 3,
            },
          ],
          isSystem: true,
        },
        {
          name: "Frog AI Assistant",
          description: "AI-powered clinical partner",
          category: "ai_assistant",
          color: "#7C3AED", // Violet-600
          icon: "sparkles",
          fields: [],
          isSystem: true,
          settings: {
            autoTranscribe: true,
            allowAudio: true,
            requireAudio: false,
            allowAttachments: true,
          },
        },
      ];

      const createdLogTypes = await LogType.insertMany(
        defaultLogTypes.map((logType) => ({
          ...logType,
          clientId: user.clientId._id,
        }))
      );

      res.status(201).json({
        message: "Default log types created successfully",
        logTypes: createdLogTypes,
      });
    } catch (error) {
      console.error("Seed default log types error:", error);
      res.status(500).json({
        error: "Failed to create default log types",
        code: "SEED_LOG_TYPES_ERROR",
      });
    }
  }
);

// @route   GET /api/log-types
// @desc    Get all log types for user's client
// @access  Private
router.get("/", authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const { includeInactive = false } = req.query;

    // Demo mode: return mock categories
    const isDemoUser = user._id === "507f1f77bcf86cd799439011";

    let query = { clientId: user.clientId._id };

    if (!includeInactive || includeInactive === "false") {
      query.isActive = true;
    }

    const logTypes = await LogType.find(query)
      .select("-__v")
      .sort("name")
      .lean();

    // Add usage count for each log type
    let logTypesWithCount = await Promise.all(
      logTypes.map(async (logType) => {
        const usageCount = await LogEntry.countDocuments({
          logTypeId: logType._id,
        });
        return { ...logType, usageCount };
      })
    );

    // For demo user, add mock categories
    if (isDemoUser) {
      const mockCategories = [
        {
          _id: "507f1f77bcf86cd799439021",
          name: "Procedure",
          description: "Medical procedures and operations",
          category: "procedure",
          color: "#3B82F6",
          icon: "scissors",
          fields: [],
          isActive: true,
          isSystem: true,
          usageCount: 15
        },
        {
          _id: "507f1f77bcf86cd799439022",
          name: "Consultation",
          description: "Patient consultations",
          category: "consultation",
          color: "#10B981",
          icon: "user-group",
          fields: [],
          isActive: true,
          isSystem: true,
          usageCount: 8
        },
        {
          _id: "507f1f77bcf86cd799439023",
          name: "Teaching Session",
          description: "Medical education activities",
          category: "teaching",
          color: "#F59E0B",
          icon: "academic-cap",
          fields: [],
          isActive: true,
          isSystem: true,
          usageCount: 3
        }
      ];
      // Prepend mocks
      logTypesWithCount = [...mockCategories, ...logTypesWithCount];
    }

    res.json({ logTypes: logTypesWithCount });
  } catch (error) {
    console.error("Get log types error:", error);
    res.status(500).json({
      error: "Failed to get log types",
      code: "GET_LOG_TYPES_ERROR",
    });
  }
});

// @route   POST /api/log-types
// @desc    Create new log type
// @access  Private (Client Admin)
router.post(
  "/",
  authenticateToken,
  requireClientAdmin,
  requireActiveSubscription,
  validateLogType,
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeData = req.body;

      const existingLogType = await LogType.findOne({
        name: logTypeData.name,
        clientId: user.clientId._id,
      });

      if (existingLogType) {
        return res.status(400).json({
          error: "Log type name already exists",
          code: "LOG_TYPE_NAME_EXISTS",
        });
      }

      const logType = new LogType({
        ...logTypeData,
        clientId: user.clientId._id,
      });

      await logType.save();

      res.status(201).json({
        message: "Log type created successfully",
        logType,
      });
    } catch (error) {
      console.error("Create log type error:", error);
      res.status(500).json({
        error: "Failed to create log type",
        code: "CREATE_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   POST /api/log-types/:id/clone
// @desc    Clone log type
// @access  Private (Client Admin)
router.post(
  "/:id/clone",
  authenticateToken,
  requireClientAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({
          error: "Name is required for cloned log type",
          code: "NAME_REQUIRED",
        });
      }

      const originalLogType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!originalLogType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      const existingLogType = await LogType.findOne({
        name: name,
        clientId: user.clientId._id,
      });

      if (existingLogType) {
        return res.status(400).json({
          error: "Log type name already exists",
          code: "LOG_TYPE_NAME_EXISTS",
        });
      }

      const clonedLogType = new LogType({
        name: name,
        description: originalLogType.description,
        category: originalLogType.category,
        color: originalLogType.color,
        icon: originalLogType.icon,
        fields: originalLogType.fields,
        clientId: user.clientId._id,
        isActive: true,
        isSystem: false,
      });

      await clonedLogType.save();

      res.status(201).json({
        message: "Log type cloned successfully",
        logType: clonedLogType,
      });
    } catch (error) {
      console.error("Clone log type error:", error);
      res.status(500).json({
        error: "Failed to clone log type",
        code: "CLONE_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   POST /api/log-types/:id/deactivate
// @desc    Deactivate log type
// @access  Private (Client Admin)
router.post(
  "/:id/deactivate",
  authenticateToken,
  requireClientAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      if (logType.isSystem) {
        return res.status(400).json({
          error: "Cannot deactivate system log type",
          code: "SYSTEM_LOG_TYPE",
        });
      }

      logType.isActive = false;
      await logType.save();

      res.json({
        message: "Log type deactivated successfully",
        logType,
      });
    } catch (error) {
      console.error("Deactivate log type error:", error);
      res.status(500).json({
        error: "Failed to deactivate log type",
        code: "DEACTIVATE_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   POST /api/log-types/:id/activate
// @desc    Activate log type
// @access  Private (Client Admin)
router.post(
  "/:id/activate",
  authenticateToken,
  requireClientAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      logType.isActive = true;
      await logType.save();

      res.json({
        message: "Log type activated successfully",
        logType,
      });
    } catch (error) {
      console.error("Activate log type error:", error);
      res.status(500).json({
        error: "Failed to activate log type",
        code: "ACTIVATE_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   GET /api/log-types/:id/stats
// @desc    Get statistics for a log type
// @access  Private
router.get(
  "/:id/stats",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      const stats = await LogEntry.aggregate([
        { $match: { logTypeId: logType._id } },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            monthlyTrend: [
              {
                $group: {
                  _id: {
                    year: { $year: "$createdAt" },
                    month: { $month: "$createdAt" },
                  },
                  count: { $sum: 1 },
                },
              },
              { $sort: { "_id.year": -1, "_id.month": -1 } },
              { $limit: 12 },
            ],
            withAudio: [
              { $match: { audioUrl: { $ne: null } } },
              { $count: "count" },
            ],
          },
        },
      ]);

      const result = stats[0];

      res.json({
        stats: {
          totalEntries: result.total[0]?.count || 0,
          entriesWithAudio: result.withAudio[0]?.count || 0,
          byStatus: result.byStatus,
          monthlyTrend: result.monthlyTrend,
        },
      });
    } catch (error) {
      console.error("Get log type stats error:", error);
      res.status(500).json({
        error: "Failed to get log type statistics",
        code: "GET_LOG_TYPE_STATS_ERROR",
      });
    }
  }
);

// @route   GET /api/log-types/:id
// @desc    Get log type by ID
// @access  Private
router.get(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      }).lean();

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      const usageCount = await LogEntry.countDocuments({
        logTypeId: logType._id,
      });

      res.json({ logType: { ...logType, usageCount } });
    } catch (error) {
      console.error("Get log type error:", error);
      res.status(500).json({
        error: "Failed to get log type",
        code: "GET_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   PUT /api/log-types/:id
// @desc    Update log type
// @access  Private (Client Admin)
router.put(
  "/:id",
  authenticateToken,
  requireClientAdmin,
  requireActiveSubscription,
  validateObjectIdParam("id"),
  validateLogType,
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;
      const updates = req.body;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      if (logType.isSystem) {
        return res.status(400).json({
          error: "Cannot modify system log type",
          code: "SYSTEM_LOG_TYPE",
        });
      }

      if (updates.name && updates.name !== logType.name) {
        const existingLogType = await LogType.findOne({
          name: updates.name,
          clientId: user.clientId._id,
          _id: { $ne: logTypeId },
        });

        if (existingLogType) {
          return res.status(400).json({
            error: "Log type name already exists",
            code: "LOG_TYPE_NAME_EXISTS",
          });
        }
      }

      Object.assign(logType, updates);
      await logType.save();

      res.json({
        message: "Log type updated successfully",
        logType,
      });
    } catch (error) {
      console.error("Update log type error:", error);
      res.status(500).json({
        error: "Failed to update log type",
        code: "UPDATE_LOG_TYPE_ERROR",
      });
    }
  }
);

// @route   DELETE /api/log-types/:id
// @desc    Delete log type
// @access  Private (Client Admin)
router.delete(
  "/:id",
  authenticateToken,
  requireClientAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const user = req.user;
      const logTypeId = req.params.id;

      const logType = await LogType.findOne({
        _id: logTypeId,
        clientId: user.clientId._id,
      });

      if (!logType) {
        return res.status(404).json({
          error: "Log type not found",
          code: "LOG_TYPE_NOT_FOUND",
        });
      }

      if (logType.isSystem) {
        return res.status(400).json({
          error: "Cannot delete system log type",
          code: "SYSTEM_LOG_TYPE",
        });
      }

      const entryCount = await LogEntry.countDocuments({ logTypeId });
      if (entryCount > 0) {
        return res.status(400).json({
          error: `Cannot delete log type with ${entryCount} associated entries`,
          code: "LOG_TYPE_HAS_ENTRIES",
          entryCount,
        });
      }

      await LogType.findByIdAndDelete(logTypeId);

      res.json({
        message: "Log type deleted successfully",
      });
    } catch (error) {
      console.error("Delete log type error:", error);
      res.status(500).json({
        error: "Failed to delete log type",
        code: "DELETE_LOG_TYPE_ERROR",
      });
    }
  }
);

module.exports = router;
