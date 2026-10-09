import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import request from "supertest";
import { app } from "../src/app.js";
import { resetStore, users } from "../src/store.js";

afterEach(resetStore);

test("health endpoint reports ready", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("API root returns service information", async () => {
  const response = await request(app).get("/");
  assert.equal(response.status, 200);
  assert.equal(response.body.name, "PetroVision API");
  assert.equal(response.body.health, "/health");
});

test("server serves the UI assets and allows configured local Live Server origins", async () => {
  const page = await request(app).get("/index.html");
  assert.equal(page.status, 200);
  assert.match(page.text, /js\/api\.js/);
  const script = await request(app).get("/js/api.js");
  assert.equal(script.status, 200);
  const preflight = await request(app).options("/api/auth/login").set("Origin", "http://localhost:5500");
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers["access-control-allow-origin"], "http://localhost:5500");
});

test("registration returns a bearer token and profile without password hash", async () => {
  const response = await request(app).post("/api/auth/register").send({ email: "driver@example.com", password: "strong-password", displayName: "Driver" });
  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, "driver@example.com");
  assert.equal("passwordHash" in response.body.user, false);
  const profile = await request(app).get("/api/users/me").set("Authorization", `Bearer ${response.body.accessToken}`);
  assert.equal(profile.status, 200);
  assert.equal(profile.body.displayName, "Driver");
  const rewards = await request(app).get("/api/rewards/me").set("Authorization", `Bearer ${response.body.accessToken}`);
  assert.equal(rewards.body.points, 5);
});

test("UI-facing station and reward APIs return a driver's updated records", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "stations@example.com", password: "strong-password", displayName: "Station Driver" });
  const headers = { Authorization: `Bearer ${registration.body.accessToken}` };
  await request(app).post("/api/stations/station-demo/price-reports").set(headers).send({ fuelType: "Diesel", price: 58 }).expect(201);
  await request(app).post("/api/stations/station-demo/availability").set(headers).send({ fuelType: "Diesel", status: "Low Stock" }).expect(201);

  const stations = await request(app).get("/api/stations").set(headers);
  assert.equal(stations.status, 200);
  assert.equal(stations.body[0].priceReports[0].price, 58);
  assert.equal(stations.body[0].availabilityReports[0].status, "Low Stock");
  const activity = await request(app).get("/api/rewards/activity").set(headers);
  assert.deepEqual(activity.body.map((entry: { reason: string }) => entry.reason).sort(), ["availability-report", "price-report", "signup"]);
});

test("vehicle records are private to their owner", async () => {
  const first = await request(app).post("/api/auth/register").send({ email: "first@example.com", password: "strong-password", displayName: "First" });
  const second = await request(app).post("/api/auth/register").send({ email: "second@example.com", password: "strong-password", displayName: "Second" });
  const created = await request(app).post("/api/vehicles").set("Authorization", `Bearer ${first.body.accessToken}`).send({ make: "Toyota", model: "Prius", year: 2024, fuelType: "gasoline", fuelEfficiency: 20 });
  assert.equal(created.status, 201);
  const list = await request(app).get("/api/vehicles").set("Authorization", `Bearer ${second.body.accessToken}`);
  assert.deepEqual(list.body, []);
});

test("logout revokes the active access token", async () => {
  const login = await request(app).post("/api/auth/register").send({ email: "logout@example.com", password: "strong-password", displayName: "Driver" });
  const token = login.body.accessToken as string;
  assert.equal((await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${token}`)).status, 204);
  assert.equal((await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`)).status, 401);
});

test("authorization reflects current role and suspension status", async () => {
  const registration = await request(app).post("/api/auth/register").send({ email: "roles@example.com", password: "strong-password", displayName: "Driver" });
  const token = registration.body.accessToken as string;
  const user = users.get(registration.body.user.id)!;
  user.role = "admin";
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`)).status, 200);
  user.role = "user";
  assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`)).status, 403);
  user.suspended = true;
  assert.equal((await request(app).get("/api/users/me").set("Authorization", `Bearer ${token}`)).status, 401);
});

test("configured bootstrap email receives admin access", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "owner@example.com";
  try {
    const registration = await request(app).post("/api/auth/register").send({ email: "owner@example.com", password: "strong-password", displayName: "Owner" });
    assert.equal(registration.body.user.role, "admin");
    assert.equal((await request(app).get("/api/admin/users").set("Authorization", `Bearer ${registration.body.accessToken}`)).status, 200);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});

