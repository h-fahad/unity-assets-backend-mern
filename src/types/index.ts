import { Document } from 'mongoose';

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum BillingCycle {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY'
}

export enum ActivityType {
  USER_REGISTERED = 'USER_REGISTERED',
  USER_SUBSCRIPTION = 'USER_SUBSCRIPTION',
  USER_SUBSCRIPTION_CANCELLED = 'USER_SUBSCRIPTION_CANCELLED',
  ASSET_UPLOADED = 'ASSET_UPLOADED',
  ASSET_DOWNLOADED = 'ASSET_DOWNLOADED',
  ASSET_MILESTONE = 'ASSET_MILESTONE',
  PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
  SYSTEM_EVENT = 'SYSTEM_EVENT',
  CATEGORY_UPDATED = 'CATEGORY_UPDATED'
}

export interface IUser extends Document {
  name?: string;
  email: string;
  password: string;
  role: Role;
  isActive: boolean;
  resetToken?: string;
  resetTokenExpiry?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Instance methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generateResetToken(): string;
}

export interface ICategory extends Document {
  name: string;
  description?: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscriptionPlan extends Document {
  name: string;
  description?: string;
  basePrice: number;
  billingCycle: BillingCycle;
  yearlyDiscount: number;
  dailyDownloadLimit: number;
  features: string[];
  isActive: boolean;
  // Stripe integration
  stripeProductId?: string;
  stripePriceIds?: {
    monthly?: string;
    yearly?: string;
  };
  createdAt: Date;
  updatedAt: Date;
  // Virtual properties
  yearlyPrice: number;
  monthlyPrice: number;
}

export interface IUserSubscription extends Document {
  userId: string;
  planId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  // Stripe integration
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  stripePriceId?: string;
  stripeStatus?: string; // active, canceled, incomplete, etc.
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAsset extends Document {
  name: string;
  description: string;
  fileUrl: string;
  thumbnail?: string;
  tags: string[];
  isActive: boolean;
  downloadCount: number;
  categoryId: string;
  uploadedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDownload extends Document {
  userId: string;
  assetId: string;
  downloadedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface IDownloadStatics {
  getDailyDownloadCount(userId: string, date?: Date): Promise<number>;
  getUserDownloadHistory(userId: string, page?: number, limit?: number): Promise<IDownload[]>;
  getAssetStats(assetId: string): Promise<any>;
}

export interface IAnalytics extends Document {
  date: Date;
  metric: string;
  value: number;
  metadata?: any;
  createdAt: Date;
}

export interface IActivity extends Document {
  type: ActivityType;
  message: string;
  userId?: string;
  assetId?: string;
  metadata?: any;
  createdAt: Date;
}

export interface IActivityStatics {
  logActivity(
    type: ActivityType,
    message: string,
    userId?: string,
    assetId?: string,
    metadata?: any
  ): Promise<IActivity>;
  getRecentActivities(page?: number, limit?: number, userId?: string, type?: ActivityType): Promise<IActivity[]>;
  getActivityStats(days?: number): Promise<any>;
  getUserActivitySummary(userId: string, days?: number): Promise<any>;
}