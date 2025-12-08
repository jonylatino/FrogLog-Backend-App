const jwt = require('jsonwebtoken');
const { verifyFirebaseToken } = require('../config/firebase');
const User = require('../models/User');
const Client = require('../models/Client');

// Middleware to authenticate JWT tokens
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: 'Access token required',
        code: 'NO_TOKEN'
      });
    }

    // Try to verify as JWT first (for API tokens)
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      // DEMO MODE: If token is demo token (regardless of DB connection)
      if (decoded.isDemo) {
        req.user = {
          _id: "507f1f77bcf86cd799439011",
          email: "demo@example.com",
          name: "Demo User",
          role: "client_admin",
          clientId: {
            _id: "507f1f77bcf86cd799439012",
            name: "Demo Client",
            domain: "example.com"
          },
          hasActiveSubscription: true,
          subscriptionStatus: "active",
          isActive: true
        };
        req.client = req.user.clientId;
        return next();
      }

      const user = await User.findById(decoded.userId)
        .populate('clientId')
        .select('-__v');

      if (!user) {
        return res.status(401).json({
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          error: 'Account deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }

      req.user = user;
      req.client = user.clientId;
      next();
    } catch (jwtError) {
      console.log("JWT Verification/DB Error:", jwtError.message);
      // If JWT verification fails, try Firebase token
      try {
        const decodedToken = await verifyFirebaseToken(token);
        const user = await User.findOne({
          $or: [
            { googleId: decodedToken.uid },
            { email: decodedToken.email }
          ]
        }).populate('clientId');

        if (!user) {
          return res.status(401).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND'
          });
        }

        if (!user.isActive) {
          return res.status(401).json({
            error: 'Account deactivated',
            code: 'ACCOUNT_DEACTIVATED'
          });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        req.user = user;
        req.client = user.clientId;
        req.firebaseUser = decodedToken;
        next();
      } catch (firebaseError) {
        console.error('Token verification failed:', firebaseError);
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware to check if user has active subscription
const requireActiveSubscription = (req, res, next) => {
  try {
    const user = req.user;

    if (!user.hasActiveSubscription) {
      return res.status(403).json({
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus: user.subscriptionStatus,
        trialDaysRemaining: user.trialDaysRemaining,
        trialEndDate: user.trialEndDate
      });
    }

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      error: 'Subscription check failed',
      code: 'SUBSCRIPTION_CHECK_ERROR'
    });
  }
};

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
  try {
    const user = req.user;

    if (user.role !== 'admin' && user.role !== 'client_admin') {
      return res.status(403).json({
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      error: 'Admin check failed',
      code: 'ADMIN_CHECK_ERROR'
    });
  }
};

// Middleware to check if user is client admin
const requireClientAdmin = (req, res, next) => {
  try {
    const user = req.user;

    if (user.role !== 'client_admin' && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Client admin access required',
        code: 'CLIENT_ADMIN_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('Client admin check error:', error);
    res.status(500).json({
      error: 'Client admin check failed',
      code: 'CLIENT_ADMIN_CHECK_ERROR'
    });
  }
};

// Middleware to ensure resource belongs to user's client
const requireSameClient = (paramName = 'clientId') => {
  return (req, res, next) => {
    try {
      const user = req.user;
      const requestedClientId = req.params[paramName] || req.body.clientId;

      if (user.role === 'admin') {
        // Super admin can access any client
        next();
        return;
      }

      if (!requestedClientId) {
        return res.status(400).json({
          error: 'Client ID required',
          code: 'CLIENT_ID_REQUIRED'
        });
      }

      if (user.clientId._id.toString() !== requestedClientId.toString()) {
        return res.status(403).json({
          error: 'Access denied: different client',
          code: 'DIFFERENT_CLIENT'
        });
      }

      next();
    } catch (error) {
      console.error('Client check error:', error);
      res.status(500).json({
        error: 'Client check failed',
        code: 'CLIENT_CHECK_ERROR'
      });
    }
  };
};

// Middleware to ensure resource belongs to user (or user is admin)
const requireOwnership = (userIdParam = 'userId') => {
  return (req, res, next) => {
    try {
      const user = req.user;
      const requestedUserId = req.params[userIdParam] || req.body.userId;

      if (user.role === 'admin' || user.role === 'client_admin') {
        // Admins can access any resource within their scope
        next();
        return;
      }

      if (!requestedUserId) {
        return res.status(400).json({
          error: 'User ID required',
          code: 'USER_ID_REQUIRED'
        });
      }

      if (user._id.toString() !== requestedUserId.toString()) {
        return res.status(403).json({
          error: 'Access denied: resource ownership required',
          code: 'OWNERSHIP_REQUIRED'
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        error: 'Ownership check failed',
        code: 'OWNERSHIP_CHECK_ERROR'
      });
    }
  };
};

module.exports = {
  authenticateToken,
  requireActiveSubscription,
  requireAdmin,
  requireClientAdmin,
  requireSameClient,
  requireOwnership
};