//config/queue.js

const Bull = require('bull');
require('dotenv').config();

// Redis connection configuration
const redisConfig = {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        // Retry strategy to prevent infinite connection loops
        retryStrategy: function (times) {
            const maxRetry = 3;
            if (times > maxRetry) {
                // End reconnecting with a built in error
                return null;
            }
            // Reconnect after
            return Math.min(times * 50, 2000);
        },
    },
};

// Create transcription queue with error handling
let transcriptionQueue = null;
let redisAvailable = false;

try {
    transcriptionQueue = new Bull('transcription', redisConfig);
    redisAvailable = true;

    // Queue event handlers
    transcriptionQueue.on('error', (error) => {
        console.error('Queue error:', error);
        redisAvailable = false;
    });

    transcriptionQueue.on('failed', (job, error) => {
        console.error(`Job ${job.id} failed:`, error.message);
    });

    transcriptionQueue.on('completed', (job, result) => {
        console.log(`Job ${job.id} completed successfully`);
    });

    transcriptionQueue.on('stalled', (job) => {
        console.warn(`Job ${job.id} stalled`);
    });

    console.log('Bull queue initialized - Redis available');
} catch (error) {
    console.warn('Redis not available - falling back to synchronous transcription');
    console.warn('To enable background jobs: Install and start Redis');
    redisAvailable = false;
}

// Configure job options
const defaultJobOptions = {
    attempts: 3, // Retry up to 3 times
    backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 second delay
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 200, // Keep last 200 failed jobs
};

module.exports = {
    transcriptionQueue,
    defaultJobOptions,
    redisConfig,
    redisAvailable,
};
