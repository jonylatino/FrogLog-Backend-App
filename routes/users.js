const express = require("express");
const User = require("../models/User");
const LogEntry = require("../models/LogEntry");
const {
  authenticateToken,
  requireAdmin,
  requireSameClient,
  requireOwnership,
} = require("../middleware/auth");
const {
  validateUserUpdate,
  validateObjectIdParam,
  validatePaginationQuery,
} = require("../middleware/validation");

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only) or users in same client
// @access  Private
router.get(
  "/",
  authenticateToken,
  validatePaginationQuery,
  async (req, res) => {
    try {
      const user = req.user;
      const { page = 1, limit = 20, sort = "-createdAt", search } = req.query;

      // Build query based on user role
      let query = {};
      if (user.role !== "admin") {
        query.clientId = user.clientId._id;
      }

      // Add search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: sort,
        populate: [{ path: "clientId", select: "name domain plan" }],
        select: "-__v",
      };

      const result = await User.paginate(query, options);

      res.json({
        users: result.docs,
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
      console.error("Get users error:", error);
      res.status(500).json({
        error: "Failed to get users",
        code: "GET_USERS_ERROR",
      });
    }
  }
);

// @route   GET /api/users/preferences
// @desc    Get user preferences
// @access  Private
router.get("/preferences", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("preferences");

    // Return preferences with defaults if they don't exist
    const defaultPreferences = {
      emailNotifications: true,
      autoTranscribe: true,
      defaultLogType: null,
      language: "en",
      timezone: "Europe/London",
      dateFormat: "DD/MM/YYYY",
      pushNotifications: true,
      weeklyDigest: true,
      transcriptionComplete: true,
      portfolioReminders: false,
      profileVisibility: "private",
      dataSharing: false,
      analyticsTracking: true,
      audioQuality: "high",
      maxRecordingDuration: 300,
      defaultExportFormat: "pdf",
      includeAudio: false,
      includeReflections: true,
    };

    res.json({
      preferences: { ...defaultPreferences, ...(user?.preferences || {}) },
    });
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({
      error: "Failed to get preferences",
      code: "GET_PREFERENCES_ERROR",
    });
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences
// @access  Private
router.put("/preferences", authenticateToken, async (req, res) => {
  try {
    const { preferences } = req.body;

    console.log("Received preferences update:", preferences); // Debug log

    if (!preferences || typeof preferences !== "object") {
      return res.status(400).json({
        error: "Preferences object is required",
        code: "PREFERENCES_REQUIRED",
      });
    }

    // Build update object for all preference fields
    const updateData = {};

    // List of all allowed preference fields from SettingsPage
    const allowedPrefs = [
      "emailNotifications",
      "autoTranscribe",
      "defaultLogType",
      // Add new fields from SettingsPage
      "language",
      "timezone",
      "dateFormat",
      "pushNotifications",
      "weeklyDigest",
      "transcriptionComplete",
      "portfolioReminders",
      "profileVisibility",
      "dataSharing",
      "analyticsTracking",
      "audioQuality",
      "maxRecordingDuration",
      "defaultExportFormat",
      "includeAudio",
      "includeReflections",
    ];

    // Build the update object
    allowedPrefs.forEach((pref) => {
      if (preferences[pref] !== undefined) {
        updateData[`preferences.${pref}`] = preferences[pref];
      }
    });

    console.log("Update data:", updateData); // Debug log

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        error: "No valid preferences to update",
        code: "NO_PREFERENCES",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("preferences");

    res.json({
      message: "Preferences updated successfully",
      preferences: user?.preferences || {},
    });
  } catch (error) {
    console.error("Update preferences error:", error);
    res.status(500).json({
      error: "Failed to update preferences",
      code: "UPDATE_PREFERENCES_ERROR",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Name is required",
        code: "NAME_REQUIRED",
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { name: name.trim() } },
      { new: true, runValidators: true }
    )
      .populate("clientId", "name domain plan")
      .select("-__v");

    res.json({
      message: "Profile updated successfully",
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        profilePicture: user.profilePicture,
        subscriptionStatus: user.subscriptionStatus,
        trialEndDate: user.trialEndDate,
        trialDaysRemaining: user.trialDaysRemaining,
        hasActiveSubscription: user.hasActiveSubscription,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        client: {
          id: user.clientId._id,
          name: user.clientId.name,
          domain: user.clientId.domain,
        },
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      error: "Failed to update profile",
      code: "UPDATE_PROFILE_ERROR",
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;

      // Check permissions
      if (
        currentUser.role !== "admin" &&
        currentUser.role !== "client_admin" &&
        currentUser._id.toString() !== requestedUserId
      ) {
        return res.status(403).json({
          error: "Access denied",
          code: "ACCESS_DENIED",
        });
      }

      const user = await User.findById(requestedUserId)
        .populate("clientId", "name domain plan")
        .select("-__v");

      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // If not admin, ensure same client
      if (
        currentUser.role !== "admin" &&
        user.clientId._id.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      res.json({ user });
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({
        error: "Failed to get user",
        code: "GET_USER_ERROR",
      });
    }
  }
);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  validateUserUpdate,
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;
      const updates = req.body;

      // Check permissions
      if (
        currentUser.role !== "admin" &&
        currentUser.role !== "client_admin" &&
        currentUser._id.toString() !== requestedUserId
      ) {
        return res.status(403).json({
          error: "Access denied",
          code: "ACCESS_DENIED",
        });
      }

      const user = await User.findById(requestedUserId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // If not admin, ensure same client
      if (
        currentUser.role !== "admin" &&
        user.clientId.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      // Restrict role changes
      if (updates.role && currentUser.role !== "admin") {
        delete updates.role;
      }

      // Update user
      Object.assign(user, updates);
      await user.save();

      await user.populate("clientId", "name domain plan");

      res.json({
        message: "User updated successfully",
        user,
      });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({
        error: "Failed to update user",
        code: "UPDATE_USER_ERROR",
      });
    }
  }
);

// @route   DELETE /api/users/:id
// @desc    Delete user and all associated data
// @access  Private
router.delete(
  "/:id",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;

      // Check permissions - only admin or the user themselves can delete
      if (
        currentUser.role !== "admin" &&
        currentUser._id.toString() !== requestedUserId
      ) {
        return res.status(403).json({
          error: "Access denied",
          code: "ACCESS_DENIED",
        });
      }

      const user = await User.findById(requestedUserId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // If not admin, ensure same client
      if (
        currentUser.role !== "admin" &&
        user.clientId.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      // Delete all user's log entries
      const deletedEntries = await LogEntry.deleteMany({
        userId: requestedUserId,
      });
      console.log(
        `Deleted ${deletedEntries.deletedCount} log entries for user ${requestedUserId}`
      );

      // TODO: Delete audio files from storage
      // TODO: Cancel Stripe subscription if exists

      // Delete user
      await User.findByIdAndDelete(requestedUserId);

      res.json({
        message: "User and all associated data deleted successfully",
        deletedEntries: deletedEntries.deletedCount,
      });
    } catch (error) {
      console.error("Delete user error:", error);
      res.status(500).json({
        error: "Failed to delete user",
        code: "DELETE_USER_ERROR",
      });
    }
  }
);

// @route   GET /api/users/:id/stats
// @desc    Get user statistics
// @access  Private
router.get(
  "/:id/stats",
  authenticateToken,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;

      // Check permissions
      if (
        currentUser.role !== "admin" &&
        currentUser.role !== "client_admin" &&
        currentUser._id.toString() !== requestedUserId
      ) {
        return res.status(403).json({
          error: "Access denied",
          code: "ACCESS_DENIED",
        });
      }

      const user = await User.findById(requestedUserId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // If not admin, ensure same client
      if (
        currentUser.role !== "admin" &&
        user.clientId.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      // Get statistics
      const stats = await LogEntry.aggregate([
        { $match: { userId: user._id } },
        {
          $facet: {
            total: [{ $count: "count" }],
            byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
            byMonth: [
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
            withTranscript: [
              { $match: { transcript: { $ne: null } } },
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
          entriesWithTranscript: result.withTranscript[0]?.count || 0,
          byStatus: result.byStatus,
          monthlyTrend: result.byMonth,
        },
      });
    } catch (error) {
      console.error("Get user stats error:", error);
      res.status(500).json({
        error: "Failed to get user statistics",
        code: "GET_USER_STATS_ERROR",
      });
    }
  }
);

// @route   POST /api/users/:id/deactivate
// @desc    Deactivate user account
// @access  Private (Admin or Client Admin only)
router.post(
  "/:id/deactivate",
  authenticateToken,
  requireAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;

      const user = await User.findById(requestedUserId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Client admins can only deactivate users in their client
      if (
        currentUser.role === "client_admin" &&
        user.clientId.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      user.isActive = false;
      await user.save();

      res.json({
        message: "User deactivated successfully",
      });
    } catch (error) {
      console.error("Deactivate user error:", error);
      res.status(500).json({
        error: "Failed to deactivate user",
        code: "DEACTIVATE_USER_ERROR",
      });
    }
  }
);

// @route   POST /api/users/:id/activate
// @desc    Activate user account
// @access  Private (Admin or Client Admin only)
router.post(
  "/:id/activate",
  authenticateToken,
  requireAdmin,
  validateObjectIdParam("id"),
  async (req, res) => {
    try {
      const requestedUserId = req.params.id;
      const currentUser = req.user;

      const user = await User.findById(requestedUserId);
      if (!user) {
        return res.status(404).json({
          error: "User not found",
          code: "USER_NOT_FOUND",
        });
      }

      // Client admins can only activate users in their client
      if (
        currentUser.role === "client_admin" &&
        user.clientId.toString() !== currentUser.clientId._id.toString()
      ) {
        return res.status(403).json({
          error: "Access denied: different client",
          code: "DIFFERENT_CLIENT",
        });
      }

      user.isActive = true;
      await user.save();

      res.json({
        message: "User activated successfully",
      });
    } catch (error) {
      console.error("Activate user error:", error);
      res.status(500).json({
        error: "Failed to activate user",
        code: "ACTIVATE_USER_ERROR",
      });
    }
  }
);

module.exports = router;
