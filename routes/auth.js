const express = require("express");
const jwt = require("jsonwebtoken");
const { verifyFirebaseToken } = require("../config/firebase");
const { createCustomer } = require("../config/stripe");
const User = require("../models/User");
const Client = require("../models/Client");
const { validateUserRegistration } = require("../middleware/validation");
const { authenticateToken } = require("../middleware/auth");
const {
  getGoogleAuthUrl,
  verifyGoogleToken,
} = require("../config/googleCloud");

const router = express.Router();

// @route   GET /api/auth/google
// @desc    Get Google OAuth URL
// @access  Public
router.get("/google", (req, res) => {
  try {
    const authUrl = getGoogleAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error("Get Google auth URL error:", error);
    res.status(500).json({
      error: "Failed to generate Google auth URL",
      code: "GOOGLE_AUTH_URL_ERROR",
    });
  }
});

// @route   POST /api/auth/google/callback
// @desc    Handle Google OAuth callback
// @access  Public
router.post("/google/callback", async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: "Authorization code required",
        code: "CODE_REQUIRED",
      });
    }

    // Verify Google token and get user info
    const googleUser = await verifyGoogleToken(code);

    // Check if user exists
    let user = await User.findOne({
      $or: [{ email: googleUser.email }, { googleId: googleUser.googleId }],
    }).populate("clientId");

    if (user) {
      // User exists - login
      if (!user.isActive) {
        return res.status(401).json({
          error: "Account is deactivated",
          code: "ACCOUNT_DEACTIVATED",
        });
      }

      // Update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleUser.googleId;
      }

      // Update profile picture
      if (googleUser.picture && !user.profilePicture) {
        user.profilePicture = googleUser.picture;
      }

      user.lastLogin = new Date();
      await user.save();

      // Generate JWT
      const jwtToken = jwt.sign(
        { userId: user._id, clientId: user.clientId._id },
        process.env.JWT_SECRET || "fallback_secret",
        { expiresIn: "7d" }
      );

      return res.json({
        message: "Login successful",
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
          client: {
            id: user.clientId._id,
            name: user.clientId.name,
            domain: user.clientId.domain,
          },
        },
        token: jwtToken,
      });
    }

    // New user - register
    const emailDomain = googleUser.email.split("@")[1];
    let client = await Client.findOne({ domain: emailDomain });

    if (!client) {
      client = new Client({
        name: emailDomain,
        domain: emailDomain,
        contact: {
          adminEmail: googleUser.email,
        },
      });
      await client.save();
    }

    // Create Stripe customer
    let stripeCustomerId = null;
    try {
      const stripeCustomer = await createCustomer(
        googleUser.email,
        googleUser.name,
        {
          clientId: client._id.toString(),
          googleId: googleUser.googleId,
        }
      );
      stripeCustomerId = stripeCustomer.id;
    } catch (stripeError) {
      console.error("Stripe customer creation failed:", stripeError);
    }

    // Create user
    user = new User({
      email: googleUser.email,
      name: googleUser.name,
      googleId: googleUser.googleId,
      profilePicture: googleUser.picture,
      clientId: client._id,
      stripeCustomerId,
      role:
        client.contact.adminEmail === googleUser.email
          ? "client_admin"
          : "user",
    });

    await user.save();
    await user.populate("clientId");

    // Generate JWT
    const jwtToken = jwt.sign(
      { userId: user._id, clientId: client._id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
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
        client: {
          id: user.clientId._id,
          name: user.clientId.name,
          domain: user.clientId.domain,
        },
      },
      token: jwtToken,
    });
  } catch (error) {
    console.error("Google OAuth callback error:", error);
    res.status(500).json({
      error: "Google authentication failed",
      code: "GOOGLE_AUTH_ERROR",
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register new user with Google OAuth
// @access  Public
router.post("/register", validateUserRegistration, async (req, res) => {
  try {
    const { email, name, firebaseToken, clientDomain } = req.body;

    // Verify Firebase token
    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(firebaseToken);
      if (firebaseUser.email !== email) {
        return res.status(400).json({
          error: "Token email does not match provided email",
          code: "EMAIL_MISMATCH",
        });
      }
    } catch (error) {
      return res.status(400).json({
        error: "Invalid Firebase token",
        code: "INVALID_FIREBASE_TOKEN",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: email }, { googleId: firebaseUser.uid }],
    });

    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
        code: "USER_EXISTS",
      });
    }

    // Find or create client
    let client;
    if (clientDomain) {
      client = await Client.findOne({ domain: clientDomain.toLowerCase() });
      if (!client) {
        // Create new client
        client = new Client({
          name: clientDomain,
          domain: clientDomain.toLowerCase(),
          contact: {
            adminEmail: email,
          },
        });
        await client.save();
      }
    } else {
      // Extract domain from email for automatic client assignment
      const emailDomain = email.split("@")[1];
      client = await Client.findOne({ domain: emailDomain });

      if (!client) {
        // Create new client based on email domain
        client = new Client({
          name: emailDomain,
          domain: emailDomain,
          contact: {
            adminEmail: email,
          },
        });
        await client.save();
      }
    }

    // Create Stripe customer
    let stripeCustomerId = null;
    try {
      const stripeCustomer = await createCustomer(email, name, {
        clientId: client._id.toString(),
        firebaseUid: firebaseUser.uid,
      });
      stripeCustomerId = stripeCustomer.id;
    } catch (stripeError) {
      console.error("Stripe customer creation failed:", stripeError);
      // Continue without Stripe customer for now
    }

    // Create user
    const user = new User({
      email,
      name,
      googleId: firebaseUser.uid,
      profilePicture: firebaseUser.picture || null,
      clientId: client._id,
      stripeCustomerId,
      role: client.contact.adminEmail === email ? "client_admin" : "user",
    });

    await user.save();

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user._id, clientId: client._id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    // Populate client data
    await user.populate("clientId");

    res.status(201).json({
      message: "User registered successfully",
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
        client: {
          id: user.clientId._id,
          name: user.clientId.name,
          domain: user.clientId.domain,
        },
      },
      token: jwtToken,
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({
      error: "Registration failed",
      code: "REGISTRATION_ERROR",
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with Google OAuth
// @access  Public
router.post("/login", async (req, res) => {
  console.log("Login attempt. global.dbConnected:", global.dbConnected, "Type:", typeof global.dbConnected);

  const { firebaseToken, isDemo } = req.body;

  // DEMO MODE: If database is not connected OR isDemo flag is sent
  if (!global.dbConnected || isDemo) {
    const mockUser = {
      id: "507f1f77bcf86cd799439011",
      email: "demo@example.com",
      name: "Demo User",
      role: "client_admin",
      profilePicture: "https://via.placeholder.com/150",
      subscriptionStatus: "active",
      trialEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      trialDaysRemaining: 30,
      hasActiveSubscription: true,
      client: {
        id: "507f1f77bcf86cd799439012",
        name: "Demo Client",
        domain: "example.com",
      },
    };

    const jwtToken = jwt.sign(
      { userId: mockUser.id, clientId: mockUser.client.id, isDemo: true },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    return res.json({
      message: "Login successful (Demo Mode)",
      user: mockUser,
      token: jwtToken,
    });
  }

  try {
    const { firebaseToken } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({
        error: "Firebase token required",
        code: "TOKEN_REQUIRED",
      });
    }

    // Verify Firebase token
    let firebaseUser;
    try {
      firebaseUser = await verifyFirebaseToken(firebaseToken);
    } catch (error) {
      return res.status(400).json({
        error: "Invalid Firebase token",
        code: "INVALID_FIREBASE_TOKEN",
      });
    }

    // Find user by Google ID or email
    const user = await User.findOne({
      $or: [{ googleId: firebaseUser.uid }, { email: firebaseUser.email }],
    }).populate("clientId");

    if (!user) {
      return res.status(404).json({
        error: "User not found. Please register first.",
        code: "USER_NOT_FOUND",
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: "Account is deactivated",
        code: "ACCOUNT_DEACTIVATED",
      });
    }

    // Update user's Google ID if not set
    if (!user.googleId && firebaseUser.uid) {
      user.googleId = firebaseUser.uid;
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate JWT token
    const jwtToken = jwt.sign(
      { userId: user._id, clientId: user.clientId._id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
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
        client: {
          id: user.clientId._id,
          name: user.clientId.name,
          domain: user.clientId.domain,
        },
      },
      token: jwtToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Login failed",
      code: "LOGIN_ERROR",
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user info
// @access  Private
router.get("/me", authenticateToken, async (req, res) => {
  try {
    // req.user is already populated by authenticateToken middleware
    const user = req.user;

    res.json({
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
    });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({
      error: "Failed to get user info",
      code: "GET_USER_ERROR",
    });
  }
});
// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Private
router.post("/refresh", authenticateToken, async (req, res) => {
  try {
    const user = req.user;

    // Generate new JWT token
    const jwtToken = jwt.sign(
      { userId: user._id, clientId: user.clientId._id },
      process.env.JWT_SECRET || "fallback_secret",
      { expiresIn: "7d" }
    );

    res.json({
      message: "Token refreshed successfully",
      token: jwtToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({
      error: "Token refresh failed",
      code: "TOKEN_REFRESH_ERROR",
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user (client-side token removal)
// @access  Private
router.post("/logout", authenticateToken, (req, res) => {
  // With JWT, logout is handled client-side by removing the token
  res.json({
    message: "Logged out successfully",
  });
});

module.exports = router;
