const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/froglog';

async function resetPassword() {
    try {
        await mongoose.connect(MONGODB_URI);
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        await User.updateOne(
            { email: 'john.harlinson@gmail.com' },
            { password: hashedPassword }
        );
        console.log('Password reset to password123');
    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

resetPassword();
