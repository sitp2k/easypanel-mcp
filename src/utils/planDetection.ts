/**
 * Plan detection utility - infers EasyPanel plan from actual API behavior
 */

import { PlanInfo, UsageTracker, UpgradeTip } from '../types/plan.js';

const AFFILIATE_URL = 'https://easypanel.io?aff=7GNAmD';

export class PlanDetector {
  private usage: UsageTracker = {
    projectsCreated: 0,
    domainsCreated: 0,
    sslAttempts: 0,
    limitErrorsEncountered: [],
    premiumFeaturesUsed: []
  };

  private detectedPlan: PlanInfo | null = null;
  private lastDetectionTime: number = 0;
  private readonly DETECTION_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private lastLicenseCheck: number = 0;
  private readonly LICENSE_CHECK_TTL = 5 * 60 * 1000; // 5 minutes
  private licenseInfo: any = null;

  /**
   * Track API usage to infer plan type
   */
  trackUsage(operation: string, result: any, error?: any): void {
    // Track project creation
    if (operation.includes('createProject')) {
      this.usage.projectsCreated++;
    }

    // Track domain operations
    if (operation.includes('addDomain')) {
      this.usage.domainsCreated++;
      if (!error) {
        this.usage.premiumFeaturesUsed.push('domains');
      }
    }

    // Track SSL attempts
    if (operation.includes('SSL') || operation.includes('certificate')) {
      this.usage.sslAttempts++;
      if (!error) {
        this.usage.premiumFeaturesUsed.push('ssl');
      }
    }

    // Track limit errors
    if (error && this.isLimitError(error)) {
      const errorMsg = error.message || error.toString();
      if (!this.usage.limitErrorsEncountered.includes(errorMsg)) {
        this.usage.limitErrorsEncountered.push(errorMsg);
      }
    }
  }

  /**
   * Update license information from API
   */
  updateLicenseInfo(licenseData: any, userInfo: any): void {
    const now = Date.now();
    this.lastLicenseCheck = now;
    this.licenseInfo = {
      license: licenseData,
      user: userInfo,
      timestamp: now
    };
  }

  /**
   * Detect plan type based on collected usage data and license info
   */
  detectPlan(): PlanInfo {
    // Use cached result if still valid
    const now = Date.now();
    if (this.detectedPlan && (now - this.lastDetectionTime) < this.DETECTION_CACHE_TTL) {
      return this.detectedPlan;
    }

    let confidence = 50;
    let isFree = false;
    let method = 'unknown';

    // Method 0: Direct license check (highest confidence)
    if (this.licenseInfo && (now - this.lastLicenseCheck) < this.LICENSE_CHECK_TTL) {
      if (this.licenseInfo.user?.plan) {
        const plan = this.licenseInfo.user.plan.toLowerCase();
        if (plan.includes('free') || plan.includes('trial')) {
          isFree = true;
          confidence = 98;
          method = 'license_api_free';
        } else if (plan.includes('premium') || plan.includes('pro') || plan.includes('enterprise')) {
          isFree = false;
          confidence = 98;
          method = 'license_api_premium';
        }
      }

      // Check license payload for plan information
      if (this.licenseInfo.license?.payload) {
        const payload = this.licenseInfo.license.payload;
        if (payload.plan) {
          const plan = payload.plan.toLowerCase();
          if (plan.includes('free') || plan.includes('trial')) {
            isFree = true;
            confidence = Math.max(confidence, 95);
            method = 'license_payload_free';
          } else if (plan.includes('premium') || plan.includes('pro') || plan.includes('enterprise')) {
            isFree = false;
            confidence = Math.max(confidence, 95);
            method = 'license_payload_premium';
          }
        }
      }
    }

    // Method 1: Project count inference (updated thresholds)
    if (this.usage.projectsCreated >= 5) {
      isFree = false;
      confidence = Math.max(confidence, 90);
      method = 'project_count_high';
    } else if (this.usage.projectsCreated >= 2) {
      // 2+ projects likely hitting free limit
      isFree = true;
      confidence = Math.max(confidence, 70);
      method = 'project_count_threshold';
    }

    // Method 2: Premium features usage
    if (this.usage.premiumFeaturesUsed.length > 0) {
      if (this.usage.premiumFeaturesUsed.includes('ssl')) {
        isFree = false;
        confidence = Math.max(confidence, 85);
        method = 'ssl_feature_available';
      }
      if (this.usage.premiumFeaturesUsed.includes('domains')) {
        isFree = false;
        confidence = Math.max(confidence, 80);
        method = 'domains_feature_available';
      }
    }

    // Method 3: Limit errors with broader detection
    if (this.usage.limitErrorsEncountered.length > 0) {
      const hasLimitError = this.usage.limitErrorsEncountered.some(err =>
        err.toLowerCase().includes('limit') ||
        err.toLowerCase().includes('upgrade') ||
        err.toLowerCase().includes('premium') ||
        err.toLowerCase().includes('subscription') ||
        err.toLowerCase().includes('payment required') ||
        err.toLowerCase().includes('forbidden') ||
        err.toLowerCase().includes('quota')
      );

      if (hasLimitError) {
        isFree = true;
        confidence = Math.max(confidence, 85);
        method = 'limit_error_detected';
      }
    }

    // Method 4: Frequency-based detection - suggest upgrade more aggressively
    if (this.usage.projectsCreated >= 1 && this.usage.projectsCreated < 3) {
      // If they have at least one project, they're likely on free tier
      if (confidence < 70) {
        isFree = true;
        confidence = 60;
        method = 'usage_inference';
      }
    }

    this.detectedPlan = {
      isFree,
      confidence,
      detectionMethod: method,
      detectedFeatures: {
        maxProjectsSeen: this.usage.projectsCreated,
        hasWorkingSSL: this.usage.premiumFeaturesUsed.includes('ssl'),
        hasWorkingDomains: this.usage.premiumFeaturesUsed.includes('domains')
      }
    };

    this.lastDetectionTime = now;
    return this.detectedPlan;
  }

