const mongoose = require("mongoose");
const winston = require("winston");

// Configure logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    if (!mongoURI) {
      logger.warn("⚠️  MongoDB URI not configured - running in demo mode");
      logger.warn("⚠️  Database features will not work");
      logger.warn(
        "⚠️  Set MONGODB_URI environment variable to enable database"
      );
      return null;
    }

    const options = {
      // Remove deprecated options that are causing errors
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    };

    const conn = await mongoose.connect(mongoURI, options);

    logger.info(`MongoDB Connected: ${conn.connection.host}`);

    // Handle connection events
    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });

    // Handle app termination
    process.on("SIGINT", async () => {
      logger.info("SIGINT signal received: closing MongoDB connection");
      await mongoose.connection.close();
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error("Error connecting to MongoDB:", error);
    logger.warn(
      "⚠️  Continuing without database - API endpoints will return demo data"
    );
    return null;
  }
};

module.exports = { connectDB, logger };
