const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const path = require("path");
require("dotenv").config();

const { connectDB, logger } = require("./config/database");
const {
  initializeSpeechToText,
  initializeGoogleOAuth,
} = require("./config/googleCloud");
const { initializeStripe } = require("./config/stripe");

// Initialize transcription job processor
const transcriptionQueue = require("./jobs/transcriptionProcessor");

// Import routes
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const clientRoutes = require("./routes/clients");
const logTypeRoutes = require("./routes/logTypes");
const logEntryRoutes = require("./routes/logEntries");
const audioRoutes = require("./routes/audio");
const exportRoutes = require("./routes/exports");
const subscriptionRoutes = require("./routes/subscriptions");
const webhookRoutes = require("./routes/webhooks");
const aiRoutes = require("./routes/ai");

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://cdn.tailwindcss.com",
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://js.stripe.com",
          "https://cdn.tailwindcss.com",
          "https://accounts.google.com",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          "https://api.stripe.com",
          "https://speech.googleapis.com",
          "https://oauth2.googleapis.com",
          "https://www.googleapis.com",
          "https://accounts.google.com",
        ],
        frameSrc: ["https://js.stripe.com", "https://accounts.google.com"],
      },
    },
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "https://localhost:3000",
      "https://localhost:3001",
      "capacitor://localhost",
      "http://localhost",
      "https://froglogbook.com",
      "https://www.froglogbook.com",
      process.env.FRONTEND_URL,
      process.env.PRODUCTION_URL,
    ].filter(Boolean);

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: "Too many requests from this IP",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", limiter);

// Stripe webhook endpoint (must be before body parsing)
app.use("/api/webhooks", webhookRoutes);

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
    services: {
      database: global.dbConnected || false,
      googleOAuth: global.googleOAuthInitialized || false,
      speechToText: global.speechToTextInitialized || false,
      stripe: global.stripeInitialized || false,
    },
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/log-types", logTypeRoutes);
app.use("/api/log-entries", logEntryRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/exports", exportRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/subscriptions", subscriptionRoutes);

// Serve static files from React build
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../frontend/build")));

  app.get("*", (req, res) => {
    res.sendFile(path.resolve(__dirname, "../frontend/build/index.html"));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    code: "ROUTE_NOT_FOUND",
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation error",
      details: Object.values(err.errors).map((e) => e.message),
      code: "VALIDATION_ERROR",
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      error: "Invalid ID format",
      code: "INVALID_ID",
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      error: "Duplicate key error",
      code: "DUPLICATE_KEY",
    });
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      error: "CORS policy violation",
      code: "CORS_ERROR",
    });
  }

  if (err.name === "UnauthorizedError") {
    return res.status(401).json({
      error: "Invalid or expired token",
      code: "UNAUTHORIZED",
    });
  }

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
    code: err.code || "INTERNAL_ERROR",
  });
});