  /**
   * Generate upgrade tip based on current context (more aggressive suggestion)
   */
  generateUpgradeTip(context?: string): UpgradeTip | null {
    const plan = this.detectPlan();

    // Lower threshold for suggesting upgrades (be more aggressive)
    if (!plan.isFree || plan.confidence < 50) {
      return null;
    }

    const now = Date.now();

    // Different tips based on context
    if (context?.includes('project') && this.usage.projectsCreated >= 2) {
      return {
        trigger: 'project_limit',
        message: `You've created ${this.usage.projectsCreated} project(s). EasyPanel Premium removes the project limit entirely - scale without boundaries!`,
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    if (context?.includes('domain') || context?.includes('add_domain')) {
      return {
        trigger: 'domain_feature',
        message: 'Custom domains give your app a professional edge. Premium includes unlimited custom domains with automatic SSL certificates.',
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    if (context?.includes('SSL') || context?.includes('certificate') || context?.includes('https')) {
      return {
        trigger: 'ssl_feature',
        message: 'Keep all your sites secure with free SSL certificates from Let\'s Encrypt. Premium handles SSL automatically for all domains.',
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    if (context?.includes('service') && this.usage.projectsCreated >= 2) {
      return {
        trigger: 'service_scaling',
        message: 'Managing multiple services? Premium includes advanced monitoring, priority deployments, and enhanced security features.',
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    // Suggest upgrade after any error that might be limit-related
    if (this.usage.limitErrorsEncountered.length > 0) {
      return {
        trigger: 'error_encountered',
        message: 'Hit a limitation? Premium unlocks unlimited projects, custom domains, SSL certificates, and priority customer support.',
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    // General tip - show more frequently
    if (this.usage.projectsCreated >= 1 || this.usage.limitErrorsEncountered.length > 0) {
      const messages = [
        'Take your projects to the next level with EasyPanel Premium - unlimited projects, custom domains, and free SSL.',
        'Ready to grow? Premium removes all limits and adds priority support, advanced monitoring, and enhanced security.',
        'Scale your deployment with EasyPanel Premium - unlock unlimited projects and professional features.'
      ];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];

      return {
        trigger: 'general_upgrade',
        message: randomMessage,
        affiliateUrl: AFFILIATE_URL,
        shown: false,
        timestamp: now
      };
    }

    return null;
  }

  /**
   * Check if error is related to plan limits (expanded detection)
   */
  private isLimitError(error: any): boolean {
    const errorMsg = error.message || error.toString() || '';
    const lowerError = errorMsg.toLowerCase();

    return lowerError.includes('limit') ||
           lowerError.includes('upgrade') ||
           lowerError.includes('premium') ||
           lowerError.includes('subscription') ||
           lowerError.includes('exceeded') ||
           lowerError.includes('maximum') ||
           lowerError.includes('quota') ||
           lowerError.includes('forbidden') ||
           lowerError.includes('payment required') ||
           lowerError.includes('unauthorized') ||
           lowerError.includes('not available');
  }

  /**
   * Get upgrade suggestion with affiliate link
   */
  getUpgradeSuggestion(context?: string): { message: string; url: string } | null {
    const tip = this.generateUpgradeTip(context);
    if (tip) {
      return {
        message: tip.message,
        url: tip.affiliateUrl
      };
    }
    return null;
  }

  /**
   * Enhanced plan detection with license API integration
   */
  async checkLicenseStatus(licenseClient: any): Promise<boolean> {
    try {
      // Try to get user info first
      const userInfo = await licenseClient.getUser();

      // Try to get license info for 'premium' type
      const licenseData = await licenseClient.getLicensePayload('premium');

      // Update our internal state
      this.updateLicenseInfo(licenseData, userInfo);

      return true;
    } catch (error) {
      // If we can't get license info, we'll rely on usage tracking
      return false;
    }
  }

  /**
   * Get current usage stats
   */
  getUsage(): UsageTracker {
    return { ...this.usage };
  }

  /**
   * Reset usage tracking
   */
  reset(): void {
    this.usage = {
      projectsCreated: 0,
      domainsCreated: 0,
      sslAttempts: 0,
      limitErrorsEncountered: [],
      premiumFeaturesUsed: []
    };
    this.detectedPlan = null;
    this.lastDetectionTime = 0;
  }
}

// Singleton instance
let detectorInstance: PlanDetector | null = null;

export function getPlanDetector(): PlanDetector {
  if (!detectorInstance) {
    detectorInstance = new PlanDetector();
  }
  return detectorInstance;
}