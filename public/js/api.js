const CITIES = {
  "Manila": { lat: 14.5995, lng: 120.9842 },
  "Quezon City": { lat: 14.6760, lng: 121.0437 },
  "Makati": { lat: 14.5547, lng: 121.0244 },
  "Baguio City": { lat: 16.4023, lng: 120.5960 },
  "Angeles City": { lat: 15.1449, lng: 120.5887 },
  "Batangas City": { lat: 13.7565, lng: 121.0583 },
  "Tagaytay": { lat: 14.1153, lng: 120.9621 },
  "Naga City": { lat: 13.6218, lng: 123.1948 },
  "Legazpi City": { lat: 13.1391, lng: 123.7438 },
  "Iloilo City": { lat: 10.7202, lng: 122.5621 },
  "Bacolod City": { lat: 10.6713, lng: 122.9511 },
  "Cebu City": { lat: 10.3157, lng: 123.8854 },
  "Tacloban City": { lat: 11.2447, lng: 125.0037 },
  "Cagayan de Oro": { lat: 8.4542, lng: 124.6319 },
  "Zamboanga City": { lat: 6.9214, lng: 122.0790 },
  "Davao City": { lat: 7.1907, lng: 125.4553 },
  "General Santos": { lat: 6.1164, lng: 125.1716 },
};
const FUEL_TYPES = ["Diesel", "Gasoline (RON 95)", "Gasoline (RON 97)"];
const VEHICLE_TYPES = ["Motorcycle", "Sedan", "Hatchback", "SUV", "Van", "Pickup Truck"];
const DEFAULT_EFFICIENCY = { Motorcycle: 35, Sedan: 12, Hatchback: 14, SUV: 9, Van: 8, "Pickup Truck": 10 };
const POINTS = { signupBonus: 5, newStation: 10, availabilityUpdate: 5, refuelLog: 5, tripLog: 5, newVehicle: 5, newAlert: 2 };
const BADGES = [
  { min: 0, name: "Newbie", color: "#94A3B8" },
  { min: 100, name: "Contributor", color: "#3B82F6" },
  { min: 300, name: "Trusted Reporter", color: "#2F9E6B" },
  { min: 700, name: "Fuel Hero", color: "#F2732B" },
  { min: 1500, name: "Legend", color: "#A855F7" },
];
const configuredApiUrl = window.PETROVISION_API_URL?.trim();
const API_BASE = (configuredApiUrl || (
  location.protocol === "file:" || location.port === "5500" || location.port === "5501"
    ? "http://localhost:3000/api"
    : `${location.origin}/api`
)).replace(/\/$/, "");
const SESSION_KEY = "petrovision-api-session";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function getBadge(points) {
  return BADGES.reduce((current, tier) => points >= tier.min ? tier : current, BADGES[0]);
}

function haversineKm(a, b) {
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function roadDistanceKm(cityA, cityB) {
  return haversineKm(CITIES[cityA], CITIES[cityB]) * 1.25;
}

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch (error) {
    console.error("Could not read the saved PetroVision session.", error);
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}
function setSession(user, accessToken, refreshToken) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user, accessToken, refreshToken }));
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
function requireAuth() {
  const session = getSession();
  if (!session?.accessToken || !session?.user) {
    window.location.href = "index.html";
    throw new Error("Not logged in — redirecting.");
  }
  return session.user.email;
}
function requireAdmin() {
  const email = requireAuth();
  if (getSession().user.role !== "admin") {
    window.location.href = "dashboard.html";
    throw new Error("Admin access required.");
  }
  return email;
}
function paintNavUser() {
  const element = document.getElementById("nav-username");
  const name = getSession()?.user?.displayName;
  if (element && name) element.textContent = name.split(/\s+/)[0];
}

