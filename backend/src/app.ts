import "dotenv/config";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { z, ZodError } from "zod";
import type { Role, User } from "./domain.js";
import { firebase } from "./firebase.js";
import { activeSessions, auditLogs, availabilityReports, notifications, notificationSubscriptions, priceReports, refuels, redemptions, rewardAccounts, rewardRules, rewards, stations, trips, users, vehicles } from "./store.js";

const app = express();
if (process.env.VERCEL === "1" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be configured in the Vercel project environment.");
}
const jwtSecret = process.env.JWT_SECRET ?? "local-development-secret-change-me";
const accessTtl = process.env.ACCESS_TOKEN_TTL ?? "15m";
const refreshTtl = process.env.REFRESH_TOKEN_TTL ?? "30d";
const pointSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

declare global {
  namespace Express {
    interface Request { auth?: { userId: string; role: Role; sessionId: string } }
  }
}

app.use(express.json({ limit: "1mb" }));
const allowedOrigins = new Set([
  ...(process.env.FRONTEND_ORIGIN ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501"
]);
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(origin && allowedOrigins.has(origin) ? 204 : 403);
  return next();
});
if (process.env.VERCEL !== "1") {
  app.use(express.static(resolve(dirname(fileURLToPath(import.meta.url)), "../../public"), { index: false }));
}

function publicUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function issueTokens(user: User) {
  const sessionId = randomUUID();
  activeSessions.add(sessionId);
  const claims = { sub: user.id, role: user.role, sid: sessionId };
  return {
    accessToken: jwt.sign(claims, jwtSecret, { expiresIn: accessTtl as jwt.SignOptions["expiresIn"] }),
    refreshToken: jwt.sign({ ...claims, kind: "refresh" }, jwtSecret, { expiresIn: refreshTtl as jwt.SignOptions["expiresIn"] })
  };
}

function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string" || !activeSessions.has(payload.sid)) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }
    const user = users.get(payload.sub);
    if (!user || user.suspended) return res.status(401).json({ error: "Account unavailable" });
    req.auth = { userId: user.id, role: user.role, sessionId: payload.sid };
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  return next();
}

function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  return schema.parse(value);
}

function routeId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] ?? "" : id ?? "";
}

function rewardAccount(userId: string) {
  let account = rewardAccounts.get(userId);
  if (!account) {
    account = { userId, points: 0, contributions: 0, contributionStats: {}, badges: [] };
    rewardAccounts.set(userId, account);
  }
  return account;
}

function awardContribution(userId: string, contributionType: string) {
  const account = rewardAccount(userId);
  const points = rewardRules.get(contributionType)?.points ?? 0;
  account.points += points;
  account.contributions += 1;
  account.contributionStats[contributionType] = (account.contributionStats[contributionType] ?? 0) + 1;
  if (account.contributions >= 1 && !account.badges.includes("First Contributor")) account.badges.push("First Contributor");
  if (account.contributions >= 10 && !account.badges.includes("Community Champion")) account.badges.push("Community Champion");
  recordAudit(userId, "contribution.created", "contribution", contributionType, { contributionType, pointsAwarded: points });
  return points;
}

function recordAudit(actorUserId: string, action: string, entity: string, entityId: string, details: Record<string, unknown> = {}) {
  const actor = users.get(actorUserId);
  const log = {
    id: randomUUID(),
    actorUserId,
    actorEmail: actor?.email ?? "unknown",
    action,
    entity,
    entityId,
    createdAt: new Date().toISOString(),
    details
  };
  auditLogs.set(log.id, log);
  return log;
}

