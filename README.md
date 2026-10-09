# PetroVision

PetroVision's `public/` folder contains the web UI. `github/` is the original
Express/TypeScript API folder, and `backend/` is the deployment-ready API copy
for Vercel. The UI sends authentication and feature data to the API; browser
localStorage is used only to retain the login tokens.

## Run the app locally

Requirements: Node.js 20 or newer and npm.

1. In a terminal, go to `github/` and install the dependencies:

   ```powershell
   cd github
   npm install
   ```

2. Start the API and UI server:

   ```powershell
   npm run dev
   ```

3. Open [http://localhost:3000/index.html](http://localhost:3000/index.html),
   create an account, and sign in. The API health check is at
   [http://localhost:3000/health](http://localhost:3000/health).

The server also exposes the API directly at `/api`. For example, use
`POST /api/auth/register` to create an account. Set `ADMIN_EMAIL` in
`github/.env` before registering the matching email address to grant that
account the admin role. Do not use the development JWT secret outside local
development.

For a separate VS Code Live Server UI (port 5500 or 5501), start the API as
above and serve `public/` with Live Server. The UI uses `http://localhost:3000/api`
on those ports.

## Deploy to Vercel

Deploy the UI and API as **two Vercel projects from this same repository**.
Use the deployment-ready API copy in `backend/`; the original `github/` folder
remains in place:

1. **Deploy the API project first.** Import the repository in Vercel, set
   **Root Directory** to `backend`, choose the Express framework if Vercel asks,
   and leave the detected/default build settings in place. Vercel deploys the
   default-exported Express app in `backend/src/app.ts`. After deployment, copy
   its assigned HTTPS origin (for example, `https://your-api-project.vercel.app`).
2. **Point the UI at the API.** In `public/js/config.js`, set
   `window.PETROVISION_API_URL` to the API origin followed by `/api`, for
   example `https://your-api-project.vercel.app/api`. Commit and push this
   setting, then deploy another Vercel project from the same repository with
   **Root Directory** set to `public`. It is a plain static site; no build
   command is needed.
3. **Allow the UI origin.** In the API Vercel project's Environment Variables,
   set `FRONTEND_ORIGIN` to the exact HTTPS origin assigned to the UI project
   (no path or trailing slash), for example
   `https://your-ui-project.vercel.app`. For local Live Server development, the
   existing localhost origins are also allowed.
4. **Set API environment variables** in Vercel for the API project: a unique,
   long random `JWT_SECRET`, and `ADMIN_EMAIL` if you want to bootstrap an
   administrator. Add Google Routes or Firebase variables only if you use
   those integrations. Never put backend secrets in `public/` or in
   `public/js/config.js`.
5. Redeploy after changing project settings or environment variables. Test
   `https://your-api-project.vercel.app/api/health`, then test registration,
   sign-in, and a protected UI page on the deployed site.

The backend currently stores users, sessions, stations, and other records in
process memory. Vercel functions can restart and run in separate instances, so
those records and sessions are **not reliable or durable in a Vercel
deployment**. Treat this configuration as a deployment/staging integration
only until the backend store and session validation are moved to persistent
shared storage. See [backend/README.md](./backend/README.md) for backend routes
and deployment notes.

- `public/` — static UI and its deployed API URL configuration
- `public/js/api.js` — shared API client, session handling, and UI/API data
  mapping
- `backend/` — deployment-ready Express API copy for the Vercel project
- `github/` — original Express API folder, left in place
- `backend/src/` — API, domain models, and in-memory backend store
- `backend/test/` — API tests

Run the backend checks from `backend/`:

```powershell
npm test
npm run build
```