test("users can verify another driver's report but not their own", async () => {
  const reporter = await request(app).post("/api/auth/register").send({ email: "reporter@example.com", password: "strong-password", displayName: "Reporter" });
  const reviewer = await request(app).post("/api/auth/register").send({ email: "reviewer@example.com", password: "strong-password", displayName: "Reviewer" });
  const report = await request(app).post("/api/stations/station-demo/price-reports")
    .set("Authorization", `Bearer ${reporter.body.accessToken}`)
    .send({ fuelType: "gasoline", price: 1.45 });
  const ownReview = await request(app).put(`/api/price-reports/${report.body.id}/verify`)
    .set("Authorization", `Bearer ${reporter.body.accessToken}`)
    .send({ verified: true });
  assert.equal(ownReview.status, 403);
  const otherReview = await request(app).put(`/api/price-reports/${report.body.id}/verify`)
    .set("Authorization", `Bearer ${reviewer.body.accessToken}`)
    .send({ verified: true });
  assert.equal(otherReview.status, 200);
  assert.equal(otherReview.body.verified, true);
});

test("price contributions earn points, trigger matching alerts, and can be redeemed", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "rewards-admin@example.com";
  try {
    const admin = await request(app).post("/api/auth/register").send({ email: "rewards-admin@example.com", password: "strong-password", displayName: "Admin" });
    const adminHeaders = { Authorization: `Bearer ${admin.body.accessToken}` };
    await request(app).put("/api/admin/rewards/rules/price-report").set(adminHeaders).send({ points: 100 }).expect(200);

    const driver = await request(app).post("/api/auth/register").send({ email: "rewards-driver@example.com", password: "strong-password", displayName: "Driver" });
    const headers = { Authorization: `Bearer ${driver.body.accessToken}` };
    const subscription = await request(app).post("/api/notifications/subscribe").set(headers).send({ stationId: "station-demo", fuelType: "gasoline", maxPrice: 1.5, fcmToken: "test-token" });
    assert.equal(subscription.status, 201);
    assert.equal("fcmToken" in subscription.body, false);

    await request(app).post("/api/stations/station-demo/price-reports").set(headers).send({ fuelType: "gasoline", price: 1.45 }).expect(201);
    const account = await request(app).get("/api/rewards/me").set(headers);
    assert.equal(account.body.points, 107);
    assert.equal(account.body.contributionStats["price-report"], 1);

    const inbox = await request(app).get("/api/notifications").set(headers);
    assert.equal(inbox.body.notifications.length, 1);
    assert.equal(inbox.body.unreadCount, 1);

    const redemption = await request(app).post("/api/rewards/redeem").set(headers).send({ rewardId: "coffee-voucher" });
    assert.equal(redemption.status, 201);
    assert.equal(redemption.body.pointsRemaining, 7);
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});

test("admin moderation updates dashboard, station logs, and audit trail", async () => {
  const previousAdminEmail = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "moderator@example.com";
  try {
    const admin = await request(app).post("/api/auth/register").send({ email: "moderator@example.com", password: "strong-password", displayName: "Moderator" });
    const driver = await request(app).post("/api/auth/register").send({ email: "moderated-driver@example.com", password: "strong-password", displayName: "Driver" });
    const userHeaders = { Authorization: `Bearer ${driver.body.accessToken}` };
    const adminHeaders = { Authorization: `Bearer ${admin.body.accessToken}` };
    const report = await request(app).post("/api/stations/station-demo/price-reports").set(userHeaders).send({ fuelType: "diesel", price: 1.6 });

    const pending = await request(app).get("/api/admin/reports?status=pending&stationId=station-demo").set(adminHeaders);
    assert.equal(pending.body.length, 1);
    await request(app).put(`/api/admin/reports/${report.body.id}/status`).set(adminHeaders).send({ status: "rejected" }).expect(200);

    const dashboard = await request(app).get("/api/admin/dashboard").set(adminHeaders);
    assert.equal(dashboard.body.pendingReports, 0);
    assert.equal(dashboard.body.flaggedReports, 1);
    assert.equal(dashboard.body.topContributors[0].user.email, "moderated-driver@example.com");
    const stationLogs = await request(app).get("/api/admin/station-logs?stationId=station-demo").set(adminHeaders);
    assert.ok(stationLogs.body.length >= 2);
    const audit = await request(app).get("/api/admin/audit-logs").set(adminHeaders);
    assert.ok(audit.body.some((entry: { action: string }) => entry.action === "price-report.rejected"));
  } finally {
    if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previousAdminEmail;
  }
});