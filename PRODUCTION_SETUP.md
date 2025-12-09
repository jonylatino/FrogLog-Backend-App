# Production Environment Setup

When deploying to DigitalOcean (or any production environment), you must configure the following Environment Variables in the App Platform dashboard.

## Domain Configuration
These are critical for your new domains (`froglogbook.com` and `core.froglogbook.com`).

| Variable | Value | Description |
|----------|-------|-------------|
| `FRONTEND_URL` | `https://froglogbook.com` | Allows your frontend to access the API (CORS). |
| `PRODUCTION_URL` | `https://froglogbook.com` | Additional CORS allowed origin. |
| `GOOGLE_REDIRECT_URI` | `https://froglogbook.com` | **Crucial:** Must match the Authorized Redirect URI in Google Cloud Console. |
| `NODE_ENV` | `production` | Optimizes the server for production performance. |

## Secrets & Keys
Ensure these are set to your **Live/Production** keys, not Test keys.

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | Connection string for your production MongoDB Cluster. |
| `JWT_SECRET` | A long, random string used to secure user sessions. |
| `GOOGLE_CLIENT_ID` | Production OAuth Client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Production OAuth Client Secret. |
| `STRIPE_SECRET_KEY` | **Live** Secret Key (`sk_live_...`) from Stripe Dashboard. |
| `STRIPE_WEBHOOK_SECRET` | **Live** Webhook Secret (`whsec_...`) for your production endpoint. |
| `STRIPE_MONTHLY_PRICE_ID` | **Live** Price ID for the monthly subscription plan. |

## Google Cloud AI & Services
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLOUD_PROJECT_ID` | Your Google Cloud Project ID. |
| `GOOGLE_CLOUD_CREDENTIALS` | The content of your Service Account JSON file (as a single line string). |
| `GOOGLE_API_KEY` | API Key for Gemini/Google AI features. |

## Important Notes

1. **Google Cloud Console:** Go to [APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials).
   - Edit your OAuth 2.0 Client ID.
   - Add `https://froglogbook.com` to **Authorized JavaScript origins**.
   - Add `https://froglogbook.com` (and potentially `https://core.froglogbook.com/api/auth/google/callback` if used) to **Authorized redirect URIs**.

2. **Stripe Dashboard:**
   - Create a new Webhook Endpoint pointing to `https://core.froglogbook.com/api/webhooks`.
   - Use the signing secret from this new endpoint for `STRIPE_WEBHOOK_SECRET`.

3. **CORS:**
   - The backend code has been updated to explicitly allow `https://froglogbook.com`.
   - Setting `FRONTEND_URL` acts as a safeguard.
