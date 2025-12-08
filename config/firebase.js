const admin = require('firebase-admin');
require('dotenv').config();

let firebaseApp = null;

const initializeFirebase = () => {
  try {
    if (!firebaseApp) {
      // Initialize Firebase Admin SDK
      const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        : null;

      if (serviceAccount) {
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET
        });
        console.log('Firebase Admin SDK initialized successfully');
      } else {
        console.warn('Firebase Service Account not configured. Firebase features will be disabled.');
      }
    }
    return firebaseApp;
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    return null;
  }
};

const verifyFirebaseToken = async (idToken) => {
  try {
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }
    
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase token:', error);
    throw error;
  }
};

const uploadToFirebaseStorage = async (file, path) => {
  try {
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }

    const bucket = admin.storage().bucket();
    const fileRef = bucket.file(path);
    
    const stream = fileRef.createWriteStream({
      metadata: {
        contentType: file.mimetype,
      },
    });

    return new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', async () => {
        try {
          // Make the file publicly accessible
          await fileRef.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${path}`;
          resolve(publicUrl);
        } catch (error) {
          reject(error);
        }
      });
      stream.end(file.buffer);
    });
  } catch (error) {
    console.error('Error uploading to Firebase Storage:', error);
    throw error;
  }
};

const deleteFromFirebaseStorage = async (path) => {
  try {
    if (!firebaseApp) {
      throw new Error('Firebase not initialized');
    }

    const bucket = admin.storage().bucket();
    await bucket.file(path).delete();
    console.log(`File ${path} deleted from Firebase Storage`);
  } catch (error) {
    console.error('Error deleting from Firebase Storage:', error);
    throw error;
  }
};

module.exports = {
  initializeFirebase,
  verifyFirebaseToken,
  uploadToFirebaseStorage,
  deleteFromFirebaseStorage,
  getFirebaseApp: () => firebaseApp
};