function sendPriceAlerts(report: { id: string; stationId: string; fuelType: string; price: number }) {
  const station = stations.get(report.stationId);
  if (!station) return;
  for (const subscription of notificationSubscriptions.values()) {
    const matchesPrice = (subscription.condition ?? "below") === "above"
      ? report.price >= subscription.maxPrice
      : report.price <= subscription.maxPrice;
    if (subscription.stationId !== report.stationId || subscription.fuelType.toLowerCase() !== report.fuelType.toLowerCase() || !matchesPrice) continue;
    const notification = {
      id: randomUUID(),
      userId: subscription.userId,
      title: "Fuel price alert",
      message: `${report.fuelType} at ${station.name} was reported at ${report.price.toFixed(2)}.`,
      stationId: station.id,
      priceReportId: report.id,
      createdAt: new Date().toISOString(),
      read: false
    };
    notifications.set(notification.id, notification);
    if (firebase && subscription.fcmToken) {
      void firebase.messaging.send({
        token: subscription.fcmToken,
        notification: { title: notification.title, body: notification.message },
        data: { stationId: station.id, priceReportId: report.id }
      }).catch(() => undefined);
    }
  }
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(b.latitude - a.latitude);
  const deltaLon = radians(b.longitude - a.longitude);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

async function routeDistance(origin: { latitude: number; longitude: number }, destination: { latitude: number; longitude: number }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return distanceKm(origin, destination) * 1.25;
  const response = await fetch(`https://routes.googleapis.com/directions/v2:computeRoutes?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-FieldMask": "routes.distanceMeters" },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
      destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
      travelMode: "DRIVE"
    })
  });
  if (!response.ok) throw new Error("Google Routes API request failed");
  const result = await response.json() as { routes?: Array<{ distanceMeters?: number }> };
  const distanceMeters = result.routes?.[0]?.distanceMeters;
  if (!distanceMeters) throw new Error("No route found for the requested locations");
  return distanceMeters / 1000;
}

function latestPrice(stationId: string, fuelType: string) {
  return [...priceReports.values()]
    .filter((report) => report.stationId === stationId && report.fuelType.toLowerCase() === fuelType.toLowerCase() && report.verified)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))[0]?.price;
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/", (_req, res) => res.json({ name: "PetroVision API", status: "ok", health: "/health", message: "Use the documented /api endpoints for API operations." }));

app.post("/api/auth/register", async (req, res) => {
  const input = validate(z.object({ email: z.email(), password: z.string().min(8), displayName: z.string().min(1).max(100) }), req.body);
  const email = input.email.toLowerCase();
  if ([...users.values()].some((user) => user.email === email)) return res.status(409).json({ error: "Email already registered" });
  const isBootstrapAdmin = process.env.ADMIN_EMAIL?.toLowerCase() === email;
  const user: User = { id: randomUUID(), email, displayName: input.displayName, role: isBootstrapAdmin ? "admin" : "user", passwordHash: await bcrypt.hash(input.password, 10), suspended: false, createdAt: new Date().toISOString() };
  users.set(user.id, user);
  rewardAccount(user.id);
  awardContribution(user.id, "signup");
  return res.status(201).json({ user: publicUser(user), ...issueTokens(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const input = validate(z.object({ email: z.email(), password: z.string().min(1) }), req.body);
  const user = [...users.values()].find((candidate) => candidate.email === input.email.toLowerCase());
  if (!user || user.suspended || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password" });
  return res.json({ user: publicUser(user), ...issueTokens(user) });
});

app.post("/api/auth/refresh", (req, res) => {
  const input = validate(z.object({ refreshToken: z.string() }), req.body);
  try {
    const payload = jwt.verify(input.refreshToken, jwtSecret) as JwtPayload;
    if (payload.kind !== "refresh" || typeof payload.sub !== "string" || typeof payload.sid !== "string" || !activeSessions.has(payload.sid)) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    const user = users.get(payload.sub);
    if (!user || user.suspended) return res.status(401).json({ error: "Account unavailable" });
    activeSessions.delete(payload.sid);
    return res.json(issueTokens(user));
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

app.post("/api/auth/logout", authenticate, (req, res) => {
  activeSessions.delete(req.auth!.sessionId);
  return res.status(204).end();
});

app.get("/api/users/me", authenticate, (req, res) => {
  const user = users.get(req.auth!.userId);
  return user ? res.json(publicUser(user)) : res.status(404).json({ error: "User not found" });
});

app.put("/api/users/me", authenticate, (req, res) => {
  const input = validate(z.object({ displayName: z.string().min(1).max(100).optional(), email: z.email().optional() }).refine((data) => Object.keys(data).length > 0), req.body);
  const user = users.get(req.auth!.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (input.email) user.email = input.email.toLowerCase();
  if (input.displayName) user.displayName = input.displayName;
  return res.json(publicUser(user));
});

app.get("/api/admin/users", authenticate, requireAdmin, (_req, res) => res.json([...users.values()].map((user) => ({
  ...publicUser(user),
  points: rewardAccount(user.id).points
}))));

app.put("/api/admin/users/:id/role", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ role: z.enum(["user", "admin"]), suspended: z.boolean().optional() }), req.body);
  const user = users.get(routeId(req));
  if (!user) return res.status(404).json({ error: "User not found" });
  const previousRole = user.role;
  user.role = input.role;
  if (input.suspended !== undefined) user.suspended = input.suspended;
  recordAudit(req.auth!.userId, "user.access-updated", "user", user.id, { previousRole, role: user.role, suspended: user.suspended });
  return res.json(publicUser(user));
});

app.get("/api/vehicles", authenticate, (req, res) => res.json([...vehicles.values()].filter((vehicle) => vehicle.ownerId === req.auth!.userId)));

app.post("/api/vehicles", authenticate, (req, res) => {
  const input = validate(z.object({ make: z.string().min(1), model: z.string().min(1), year: z.number().int().min(1886).max(new Date().getFullYear() + 1), fuelType: z.string().min(1), fuelEfficiency: z.number().positive() }), req.body);
  const vehicle = { id: randomUUID(), ownerId: req.auth!.userId, ...input };
  vehicles.set(vehicle.id, vehicle);
  awardContribution(req.auth!.userId, "new-vehicle");
  return res.status(201).json(vehicle);
});

app.put("/api/vehicles/:id", authenticate, (req, res) => {
  const input = validate(z.object({ make: z.string().min(1).optional(), model: z.string().min(1).optional(), year: z.number().int().min(1886).optional(), fuelType: z.string().min(1).optional(), fuelEfficiency: z.number().positive().optional() }).refine((data) => Object.keys(data).length > 0), req.body);
  const vehicle = vehicles.get(routeId(req));
  if (!vehicle || vehicle.ownerId !== req.auth!.userId) return res.status(404).json({ error: "Vehicle not found" });
  Object.assign(vehicle, input);
  return res.json(vehicle);
});

app.delete("/api/vehicles/:id", authenticate, (req, res) => {
  const vehicle = vehicles.get(routeId(req));
  if (!vehicle || vehicle.ownerId !== req.auth!.userId) return res.status(404).json({ error: "Vehicle not found" });
  vehicles.delete(vehicle.id);
  return res.status(204).end();
});

app.get("/api/stations/nearby", authenticate, (req, res) => {
  const input = validate(z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180), radius: z.coerce.number().positive().max(500).default(25) }), req.query);
  const origin = { latitude: input.lat, longitude: input.lng };
  const nearby = [...stations.values()].map((station) => ({ ...station, distanceKm: distanceKm(origin, station) }))
    .filter((station) => station.distanceKm <= input.radius).sort((a, b) => a.distanceKm - b.distanceKm);
  return res.json(nearby);
});

app.get("/api/stations", authenticate, (_req, res) => {
  return res.json([...stations.values()].map((station) => ({
    ...station,
    priceReports: [...priceReports.values()].filter((report) => report.stationId === station.id).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)),
    availabilityReports: [...availabilityReports.values()].filter((report) => report.stationId === station.id).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
  })));
});

app.get("/api/stations/:id", authenticate, (req, res) => {
  const station = stations.get(routeId(req));
  if (!station) return res.status(404).json({ error: "Station not found" });
  return res.json({ ...station, priceReports: [...priceReports.values()].filter((report) => report.stationId === station.id), availability: [...availabilityReports.values()].filter((report) => report.stationId === station.id) });
});

app.post("/api/stations", authenticate, (req, res) => {
  const input = validate(z.object({ name: z.string().min(1), address: z.string().min(1), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }), req.body);
  const station = { id: randomUUID(), ...input, verified: false, createdBy: req.auth!.userId };
  stations.set(station.id, station);
  const pointsAwarded = awardContribution(req.auth!.userId, "station-suggestion");
  recordAudit(req.auth!.userId, "station.suggested", "station", station.id, { stationId: station.id, pointsAwarded });
  return res.status(201).json(station);
});

app.post("/api/stations/:id/price-reports", authenticate, (req, res) => {
  if (!stations.has(routeId(req))) return res.status(404).json({ error: "Station not found" });
  const input = validate(z.object({ fuelType: z.string().min(1), price: z.number().positive() }), req.body);
  const report = { id: randomUUID(), stationId: routeId(req), userId: req.auth!.userId, ...input, reportedAt: new Date().toISOString(), verified: false, status: "pending" as const };
  priceReports.set(report.id, report);
  const pointsAwarded = awardContribution(req.auth!.userId, "price-report");
  recordAudit(req.auth!.userId, "price-report.submitted", "price-report", report.id, { stationId: report.stationId, status: report.status, pointsAwarded });
  sendPriceAlerts(report);
  return res.status(201).json(report);
});

app.get("/api/stations/:id/price-reports", authenticate, (req, res) => {
  return res.json([...priceReports.values()].filter((report) => report.stationId === routeId(req)).sort((a, b) => b.reportedAt.localeCompare(a.reportedAt)));
});

app.put("/api/price-reports/:id/verify", authenticate, (req, res) => {
  const report = priceReports.get(routeId(req));
  if (!report) return res.status(404).json({ error: "Price report not found" });
  if (req.auth!.role !== "admin" && report.userId === req.auth!.userId) return res.status(403).json({ error: "Users cannot verify their own reports" });
  report.verified = validate(z.object({ verified: z.boolean() }), req.body).verified;
  report.status = report.verified ? "approved" : "rejected";
  recordAudit(req.auth!.userId, report.verified ? "price-report.approved" : "price-report.rejected", "price-report", report.id, { stationId: report.stationId, status: report.status });
  return res.json(report);
});

app.post("/api/stations/:id/availability", authenticate, (req, res) => {
  if (!stations.has(routeId(req))) return res.status(404).json({ error: "Station not found" });
  const input = validate(z.object({
    fuelType: z.string().min(1),
    available: z.boolean().optional(),
    status: z.enum(["In Stock", "Low Stock", "Out of Stock"]).optional()
  }).refine((data) => data.available !== undefined || data.status !== undefined), req.body);
  const report = {
    id: randomUUID(),
    stationId: routeId(req),
    userId: req.auth!.userId,
    fuelType: input.fuelType,
    available: input.status ? input.status !== "Out of Stock" : input.available!,
    ...(input.status ? { status: input.status } : {}),
    reportedAt: new Date().toISOString()
  };
  availabilityReports.set(report.id, report);
  const pointsAwarded = awardContribution(req.auth!.userId, "availability-report");
  recordAudit(req.auth!.userId, "availability-report.submitted", "availability-report", report.id, { stationId: report.stationId, pointsAwarded });
  return res.status(201).json(report);
});

const estimateSchema = z.object({ origin: pointSchema, destination: pointSchema, vehicleId: z.string(), fuelType: z.string().optional() });

async function estimate(req: Request, res: Response) {
  const input = validate(estimateSchema, req.body);
  const vehicle = vehicles.get(input.vehicleId);
  if (!vehicle || vehicle.ownerId !== req.auth!.userId) return res.status(404).json({ error: "Vehicle not found" });
  const distance = await routeDistance(input.origin, input.destination);
  const fuelType = input.fuelType ?? vehicle.fuelType;
  const prices = [...stations.keys()].map((stationId) => latestPrice(stationId, fuelType)).filter((price): price is number => price !== undefined);
  const avgPrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : 60;
  const litres = distance / vehicle.fuelEfficiency;
  return res.json({ distanceKm: Math.round(distance * 100) / 100, fuelType, fuelLitres: Math.round(litres * 100) / 100, pricePerLitre: avgPrice, estimatedFuelCost: Math.round(litres * avgPrice * 100) / 100, source: process.env.GOOGLE_MAPS_API_KEY ? "google-routes" : "straight-line-estimate" });
}

app.post("/api/trips/estimate", authenticate, (req, res, next) => { void estimate(req, res).catch(next); });

app.post("/api/trips", authenticate, async (req, res) => {
  const input = validate(estimateSchema, req.body);
  const vehicle = vehicles.get(input.vehicleId);
  if (!vehicle || vehicle.ownerId !== req.auth!.userId) return res.status(404).json({ error: "Vehicle not found" });
  const distance = await routeDistance(input.origin, input.destination);
  const fuelType = input.fuelType ?? vehicle.fuelType;
  const fuelPrices = [...stations.keys()].map((stationId) => latestPrice(stationId, fuelType)).filter((price): price is number => price !== undefined);
  const avgPrice = fuelPrices.length ? fuelPrices.reduce((sum, price) => sum + price, 0) / fuelPrices.length : 60;
  const trip = { id: randomUUID(), userId: req.auth!.userId, vehicleId: vehicle.id, origin: input.origin, destination: input.destination, distanceKm: Math.round(distance * 100) / 100, estimatedFuelCost: Math.round(distance / vehicle.fuelEfficiency * avgPrice * 100) / 100, createdAt: new Date().toISOString() };
  trips.set(trip.id, trip);
  awardContribution(req.auth!.userId, "trip-log");
  return res.status(201).json(trip);
});

app.get("/api/trips", authenticate, (req, res) => res.json([...trips.values()].filter((trip) => trip.userId === req.auth!.userId)));

app.get("/api/trips/:id", authenticate, (req, res) => {
  const trip = trips.get(routeId(req));
  if (!trip || trip.userId !== req.auth!.userId) return res.status(404).json({ error: "Trip not found" });
  return res.json(trip);
});

app.post("/api/refuels", authenticate, (req, res) => {
  const input = validate(z.object({ stationId: z.string().optional(), amountLitres: z.number().positive(), totalCost: z.number().positive(), fuelType: z.string().min(1), occurredAt: z.iso.datetime().optional() }), req.body);
  if (input.stationId && !stations.has(input.stationId)) return res.status(404).json({ error: "Station not found" });
  const refuel = { id: randomUUID(), userId: req.auth!.userId, ...input, occurredAt: input.occurredAt ?? new Date().toISOString() };
  refuels.set(refuel.id, refuel);
  awardContribution(req.auth!.userId, "refuel-log");
  return res.status(201).json(refuel);
});

app.get("/api/refuels", authenticate, (req, res) => {
  const ownRefuels = [...refuels.values()].filter((refuel) => refuel.userId === req.auth!.userId);
  const month = new Date().toISOString().slice(0, 7);
  const monthlySpend = ownRefuels.filter((refuel) => refuel.occurredAt.startsWith(month)).reduce((sum, refuel) => sum + refuel.totalCost, 0);
  return res.json({ records: ownRefuels.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), monthlySpend: Math.round(monthlySpend * 100) / 100, currency: "USD" });
});

app.get("/api/rewards/me", authenticate, (req, res) => res.json(rewardAccount(req.auth!.userId)));
app.get("/api/rewards/rules", authenticate, (_req, res) => res.json([...rewardRules.values()]));

app.get("/api/rewards/leaderboard", authenticate, (_req, res) => {
  const leaderboard = [...rewardAccounts.values()]
    .map((account) => {
      const user = users.get(account.userId);
      return user ? { user: publicUser(user), points: account.points, contributions: account.contributions } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.points - a.points);
  return res.json(leaderboard);
});

app.get("/api/rewards/activity", authenticate, (req, res) => {
  const activity = [...auditLogs.values()]
    .filter((log) => log.actorUserId === req.auth!.userId && log.action === "contribution.created" && Number(log.details.pointsAwarded) > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((log) => ({ id: log.id, reason: log.details.contributionType, amount: log.details.pointsAwarded, date: log.createdAt }));
  return res.json(activity);
});

app.get("/api/rewards/catalog", authenticate, (_req, res) => {
  return res.json([...rewards.values()].filter((reward) => reward.active));
});

app.post("/api/rewards/redeem", authenticate, (req, res) => {
  const input = validate(z.object({ rewardId: z.string().min(1) }), req.body);
  const reward = rewards.get(input.rewardId);
  if (!reward || !reward.active) return res.status(404).json({ error: "Reward not found" });
  const account = rewardAccount(req.auth!.userId);
  if (account.points < reward.pointsCost) return res.status(400).json({ error: "Not enough points", pointsRequired: reward.pointsCost, pointsAvailable: account.points });
  account.points -= reward.pointsCost;
  const redemption = { id: randomUUID(), userId: req.auth!.userId, rewardId: reward.id, pointsSpent: reward.pointsCost, redeemedAt: new Date().toISOString() };
  redemptions.set(redemption.id, redemption);
  return res.status(201).json({ redemption, reward, pointsRemaining: account.points });
});

app.get("/api/notifications", authenticate, (req, res) => {
  const ownNotifications = [...notifications.values()].filter((notification) => notification.userId === req.auth!.userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json({ notifications: ownNotifications, unreadCount: ownNotifications.filter((notification) => !notification.read).length });
});

app.post("/api/notifications/subscribe", authenticate, (req, res) => {
  const input = validate(z.object({
    stationId: z.string().min(1),
    fuelType: z.string().min(1),
    maxPrice: z.number().positive(),
    condition: z.enum(["below", "above"]).default("below"),
    fcmToken: z.string().min(1).optional()
  }), req.body);
  if (!stations.has(input.stationId)) return res.status(404).json({ error: "Station not found" });
  const existing = [...notificationSubscriptions.values()].find((subscription) =>
    subscription.userId === req.auth!.userId
    && subscription.stationId === input.stationId
    && subscription.fuelType.toLowerCase() === input.fuelType.toLowerCase()
    && (subscription.condition ?? "below") === input.condition
  );
  const subscription = { id: existing?.id ?? randomUUID(), userId: req.auth!.userId, ...input };
  notificationSubscriptions.set(subscription.id, subscription);
  if (!existing) awardContribution(req.auth!.userId, "new-alert");
  const { fcmToken: _fcmToken, ...safeSubscription } = subscription;
  return res.status(existing ? 200 : 201).json(safeSubscription);
});

app.get("/api/notifications/subscriptions", authenticate, (req, res) => {
  return res.json([...notificationSubscriptions.values()]
    .filter((subscription) => subscription.userId === req.auth!.userId)
    .map(({ fcmToken: _fcmToken, ...subscription }) => subscription));
});

app.delete("/api/notifications/subscriptions/:id", authenticate, (req, res) => {
  const subscription = notificationSubscriptions.get(routeId(req));
  if (!subscription || subscription.userId !== req.auth!.userId) return res.status(404).json({ error: "Alert not found" });
  notificationSubscriptions.delete(subscription.id);
  return res.status(204).end();
});

app.get("/api/admin/dashboard", authenticate, requireAdmin, (_req, res) => {
  const topContributors = [...rewardAccounts.values()]
    .filter((account) => account.contributions > 0)
    .sort((a, b) => b.contributions - a.contributions)
    .slice(0, 10)
    .map((account) => ({ user: publicUser(users.get(account.userId)!), contributions: account.contributions, points: account.points }));
  const reports = [...priceReports.values()];
  return res.json({
    activeStations: [...stations.values()].filter((station) => station.verified).length,
    pendingReports: reports.filter((report) => report.status === "pending").length,
    flaggedReports: reports.filter((report) => report.status === "rejected").length,
    topContributors
  });
});

app.get("/api/admin/reports", authenticate, requireAdmin, (req, res) => {
  const filters = validate(z.object({ status: z.enum(["pending", "approved", "rejected"]).optional(), stationId: z.string().optional() }), req.query);
  const result = [...priceReports.values()]
    .filter((report) => !filters.status || report.status === filters.status)
    .filter((report) => !filters.stationId || report.stationId === filters.stationId)
    .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
    .map((report) => ({ ...report, station: stations.get(report.stationId), contributor: users.has(report.userId) ? publicUser(users.get(report.userId)!) : undefined }));
  return res.json(result);
});

app.put("/api/admin/reports/:id/status", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ status: z.enum(["approved", "rejected"]) }), req.body);
  const report = priceReports.get(routeId(req));
  if (!report) return res.status(404).json({ error: "Price report not found" });
  report.status = input.status;
  report.verified = input.status === "approved";
  recordAudit(req.auth!.userId, `price-report.${input.status}`, "price-report", report.id, { stationId: report.stationId, status: report.status });
  return res.json(report);
});

app.get("/api/admin/station-logs", authenticate, requireAdmin, (req, res) => {
  const filters = validate(z.object({ stationId: z.string().optional() }), req.query);
  const logs = [...auditLogs.values()]
    .filter((log) => !filters.stationId || log.entityId === filters.stationId || log.details.stationId === filters.stationId)
    .filter((log) => log.entity === "station" || log.entity === "price-report" || log.entity === "availability-report")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return res.json(logs);
});

app.get("/api/admin/audit-logs", authenticate, requireAdmin, (req, res) => {
  const filters = validate(z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query);
  const logs = [...auditLogs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, filters.limit);
  return res.json(logs);
});

app.post("/api/admin/reward-adjustments", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ userId: z.string().min(1), amount: z.number().int().refine((amount) => amount !== 0), reason: z.string().min(1).max(500) }), req.body);
  const user = users.get(input.userId);
  if (!user || user.role === "admin") return res.status(404).json({ error: "User not found" });
  const account = rewardAccount(user.id);
  account.points = Math.max(0, account.points + input.amount);
  recordAudit(req.auth!.userId, "reward.points-adjusted", "user", user.id, { amount: input.amount, reason: input.reason });
  return res.json({ user: publicUser(user), points: account.points });
});

app.put("/api/admin/stations/:id", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({
    name: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    verified: z.boolean().optional()
  }).refine((data) => Object.keys(data).length > 0), req.body);
  const station = stations.get(routeId(req));
  if (!station) return res.status(404).json({ error: "Station not found" });
  Object.assign(station, input);
  recordAudit(req.auth!.userId, "station.updated", "station", station.id, input);
  return res.json(station);
});

app.delete("/api/admin/stations/:id", authenticate, requireAdmin, (req, res) => {
  const station = stations.get(routeId(req));
  if (!station) return res.status(404).json({ error: "Station not found" });
  stations.delete(station.id);
  for (const [id, report] of priceReports) if (report.stationId === station.id) priceReports.delete(id);
  for (const [id, report] of availabilityReports) if (report.stationId === station.id) availabilityReports.delete(id);
  for (const [id, subscription] of notificationSubscriptions) if (subscription.stationId === station.id) notificationSubscriptions.delete(id);
  recordAudit(req.auth!.userId, "station.deleted", "station", station.id, { name: station.name });
  return res.status(204).end();
});

app.get("/api/admin/rewards", authenticate, requireAdmin, (_req, res) => res.json([...rewards.values()]));

app.post("/api/admin/rewards", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ name: z.string().min(1), description: z.string().min(1), pointsCost: z.number().int().positive(), active: z.boolean().default(true) }), req.body);
  const reward = { id: randomUUID(), ...input };
  rewards.set(reward.id, reward);
  recordAudit(req.auth!.userId, "reward.created", "reward", reward.id, { pointsCost: reward.pointsCost });
  return res.status(201).json(reward);
});

app.put("/api/admin/rewards/:id", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ name: z.string().min(1).optional(), description: z.string().min(1).optional(), pointsCost: z.number().int().positive().optional(), active: z.boolean().optional() }).refine((data) => Object.keys(data).length > 0), req.body);
  const reward = rewards.get(routeId(req));
  if (!reward) return res.status(404).json({ error: "Reward not found" });
  Object.assign(reward, input);
  recordAudit(req.auth!.userId, "reward.updated", "reward", reward.id, input);
  return res.json(reward);
});

app.delete("/api/admin/rewards/:id", authenticate, requireAdmin, (req, res) => {
  const reward = rewards.get(routeId(req));
  if (!reward) return res.status(404).json({ error: "Reward not found" });
  rewards.delete(reward.id);
  recordAudit(req.auth!.userId, "reward.deleted", "reward", reward.id);
  return res.status(204).end();
});

app.get("/api/admin/rewards/rules", authenticate, requireAdmin, (_req, res) => res.json([...rewardRules.values()]));

app.post("/api/admin/rewards/rules", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), label: z.string().min(1), points: z.number().int().nonnegative() }), req.body);
  if (rewardRules.has(input.id)) return res.status(409).json({ error: "Reward rule already exists" });
  rewardRules.set(input.id, input);
  recordAudit(req.auth!.userId, "reward-rule.created", "reward-rule", input.id, { points: input.points });
  return res.status(201).json(input);
});

app.put("/api/admin/rewards/rules/:id", authenticate, requireAdmin, (req, res) => {
  const input = validate(z.object({ label: z.string().min(1).optional(), points: z.number().int().nonnegative().optional() }).refine((data) => Object.keys(data).length > 0), req.body);
  const rule = rewardRules.get(routeId(req));
  if (!rule) return res.status(404).json({ error: "Reward rule not found" });
  Object.assign(rule, input);
  recordAudit(req.auth!.userId, "reward-rule.updated", "reward-rule", rule.id, input);
  return res.json(rule);
});

app.delete("/api/admin/rewards/rules/:id", authenticate, requireAdmin, (req, res) => {
  const rule = rewardRules.get(routeId(req));
  if (!rule) return res.status(404).json({ error: "Reward rule not found" });
  rewardRules.delete(rule.id);
  recordAudit(req.auth!.userId, "reward-rule.deleted", "reward-rule", rule.id);
  return res.status(204).end();
});

app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) return res.status(400).json({ error: "Validation failed", details: error.issues });
  const message = error instanceof Error ? error.message : "Internal server error";
  const status = message.startsWith("No route found") ? 422 : 500;
  return res.status(status).json({ error: status === 500 ? "Internal server error" : message });
};
app.use(errorHandler);

export { app };
export default app;