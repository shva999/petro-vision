# PetroVision API

REST API for driver accounts, vehicle records, crowdsourced station pricing and availability, trip estimates/history, refuel tracking, gamified rewards, and fuel-price alerts.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The Express server also serves the sibling `../public` UI. Open
`http://localhost:3000/index.html` after starting the server. For a separately
served UI on localhost:5500 or localhost:5501, the development CORS allowlist
permits requests to this API; set `FRONTEND_ORIGIN` to a comma-separated list
of trusted UI origins when deploying elsewhere.

Without Firebase credentials, local mode uses in-memory storage and a development JWT secret, so it starts without cloud credentials. Data resets when the process restarts. When `FIREBASE_SERVICE_ACCOUNT_JSON` is configured, account profiles, email lookups, login sessions, vehicles, stations, price and availability reports, notification subscriptions and notifications, reward balances, reward catalog items, reward rules, redemptions, and audit/activity records are stored in Firestore. Trips and refuels still use in-memory storage. Set a private `JWT_SECRET` before exposing the service beyond local development. Set `ADMIN_EMAIL` to the email address that should receive the admin role when it registers; keep this value controlled by the deployment operator.

The API listens on `http://localhost:3000` by default. Check `GET /health` for readiness. Use `POST /api/auth/register` to create a driver and receive bearer tokens. Send the access token as `Authorization: Bearer <token>` for protected routes.

## Configuration

`GOOGLE_MAPS_API_KEY` enables Google Routes distance calculations for trip estimates. Without it, the API returns an approximate straight-line distance. Setting `FIREBASE_SERVICE_ACCOUNT_JSON` initializes Firebase Admin clients and enables Firestore persistence for accounts, sessions, vehicles, stations, price and availability reports, notification subscriptions and notifications, reward balances, catalog items, rules, redemptions, and audit/activity records. The default demo station is inserted into Firestore only when its station collection is empty. Authentication continues to use the API's local JWT tokens; Firebase Auth delegation and media upload routes are not wired. Trips and refuels remain in-process and are not durable.

Price and availability contributions earn points using the configured reward rules. Admins manage reward items and point rules through the admin routes. To make the first admin, set `ADMIN_EMAIL` before registering that email address.

## Deploy to Vercel

Import the repository as a Vercel project and set its **Root Directory** to
`backend`. Select the Express framework if prompted; otherwise keep Vercel's
detected/default build settings. Vercel recognizes the default-exported
Express app in `src/app.ts` and deploys it as a function. The app does not
serve `../public` on Vercel because the UI is deployed separately.

After creating the API deployment:

1. Set `JWT_SECRET` in the API project's Vercel Environment Variables to a
   unique, long random secret. The app refuses to start on Vercel if it is
   missing. Never use the example value as a production secret.
2. Set `FRONTEND_ORIGIN` to the exact HTTPS origin of the UI Vercel deployment
   (for example, `https://your-ui-project.vercel.app`; do not include a path
   or trailing slash). Add multiple trusted origins as comma-separated values
   if needed.
3. Create/enable a Firestore database in the Firebase project associated with
   a service account. Add `FIREBASE_SERVICE_ACCOUNT_JSON` to the API project's
   Vercel Environment Variables using the service-account JSON as a single-line
   JSON value. Keep it private; the service account needs permission to read
   and write Firestore data. This setting is required for the API to start on
   Vercel. It persists accounts, login sessions, garage vehicles, reward
   balances, catalog items, reward rules, redemptions, and reward activity
   across Vercel instances, as well as stations, reports, and alert subscriptions/notifications.
4. Set `ADMIN_EMAIL` before registering the email address intended to receive
   admin privileges. Configure optional `GOOGLE_MAPS_API_KEY` only when
   required.
5. In `../public/js/config.js`, set `window.PETROVISION_API_URL` to the
   deployed API origin plus `/api`, such as
   `https://your-api-project.vercel.app/api`, then deploy/update the UI project
   with **Root Directory** set to `public`.
6. Check `/api/health` on the API deployment and test login plus protected
   routes from the deployed UI.

Vercel functions are stateless and may run in different instances. The API
refuses to start on Vercel if Firestore credentials are missing. Station,
report, and alert data use Firestore; trip and refuel records remain in
process-local Maps and are not durable. Redemption records are stored in Firestore, though
no redemption-history endpoint is currently exposed.

## API routes

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Register and issue tokens |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/refresh` | Rotate session tokens |
| POST | `/api/auth/logout` | Revoke current session |
| GET, PUT | `/api/users/me` | Read or update driver profile |
| GET | `/api/admin/users` | List users (admin) |
| PUT | `/api/admin/users/:id/role` | Change role or suspend account (admin) |
| GET, POST | `/api/vehicles` | List or add vehicles |
| PUT, DELETE | `/api/vehicles/:id` | Edit or remove owned vehicle |
| GET | `/api/stations/nearby?lat=&lng=&radius=` | Find stations by location |
| GET | `/api/stations/:id` | Station, price, and availability details |
| POST | `/api/stations` | Suggest a station |
| GET, POST | `/api/stations/:id/price-reports` | View or submit price reports |
| PUT | `/api/price-reports/:id/verify` | Verify or dispute a report |
| POST | `/api/stations/:id/availability` | Report fuel availability |
| GET | `/api/stations` | List stations and their price/availability reports |
| POST | `/api/trips/estimate` | Estimate distance and fuel cost |
| POST | `/api/trips` | Save a completed trip |
| GET | `/api/trips`, `/api/trips/:id` | List or view trip history |
| GET, POST | `/api/refuels` | View or log refueling events |
| GET | `/api/rewards/me` | View points, badges, and contribution stats |
| GET | `/api/rewards/rules`, `/api/rewards/leaderboard`, `/api/rewards/activity` | Read reward rules, leaderboard, and activity |
| GET | `/api/rewards/catalog` | List active rewards |
| POST | `/api/rewards/redeem` | Redeem points for a reward |
| GET | `/api/notifications` | List in-app fuel price alerts |
| GET | `/api/notifications/subscriptions` | List the user's price alerts |
| POST | `/api/notifications/subscribe` | Subscribe to a station/fuel price threshold |
| DELETE | `/api/notifications/subscriptions/:id` | Remove a price alert |
| GET | `/api/admin/dashboard` | View station, report, and contributor summary (admin) |
| GET | `/api/admin/reports?status=&stationId=` | Filter price reports for review (admin) |
| PUT | `/api/admin/reports/:id/status` | Approve or reject a report (admin) |
| GET | `/api/admin/station-logs?stationId=` | View station-related activity (admin) |
| GET | `/api/admin/audit-logs?limit=` | View administrative and contribution audit trail (admin) |
| GET, POST | `/api/admin/rewards` | List or create redeemable rewards (admin) |
| PUT, DELETE | `/api/admin/rewards/:id` | Update or delete a reward (admin) |
| GET, POST | `/api/admin/rewards/rules` | List or create points rules (admin) |
| PUT, DELETE | `/api/admin/rewards/rules/:id` | Update or delete a points rule (admin) |
| PUT, DELETE | `/api/admin/stations/:id` | Edit or remove a station (admin) |
| POST | `/api/admin/reward-adjustments` | Adjust a user's points (admin) |

## Checks

```powershell
npm test
npm run build
```
