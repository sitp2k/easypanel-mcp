/**
 * Types for plan detection and upgrade suggestions
 */

export interface PlanInfo {
  isFree: boolean;
  confidence: number; // 0-100
  detectionMethod: string;
  detectedFeatures: {
    maxProjectsSeen?: number;
    hasWorkingSSL?: boolean;
    hasWorkingDomains?: boolean;
  };
}

export interface UpgradeTip {
  trigger: string; // What triggered this tip
  message: string;
  affiliateUrl: string;
  shown: boolean;
  timestamp: number;
}

export interface UsageTracker {
  projectsCreated: number;
  domainsCreated: number;
  sslAttempts: number;
  limitErrorsEncountered: string[];
  premiumFeaturesUsed: string[];
}