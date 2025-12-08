const mongoose = require('mongoose');
require('dotenv').config();

async function testDB() {
    const uri = process.env.MONGODB_URI;
    console.log("Testing MongoDB connection to:", uri ? "URI configured" : "URI missing");

    if (!uri) return;

    try {
        await mongoose.connect(uri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log("MongoDB Connected Successfully!");
        await mongoose.connection.close();
    } catch (error) {
        console.error("MongoDB Connection Error:", error);
    }
}

testDB();
