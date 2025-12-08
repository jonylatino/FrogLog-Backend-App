const express = require('express');
const Client = require('../models/Client');
const User = require('../models/User');
const { authenticateToken, requireAdmin, requireClientAdmin } = require('../middleware/auth');
const { validateClient, validateObjectIdParam } = require('../middleware/validation');

const router = express.Router();

// @route   GET /api/clients
// @desc    Get all clients (admin only)
// @access  Private (Admin)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const clients = await Client.find()
      .populate('userCount')
      .populate('logTypeCount')
      .select('-__v')
      .sort('-createdAt');

    res.json({ clients });
  } catch (error) {
    console.error('Get clients error:', error);
    res.status(500).json({
      error: 'Failed to get clients',
      code: 'GET_CLIENTS_ERROR'
    });
  }
});

// @route   GET /api/clients/:id
// @desc    Get client by ID
// @access  Private
router.get('/:id', authenticateToken, validateObjectIdParam('id'), async (req, res) => {
  try {
    const user = req.user;
    const clientId = req.params.id;

    // Check permissions
    if (user.role !== 'admin' && user.clientId._id.toString() !== clientId) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const client = await Client.findById(clientId)
      .populate('userCount')
      .populate('logTypeCount')
      .select('-__v');

    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        code: 'CLIENT_NOT_FOUND'
      });
    }

    res.json({ client });
  } catch (error) {
    console.error('Get client error:', error);
    res.status(500).json({
      error: 'Failed to get client',
      code: 'GET_CLIENT_ERROR'
    });
  }
});

// @route   POST /api/clients
// @desc    Create new client
// @access  Private (Admin only)
router.post('/', authenticateToken, requireAdmin, validateClient, async (req, res) => {
  try {
    const clientData = req.body;

    // Check if domain already exists
    const existingClient = await Client.findOne({ domain: clientData.domain.toLowerCase() });
    if (existingClient) {
      return res.status(400).json({
        error: 'Client domain already exists',
        code: 'DOMAIN_EXISTS'
      });
    }

    const client = new Client({
      ...clientData,
      domain: clientData.domain.toLowerCase()
    });

    await client.save();

    res.status(201).json({
      message: 'Client created successfully',
      client
    });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({
      error: 'Failed to create client',
      code: 'CREATE_CLIENT_ERROR'
    });
  }
});

// @route   PUT /api/clients/:id
// @desc    Update client
// @access  Private (Admin or Client Admin)
router.put('/:id', authenticateToken, validateObjectIdParam('id'), validateClient, async (req, res) => {
  try {
    const user = req.user;
    const clientId = req.params.id;
    const updates = req.body;

    // Check permissions
    if (user.role !== 'admin' && 
        (user.role !== 'client_admin' || user.clientId._id.toString() !== clientId)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        code: 'CLIENT_NOT_FOUND'
      });
    }

    // Check domain uniqueness if domain is being updated
    if (updates.domain && updates.domain.toLowerCase() !== client.domain) {
      const existingClient = await Client.findOne({ domain: updates.domain.toLowerCase() });
      if (existingClient) {
        return res.status(400).json({
          error: 'Client domain already exists',
          code: 'DOMAIN_EXISTS'
        });
      }
      updates.domain = updates.domain.toLowerCase();
    }

    // Restrict certain fields for client admins
    if (user.role === 'client_admin') {
      delete updates.plan;
      delete updates.isActive;
      delete updates.settings.maxUsersPerClient;
    }

    Object.assign(client, updates);
    await client.save();

    res.json({
      message: 'Client updated successfully',
      client
    });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({
      error: 'Failed to update client',
      code: 'UPDATE_CLIENT_ERROR'
    });
  }
});

// @route   DELETE /api/clients/:id
// @desc    Delete client (Admin only)
// @access  Private (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, validateObjectIdParam('id'), async (req, res) => {
  try {
    const clientId = req.params.id;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        error: 'Client not found',
        code: 'CLIENT_NOT_FOUND'
      });
    }

    // Check if client has users
    const userCount = await User.countDocuments({ clientId });
    if (userCount > 0) {
      return res.status(400).json({
        error: `Cannot delete client with ${userCount} active users`,
        code: 'CLIENT_HAS_USERS'
      });
    }

    await Client.findByIdAndDelete(clientId);

    res.json({
      message: 'Client deleted successfully'
    });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({
      error: 'Failed to delete client',
      code: 'DELETE_CLIENT_ERROR'
    });
  }
});

// @route   GET /api/clients/:id/users
// @desc    Get all users for a client
// @access  Private (Admin or Client Admin)
router.get('/:id/users', authenticateToken, validateObjectIdParam('id'), async (req, res) => {
  try {
    const user = req.user;
    const clientId = req.params.id;

    // Check permissions
    if (user.role !== 'admin' && 
        (user.role !== 'client_admin' || user.clientId._id.toString() !== clientId)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    const users = await User.find({ clientId })
      .select('-__v')
      .sort('-createdAt');

    res.json({ users });
  } catch (error) {
    console.error('Get client users error:', error);
    res.status(500).json({
      error: 'Failed to get client users',
      code: 'GET_CLIENT_USERS_ERROR'
    });
  }
});

// @route   GET /api/clients/:id/stats
// @desc    Get client statistics
// @access  Private (Admin or Client Admin)
router.get('/:id/stats', authenticateToken, validateObjectIdParam('id'), async (req, res) => {
  try {
    const user = req.user;
    const clientId = req.params.id;

    // Check permissions
    if (user.role !== 'admin' && 
        (user.role !== 'client_admin' || user.clientId._id.toString() !== clientId)) {
      return res.status(403).json({
        error: 'Access denied',
        code: 'ACCESS_DENIED'
      });
    }

    // Get various statistics
    const [
      userStats,
      logEntryStats,
      subscriptionStats
    ] = await Promise.all([
      // User statistics
      User.aggregate([
        { $match: { clientId: require('mongoose').Types.ObjectId(clientId) } },
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
            adminUsers: { $sum: { $cond: [{ $in: ['$role', ['admin', 'client_admin']] }, 1, 0] } }
          }
        }
      ]),

      // Log entry statistics
      require('../models/LogEntry').aggregate([
        { $match: { clientId: require('mongoose').Types.ObjectId(clientId) } },
        {
          $group: {
            _id: null,
            totalEntries: { $sum: 1 },
            entriesWithAudio: { $sum: { $cond: [{ $ne: ['$audioUrl', null] }, 1, 0] } },
            entriesWithTranscript: { $sum: { $cond: [{ $ne: ['$transcript', null] }, 1, 0] } }
          }
        }
      ]),

      // Subscription statistics
      User.aggregate([
        { $match: { clientId: require('mongoose').Types.ObjectId(clientId) } },
        {
          $group: {
            _id: '$subscriptionStatus',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    res.json({
      stats: {
        users: userStats[0] || { totalUsers: 0, activeUsers: 0, adminUsers: 0 },
        logEntries: logEntryStats[0] || { totalEntries: 0, entriesWithAudio: 0, entriesWithTranscript: 0 },
        subscriptions: subscriptionStats
      }
    });
  } catch (error) {
    console.error('Get client stats error:', error);
    res.status(500).json({
      error: 'Failed to get client statistics',
      code: 'GET_CLIENT_STATS_ERROR'
    });
  }
});

module.exports = router;