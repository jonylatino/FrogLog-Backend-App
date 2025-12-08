//config/googleCloud.js
const speech = require("@google-cloud/speech");
const { OAuth2Client } = require("google-auth-library");
const { google } = require("googleapis");
require("dotenv").config();

let speechClient = null;
let oauth2Client = null;

// Initialize Google Cloud Speech-to-Text
const initializeSpeechToText = () => {
  try {
    const credentials = process.env.GOOGLE_CLOUD_CREDENTIALS
      ? JSON.parse(process.env.GOOGLE_CLOUD_CREDENTIALS)
      : null;

    if (credentials) {
      speechClient = new speech.SpeechClient({
        credentials: credentials,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
      console.log("Google Cloud Speech-to-Text initialized successfully");
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      // Use service account file
      speechClient = new speech.SpeechClient({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      });
      console.log(
        "Google Cloud Speech-to-Text initialized with service account file"
      );
    } else {
      console.warn(
        "Google Cloud credentials not configured. Speech-to-Text will be disabled."
      );
    }

    return speechClient;
  } catch (error) {
    console.error("Error initializing Google Cloud Speech-to-Text:", error);
    return null;
  }
};

// Initialize Google OAuth2
const initializeGoogleOAuth = () => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.warn(
        "Google OAuth credentials not configured. OAuth will be disabled."
      );
      return null;
    }

    oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    console.log("Google OAuth initialized successfully");
    return oauth2Client;
  } catch (error) {
    console.error("Error initializing Google OAuth:", error);
    return null;
  }
};

// Transcribe audio file
const transcribeAudio = async (
  audioBuffer,
  encoding = "MP3",
  sampleRateHertz = 16000,
  languageCode = "en-US" // Changed from en-GB for medical model
) => {
  try {
    if (!speechClient) {
      throw new Error("Google Cloud Speech-to-Text not initialized");
    }

    const audio = {
      content: audioBuffer.toString("base64"),
    };

    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      enableAutomaticPunctuation: true,
      model: "medical_conversation", // Use medical model for better accuracy
      useEnhanced: true,
    };

    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join("\n");

    return {
      transcript: transcription,
      confidence: response.results[0]?.alternatives[0]?.confidence || 0,
      words: response.results[0]?.alternatives[0]?.words || [],
    };
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw error;
  }
};

// Long audio transcription (for files > 1 minute)
const transcribeLongAudio = async (
  audioBuffer,
  encoding = "MP3",
  sampleRateHertz = 16000,
  languageCode = "en-GB"
) => {
  try {
    if (!speechClient) {
      throw new Error("Google Cloud Speech-to-Text not initialized");
    }

    // For long audio, we need to use long running recognize
    // This requires the audio to be in Google Cloud Storage
    // For now, we'll chunk it or use streaming

    const audio = {
      content: audioBuffer.toString("base64"),
    };

    const config = {
      encoding: encoding,
      sampleRateHertz: sampleRateHertz,
      languageCode: languageCode,
      enableAutomaticPunctuation: true,
      model: "medical_conversation",
      useEnhanced: true,
      enableWordTimeOffsets: true,
      enableWordConfidence: true,
    };

    const request = {
      audio: audio,
      config: config,
    };

    const [operation] = await speechClient.longRunningRecognize(request);
    const [response] = await operation.promise();

    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join("\n");

    return {
      transcript: transcription,
      results: response.results,
      totalBilledTime: response.totalBilledTime,
    };
  } catch (error) {
    console.error("Error transcribing long audio:", error);
    throw error;
  }
};

// Generate Google OAuth URL
const getGoogleAuthUrl = () => {
  if (!oauth2Client) {
    throw new Error("Google OAuth not initialized");
  }

  const scopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });

  return url;
};

// Verify Google OAuth token
const verifyGoogleToken = async (code) => {
  try {
    if (!oauth2Client) {
      throw new Error("Google OAuth not initialized");
    }

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified,
      tokens: tokens,
    };
  } catch (error) {
    console.error("Error verifying Google token:", error);
    throw error;
  }
};

// Get user info from Google
const getGoogleUserInfo = async (accessToken) => {
  try {
    oauth2Client.setCredentials({ access_token: accessToken });

    const userInfoClient = google.oauth2("v2").userinfo;
    const userInfo = await userInfoClient.get({ auth: oauth2Client });

    return userInfo.data;
  } catch (error) {
    console.error("Error getting Google user info:", error);
    throw error;
  }
};

module.exports = {
  initializeSpeechToText,
  initializeGoogleOAuth,
  transcribeAudio,
  transcribeLongAudio,
  getGoogleAuthUrl,
  verifyGoogleToken,
  getGoogleUserInfo,
  getSpeechClient: () => speechClient,
  getOAuthClient: () => oauth2Client,
};
