export type Role = "user" | "admin";

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  suspended: boolean;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  fuelEfficiency: number;
}

export interface Station {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  verified: boolean;
  createdBy: string;
}

export interface PriceReport {
  id: string;
  stationId: string;
  userId: string;
  fuelType: string;
  price: number;
  reportedAt: string;
  verified: boolean;
  status: "pending" | "approved" | "rejected";
}

export interface AvailabilityReport {
  id: string;
  stationId: string;
  userId: string;
  fuelType: string;
  available: boolean;
  status?: "In Stock" | "Low Stock" | "Out of Stock";
  reportedAt: string;
}

export interface Trip {
  id: string;
  userId: string;
  vehicleId: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  distanceKm: number;
  estimatedFuelCost: number;
  createdAt: string;
}

export interface Refuel {
  id: string;
  userId: string;
  stationId?: string;
  amountLitres: number;
  totalCost: number;
  fuelType: string;
  occurredAt: string;
}

export interface Reward {
  id: string;
  name: string;
  description: string;
  pointsCost: number;
  active: boolean;
}

export interface RewardRule {
  id: string;
  label: string;
  points: number;
}

export interface RewardAccount {
  userId: string;
  points: number;
  contributions: number;
  contributionStats: Record<string, number>;
  badges: string[];
}

export interface Redemption {
  id: string;
  userId: string;
  rewardId: string;
  pointsSpent: number;
  redeemedAt: string;
}

export interface NotificationSubscription {
  id: string;
  userId: string;
  stationId: string;
  fuelType: string;
  maxPrice: number;
  condition?: "below" | "above";
  fcmToken?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  stationId: string;
  priceReportId: string;
  createdAt: string;
  read: boolean;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
  details: Record<string, unknown>;
}