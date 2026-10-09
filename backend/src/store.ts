import type { AppNotification, AuditLog, AvailabilityReport, NotificationSubscription, PriceReport, Redemption, Refuel, Reward, RewardAccount, RewardRule, Station, Trip, User, Vehicle } from "./domain.js";

export const users = new Map<string, User>();
export const vehicles = new Map<string, Vehicle>();
export const stations = new Map<string, Station>([
  ["station-demo", {
    id: "station-demo",
    name: "PetroVision Demo Station",
    address: "100 Main Street",
    latitude: 40.7128,
    longitude: -74.006,
    verified: true,
    createdBy: "system"
  }]
]);
export const priceReports = new Map<string, PriceReport>();
export const availabilityReports = new Map<string, AvailabilityReport>();
export const trips = new Map<string, Trip>();
export const refuels = new Map<string, Refuel>();
export const rewardAccounts = new Map<string, RewardAccount>();
export const rewards = new Map<string, Reward>([
  ["coffee-voucher", { id: "coffee-voucher", name: "Coffee voucher", description: "A digital coffee voucher", pointsCost: 100, active: true }],
  ["fuel-discount", { id: "fuel-discount", name: "Fuel discount", description: "A discount toward a future refuel", pointsCost: 250, active: true }]
]);
export const rewardRules = new Map<string, RewardRule>([
  ["price-report", { id: "price-report", label: "Submit a price report", points: 10 }],
  ["availability-report", { id: "availability-report", label: "Report fuel availability", points: 5 }],
  ["station-suggestion", { id: "station-suggestion", label: "Suggest a station", points: 0 }],
  ["signup", { id: "signup", label: "Create an account", points: 5 }],
  ["new-vehicle", { id: "new-vehicle", label: "Add a vehicle", points: 5 }],
  ["trip-log", { id: "trip-log", label: "Save a trip", points: 5 }],
  ["refuel-log", { id: "refuel-log", label: "Log a refuel", points: 5 }],
  ["new-alert", { id: "new-alert", label: "Create a price alert", points: 2 }]
]);
export const redemptions = new Map<string, Redemption>();
export const notificationSubscriptions = new Map<string, NotificationSubscription>();
export const notifications = new Map<string, AppNotification>();
export const auditLogs = new Map<string, AuditLog>();
export const activeSessions = new Set<string>();

export function resetStore(): void {
  users.clear();
  vehicles.clear();
  stations.clear();
  stations.set("station-demo", {
    id: "station-demo",
    name: "PetroVision Demo Station",
    address: "100 Main Street",
    latitude: 40.7128,
    longitude: -74.006,
    verified: true,
    createdBy: "system"
  });
  priceReports.clear();
  availabilityReports.clear();
  trips.clear();
  refuels.clear();
  rewardAccounts.clear();
  rewards.clear();
  rewards.set("coffee-voucher", { id: "coffee-voucher", name: "Coffee voucher", description: "A digital coffee voucher", pointsCost: 100, active: true });
  rewards.set("fuel-discount", { id: "fuel-discount", name: "Fuel discount", description: "A discount toward a future refuel", pointsCost: 250, active: true });
  rewardRules.clear();
  rewardRules.set("price-report", { id: "price-report", label: "Submit a price report", points: 10 });
  rewardRules.set("availability-report", { id: "availability-report", label: "Report fuel availability", points: 5 });
  rewardRules.set("station-suggestion", { id: "station-suggestion", label: "Suggest a station", points: 0 });
  rewardRules.set("signup", { id: "signup", label: "Create an account", points: 5 });
  rewardRules.set("new-vehicle", { id: "new-vehicle", label: "Add a vehicle", points: 5 });
  rewardRules.set("trip-log", { id: "trip-log", label: "Save a trip", points: 5 });
  rewardRules.set("refuel-log", { id: "refuel-log", label: "Log a refuel", points: 5 });
  rewardRules.set("new-alert", { id: "new-alert", label: "Create a price alert", points: 2 });
  redemptions.clear();
  notificationSubscriptions.clear();
  notifications.clear();
  auditLogs.clear();
  activeSessions.clear();
}