async function apiRequest(path, options = {}, allowRefresh = true) {
  const session = getSession();
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (session?.accessToken) headers.set("Authorization", `Bearer ${session.accessToken}`);
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error(`Unable to reach the PetroVision API at ${API_BASE}. Start the backend and check the API URL.`, { cause: error });
  }
  if (response.status === 401 && allowRefresh && session?.refreshToken) {
    let refresh;
    try {
      const refreshResponse = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: session.refreshToken })
      });
      refresh = refreshResponse.ok ? await refreshResponse.json() : null;
    } catch (error) {
      console.error("Could not refresh the PetroVision session.", error);
    }
    if (refresh?.accessToken && refresh?.refreshToken) {
      setSession(session.user, refresh.accessToken, refresh.refreshToken);
      return apiRequest(path, options, false);
    }
    clearSession();
    window.location.href = "index.html";
  }
  if (!response.ok) {
    let message = `API request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch (error) {
      console.error("The API returned a non-JSON error response.", error);
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  return response.json();
}
function apiGet(path) { return apiRequest(path); }
function apiPost(path, body) { return apiRequest(path, { method: "POST", body: JSON.stringify(body) }); }
function apiPut(path, body) { return apiRequest(path, { method: "PUT", body: JSON.stringify(body) }); }
function apiDelete(path) { return apiRequest(path, { method: "DELETE" }); }

async function signIn(email, password) {
  const result = await apiPost("/auth/login", { email, password });
  setSession(result.user, result.accessToken, result.refreshToken);
  return result.user;
}
async function signUp(displayName, email, password) {
  const result = await apiPost("/auth/register", { displayName, email, password });
  setSession(result.user, result.accessToken, result.refreshToken);
  return result.user;
}
async function signOut() {
  try {
    await apiPost("/auth/logout", {});
  } finally {
    clearSession();
  }
}
async function getCurrentUser() {
  const user = await apiGet("/users/me");
  const session = getSession();
  if (session) setSession(user, session.accessToken, session.refreshToken);
  return user;
}

async function getVehicles() {
  return (await apiGet("/vehicles")).map(vehicle => ({
    ...vehicle,
    name: vehicle.make,
    type: vehicle.model,
    efficiency: vehicle.fuelEfficiency
  }));
}
async function addVehicle(fields) {
  return apiPost("/vehicles", {
    make: fields.name,
    model: fields.type,
    year: new Date().getFullYear(),
    fuelType: fields.fuelType,
    fuelEfficiency: Number(fields.efficiency)
  });
}
async function deleteVehicle(id) { return apiDelete(`/vehicles/${encodeURIComponent(id)}`); }

async function getStations() {
  const records = await apiGet("/stations");
  return records.flatMap(station => {
    const reports = station.priceReports?.length ? station.priceReports : [null];
    return reports.map(report => {
      const availability = station.availabilityReports?.find(item => item.fuelType === report?.fuelType)
        || station.availabilityReports?.[0];
      return ({
      id: station.id,
      name: station.name,
      city: station.address,
      address: station.address,
      lat: station.latitude,
      lng: station.longitude,
      fuelType: report?.fuelType || "",
      price: report?.price ?? 0,
      availability: availability?.status || (availability ? (availability.available ? "In Stock" : "Out of Stock") : "Unknown"),
      submittedBy: report?.userId || station.createdBy,
      date: report?.reportedAt || station.createdAt || "",
      verified: report?.verified ?? station.verified,
      approvalStatus: report?.status ? report.status[0].toUpperCase() + report.status.slice(1) : (station.verified ? "Approved" : "Pending"),
      reportId: report?.id,
      priceReports: station.priceReports || [],
      availabilityReports: station.availabilityReports || []
      });
    });
  });
}
async function addStation(fields) {
  const station = await apiPost("/stations", {
    name: fields.name,
    address: fields.city,
    latitude: Number(fields.lat),
    longitude: Number(fields.lng)
  });
  await apiPost(`/stations/${encodeURIComponent(station.id)}/price-reports`, {
    fuelType: fields.fuelType,
    price: Number(fields.price)
  });
  return station;
}
async function updateAvailability(stationId, status, fuelType) {
  const station = (await apiGet(`/stations/${encodeURIComponent(stationId)}`));
  const selectedFuel = fuelType || station.priceReports?.[0]?.fuelType || FUEL_TYPES[0];
  return apiPost(`/stations/${encodeURIComponent(stationId)}/availability`, { fuelType: selectedFuel, status });
}
function averagePrice(fuelType, stations) {
  const prices = stations.filter(station => station.fuelType === fuelType && station.price > 0).map(station => Number(station.price));
  return prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;
}

async function estimateTrip(from, to, vehicleId) {
  const origin = CITIES[from];
  const destination = CITIES[to];
  if (!origin || !destination) throw new Error("Choose valid trip locations.");
  return apiPost("/trips/estimate", {
    vehicleId,
    origin: { latitude: origin.lat, longitude: origin.lng },
    destination: { latitude: destination.lat, longitude: destination.lng }
  });
}
async function addHistoryEntry(entry, vehicleId, stationId) {
  if (entry.type === "Refuel") {
    const vehicle = (await getVehicles()).find(item => item.id === vehicleId);
    if (!vehicle) throw new Error("Choose a vehicle before logging a refuel.");
    return apiPost("/refuels", {
      amountLitres: Number(entry.liters),
      totalCost: Number(entry.cost),
      fuelType: vehicle.fuelType,
      ...(stationId ? { stationId } : {})
    });
  }
  const vehicle = (await getVehicles()).find(item => item.id === vehicleId);
  const origin = CITIES[entry.from];
  const destination = CITIES[entry.to];
  if (!vehicle || !origin || !destination) throw new Error("The selected vehicle or trip locations are unavailable.");
  return apiPost("/trips", { vehicleId, origin: { latitude: origin.lat, longitude: origin.lng }, destination: { latitude: destination.lat, longitude: destination.lng } });
}
async function getHistory() {
  const [trips, refuels, vehicles] = await Promise.all([
    apiGet("/trips"),
    apiGet("/refuels"),
    getVehicles()
  ]);
  const nearestCityName = point => Object.entries(CITIES).sort((a, b) =>
    haversineKm(point, a[1]) - haversineKm(point, b[1])
  )[0]?.[0] || "Trip";
  const tripEntries = trips.map(trip => {
    const vehicle = vehicles.find(item => item.id === trip.vehicleId);
    return {
      id: trip.id,
      type: "Trip",
      date: trip.createdAt,
      vehicleId: trip.vehicleId,
      from: nearestCityName({ lat: trip.origin.latitude, lng: trip.origin.longitude }),
      to: nearestCityName({ lat: trip.destination.latitude, lng: trip.destination.longitude }),
      liters: vehicle ? trip.distanceKm / vehicle.efficiency : 0,
      cost: trip.estimatedFuelCost,
      distanceKm: trip.distanceKm
    };
  });
  const refuelEntries = refuels.records.map(refuel => ({
    id: refuel.id,
    type: "Refuel",
    date: refuel.occurredAt,
    vehicleId: vehicles.find(vehicle => vehicle.fuelType === refuel.fuelType)?.id,
    liters: refuel.amountLitres,
    cost: refuel.totalCost,
    notes: refuel.fuelType,
    stationId: refuel.stationId
  }));
  return [...tripEntries, ...refuelEntries].sort((a, b) => b.date.localeCompare(a.date));
}

async function getAlerts() {
  return apiGet("/notifications/subscriptions");
}
async function addAlert(fields) {
  return apiPost("/notifications/subscribe", {
    stationId: fields.stationId,
    fuelType: fields.fuelType,
    maxPrice: Number(fields.threshold),
    condition: fields.condition
  });
}
async function deleteAlert(id) { return apiDelete(`/notifications/subscriptions/${encodeURIComponent(id)}`); }
function checkAlert(alert, stations) {
  return stations.find(station => station.id === alert.stationId && station.fuelType === alert.fuelType && (
    alert.condition === "above" ? station.price >= alert.maxPrice : station.price <= alert.maxPrice
  )) || null;
}

async function getRewardAccount() { return apiGet("/rewards/me"); }
async function getPublicRewardRules() { return apiGet("/rewards/rules"); }
async function getLeaderboard() { return apiGet("/rewards/leaderboard"); }
async function getActivity() { return apiGet("/rewards/activity"); }
async function getRewardCatalog() { return apiGet("/rewards/catalog"); }
async function redeemReward(rewardId) { return apiPost("/rewards/redeem", { rewardId }); }

async function getAdminReports() { return apiGet("/admin/reports"); }
async function setReportStatus(reportId, status) {
  return apiPut(`/admin/reports/${encodeURIComponent(reportId)}/status`, { status: status.toLowerCase() });
}
async function getAdminDashboard() { return apiGet("/admin/dashboard"); }
async function getAdminAudit() { return apiGet("/admin/audit-logs?limit=200"); }
async function getAdminUsers() { return apiGet("/admin/users"); }
async function getAdminStations() { return getStations(); }
async function getRewardRules() {
  const rules = await apiGet("/admin/rewards/rules");
  return Object.fromEntries(rules.map(rule => [rule.id, rule]));
}
async function saveRewardRules(rules) {
  const existing = await apiGet("/admin/rewards/rules");
  await Promise.all(existing.map(rule => apiPut(`/admin/rewards/rules/${encodeURIComponent(rule.id)}`, {
    points: Math.max(0, Number(rules[rule.id] ?? rule.points))
  })));
}
async function adjustUserPoints(userId, amount, reason) {
  return apiPost("/admin/reward-adjustments", { userId, amount: Number(amount), reason });
}
async function updateStationAdmin(station, fields) {
  return apiPut(`/admin/stations/${encodeURIComponent(station.id)}`, {
    name: fields.name,
    address: fields.city
  });
}
async function deleteStationAdmin(station) {
  return apiDelete(`/admin/stations/${encodeURIComponent(station.id)}`);
}