// Initialize services and start server
const startServer = async () => {
  try {
    logger.info("Starting FrogLog Medical Server...");
    logger.info("================================");

    // Connect to MongoDB
    const dbConnection = await connectDB();
    if (dbConnection) {
      logger.info("Database: Connected");
      global.dbConnected = true;
    } else {
      logger.warn("Database: Running in DEMO mode without database");
      global.dbConnected = false;
    }

    // Initialize Google Cloud Speech-to-Text
    try {
      initializeSpeechToText();
      global.speechToTextInitialized = true;
      logger.info("Google Speech-to-Text: Initialized");
    } catch (error) {
      logger.warn(
        "Google Speech-to-Text: Not configured - transcription features disabled"
      );
      logger.warn(
        "To enable: Set GOOGLE_CLOUD_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS in .env"
      );
      global.speechToTextInitialized = false;
    }

    // Initialize Google OAuth
    try {
      initializeGoogleOAuth();
      global.googleOAuthInitialized = true;
      logger.info("Google OAuth: Initialized");
    } catch (error) {
      logger.warn(
        "Google OAuth: Not configured - OAuth authentication disabled"
      );
      logger.warn(
        "To enable: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
      );
      global.googleOAuthInitialized = false;
    }

    // Initialize Stripe
    try {
      initializeStripe();
      global.stripeInitialized = true;
      logger.info("Stripe: Initialized");
    } catch (error) {
      logger.warn("Stripe: Not configured - payment features disabled");
      logger.warn("To enable: Set STRIPE_SECRET_KEY in .env");
      global.stripeInitialized = false;
    }

    logger.info("================================");

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);

      if (process.env.NODE_ENV !== "production") {
        logger.info(`Frontend: http://localhost:3000 (when running)`);
        logger.info(`API Base: http://localhost:${PORT}/api`);
      }

      // Show setup instructions if services not configured
      const missingServices = [];
      if (!global.dbConnected) missingServices.push("MongoDB");
      if (!global.speechToTextInitialized)
        missingServices.push("Google Speech-to-Text");
      if (!global.googleOAuthInitialized) missingServices.push("Google OAuth");
      if (!global.stripeInitialized) missingServices.push("Stripe");

      if (missingServices.length > 0) {
        logger.info("");
        logger.info("Missing services: " + missingServices.join(", "));
        logger.info("To enable full functionality:");

        if (!global.dbConnected) {
          logger.info("  1. MongoDB:");
          logger.info(
            "     - Install: https://www.mongodb.com/docs/manual/installation/"
          );
          logger.info("     - Set MONGODB_URI in .env");
        }

        if (!global.googleOAuthInitialized) {
          logger.info("  2. Google OAuth:");
          logger.info(
            "     - Visit: https://console.cloud.google.com/apis/credentials"
          );
          logger.info("     - Create OAuth 2.0 Client ID");
          logger.info(
            "     - Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env"
          );
        }

        if (!global.speechToTextInitialized) {
          logger.info("  3. Google Cloud Speech-to-Text:");
          logger.info(
            "     - Enable API: https://console.cloud.google.com/apis/library/speech.googleapis.com"
          );
          logger.info("     - Create service account and download JSON key");
          logger.info(
            "     - Set GOOGLE_CLOUD_CREDENTIALS (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (file path) in .env"
          );
        }

        if (!global.stripeInitialized) {
          logger.info("  4. Stripe:");
          logger.info(
            "     - Get API keys: https://dashboard.stripe.com/apikeys"
          );
          logger.info("     - Set STRIPE_SECRET_KEY in .env");
        }
      }

      logger.info("");
      logger.info("Server ready and waiting for requests...");
    });

    // Store server reference for graceful shutdown
    global.server = server;

    // Set server timeout
    server.timeout = 60000; // 60 seconds
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
// Handle unhandled promise rejections
process.on("unhandledRejection", (err, promise) => {
  // Ignore Redis connection errors (handled by fallback logic)
  if (err.message.includes('ECONNREFUSED') || err.code === 'ECONNREFUSED' || err.name === 'AggregateError') {
    logger.warn("Redis connection failed (background jobs disabled):", err.message);
    return;
  }

  logger.error("Unhandled Promise Rejection:", {
    error: err.message,
    stack: err.stack,
  });

  // Close server & exit process
  if (global.server) {
    global.server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", {
    error: err.message,
    stack: err.stack,
  });

  // Close server & exit process
  if (global.server) {
    global.server.close(() => process.exit(1));
  } else {
    process.exit(1);
  }
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} signal received: closing HTTP server`);

  if (global.server) {
    global.server.close(async () => {
      logger.info("HTTP server closed");

      // Close database connection
      const mongoose = require("mongoose");
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info("Database connection closed");
      }

      // Close Bull queue
      try {
        await transcriptionQueue.close();
        logger.info("Transcription queue closed");
      } catch (error) {
        logger.error("Error closing transcription queue:", error);
      }

      logger.info("Graceful shutdown completed");
      process.exit(0);
    });

    // Force close after 10 seconds
    setTimeout(() => {
      logger.error(
        "Could not close connections in time, forcefully shutting down"
      );
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Start the server
startServer();

module.exports = app;
