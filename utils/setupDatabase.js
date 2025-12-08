const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Client = require('../models/Client');
const LogType = require('../models/LogType');

const setupDatabase = async () => {
  try {
    console.log('🔄 Setting up FrogLog Medical database...');
    
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/froglog-medical';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Create default client for demo
    const existingClient = await Client.findOne({ domain: 'demo.hospital' });
    
    let demoClient;
    if (!existingClient) {
      demoClient = new Client({
        name: 'Demo Hospital',
        domain: 'demo.hospital',
        contact: {
          adminEmail: 'admin@demo.hospital'
        },
        plan: 'basic'
      });
      await demoClient.save();
      console.log('✅ Created demo client');
    } else {
      demoClient = existingClient;
      console.log('ℹ️  Demo client already exists');
    }

    // Create default log types
    const existingLogTypes = await LogType.find({ clientId: demoClient._id });
    
    if (existingLogTypes.length === 0) {
      const defaultLogTypes = [
        {
          clientId: demoClient._id,
          name: 'Procedure',
          description: 'Medical procedures and operations',
          category: 'procedure',
          color: '#3B82F6',
          icon: 'scissors',
          fields: [
            { fieldName: 'procedure_type', fieldType: 'select', label: 'Procedure Type', required: true, options: ['Minor', 'Major', 'Emergency'], order: 1 },
            { fieldName: 'supervisor', fieldType: 'text', label: 'Supervisor', required: true, order: 2 },
            { fieldName: 'patient_age', fieldType: 'number', label: 'Patient Age', order: 3 },
            { fieldName: 'complications', fieldType: 'textarea', label: 'Complications', order: 4 }
          ],
          isSystem: true
        },
        {
          clientId: demoClient._id,
          name: 'Consultation',
          description: 'Patient consultations and assessments',
          category: 'consultation',
          color: '#10B981',
          icon: 'user-group',
          fields: [
            { fieldName: 'consultation_type', fieldType: 'select', label: 'Type', required: true, options: ['Initial', 'Follow-up', 'Emergency'], order: 1 },
            { fieldName: 'diagnosis', fieldType: 'text', label: 'Primary Diagnosis', order: 2 },
            { fieldName: 'treatment_plan', fieldType: 'textarea', label: 'Treatment Plan', order: 3 }
          ],
          isSystem: true
        },
        {
          clientId: demoClient._id,
          name: 'Teaching Session',
          description: 'Medical education and training activities',
          category: 'teaching',
          color: '#F59E0B',
          icon: 'academic-cap',
          fields: [
            { fieldName: 'session_type', fieldType: 'select', label: 'Session Type', required: true, options: ['Lecture', 'Tutorial', 'Bedside Teaching'], order: 1 },
            { fieldName: 'topic', fieldType: 'text', label: 'Topic', required: true, order: 2 },
            { fieldName: 'participants', fieldType: 'number', label: 'Number of Participants', order: 3 }
          ],
          isSystem: true
        }
      ];

      await LogType.insertMany(defaultLogTypes);
      console.log('✅ Created default log types');
    } else {
      console.log('ℹ️  Default log types already exist');
    }

    console.log('🎉 Database setup completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`- Demo Client: ${demoClient.name} (${demoClient.domain})`);
    console.log(`- Log Types: ${await LogType.countDocuments({ clientId: demoClient._id })}`);
    console.log(`- Users: ${await User.countDocuments({ clientId: demoClient._id })}`);

  } catch (error) {
    console.error('❌ Database setup failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔚 Database connection closed');
    process.exit(0);
  }
};

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase };