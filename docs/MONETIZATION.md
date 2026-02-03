# GeoNoise Monetization Plan

## Overview

This document outlines the monetization strategy for GeoNoise, focusing on premium features like Map Integration while keeping the core noise modeling functionality free and accessible.

---

## 🎯 Philosophy

**Core Principle**: Keep GeoNoise **free for core functionality** (noise modeling, sources, receivers, barriers, propagation). Premium features enhance workflow but aren't required for basic use.

**Target Users**:
- **Free Tier**: Students, hobbyists, small consultants doing occasional work
- **Premium Tier**: Professional consultants, engineering firms, frequent users who need efficiency features

---

## 💰 Monetization Options

### Option 1: Subscription-Based (Stripe/Paddle)

**Pros**:
- Predictable recurring revenue
- Professional perception
- Full control over feature gating
- Can offer trials

**Cons**:
- More complex to implement (auth, backend, billing)
- Higher barrier to entry for users
- Need to handle failed payments, cancellations

**Pricing Ideas**:
| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Core noise modeling, export CSV, up to 5 sources |
| Pro | $9.99/mo | Map integration, unlimited sources, cloud save, priority support |
| Team | $29.99/mo | All Pro + team sharing, API access, white-label exports |

---

### Option 2: Patreon / Ko-fi (Simpler)

**Pros**:
- Very easy to set up
- Community-focused, less transactional feeling
- Handles all payment processing
- Good for indie/open-source perception
- Supporters feel like patrons, not customers

**Cons**:
- Less control over feature gating
- Need manual or semi-automated access granting
- Platform takes a cut (5-12%)
- Less "professional" for enterprise clients

**Tier Ideas**:
| Tier | Price | Perks |
|------|-------|-------|
| Supporter | $5/mo | Name in credits, Discord access |
| Pro User | $10/mo | Map integration unlock code, early access |
| Consultant | $25/mo | All features + priority feature requests |

---

### Option 3: Hybrid Approach (Recommended)

**Best of both worlds**:
1. **Patreon** for community support and simple unlock codes
2. **Direct subscription** (later) for enterprise/team features
3. **One-time purchase** option via Gumroad/LemonSqueezy for lifetime access

---

## 🏗️ Technical Architecture

### Phase 1: Simple Access Control (Patreon-First)

```
┌─────────────────────────────────────────────────────────┐
│                     GeoNoise App                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐    ┌──────────────────────────────┐   │
│  │ Free        │    │ Premium Features             │   │
│  │ Features    │    │ ┌──────────────────────────┐ │   │
│  │             │    │ │ 🔒 Map Integration       │ │   │
│  │ • Sources   │    │ │ 🔒 Cloud Save           │ │   │
│  │ • Receivers │    │ │ 🔒 Advanced Export      │ │   │
│  │ • Barriers  │    │ │ 🔒 Unlimited Sources    │ │   │
│  │ • Buildings │    │ └──────────────────────────┘ │   │
│  │ • Probes    │    │                              │   │
│  │ • CSV Export│    │   ┌────────────────────┐     │   │
│  │ • Local Save│    │   │  License Validator │     │   │
│  └─────────────┘    │   │  (localStorage)    │     │   │
│                     │   └─────────┬──────────┘     │   │
│                     └─────────────┼────────────────┘   │
│                                   │                     │
└───────────────────────────────────┼─────────────────────┘
                                    │
                    ┌───────────────▼───────────────┐
                    │     License Key Check         │
                    │  (simple hash validation)     │
                    │                               │
                    │  • Check expiry date          │
                    │  • Validate signature         │
                    │  • No backend required        │
                    └───────────────────────────────┘
```

**How it works**:
1. User subscribes on Patreon
2. We generate a license key (includes expiry date + signature)
3. User enters key in GeoNoise settings
4. App validates locally (no server round-trip needed)
5. Premium features unlock

**License Key Format**:
```
GEONOISE-PRO-{USER_ID}-{EXPIRY_YYYYMM}-{SIGNATURE}
Example: GEONOISE-PRO-12345-202603-a7b3c9d2e1f0
```

---

### Phase 2: Backend-Powered (Future)

```
┌─────────────────────────────────────────────────────────┐
│                     GeoNoise App                        │
└──────────────────────────┬──────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │   Auth0 /   │
                    │  Supabase   │
                    │   (Auth)    │
                    └──────┬──────┘
                           │
              ┌────────────▼────────────┐
              │     GeoNoise API        │
              │   (Cloudflare Workers)  │
              ├─────────────────────────┤
              │ • /api/license/check    │
              │ • /api/subscription     │
              │ • /api/cloud-save       │
              └────────────┬────────────┘
                           │
              ┌────────────▼────────────┐
              │       Database          │
              │  (Supabase / Turso)     │
              ├─────────────────────────┤
              │ • users                 │
              │ • subscriptions         │
              │ • saved_projects        │
              └─────────────────────────┘
```

---

## 📁 Implementation Files

### New Files Needed

```
apps/web/
├── src/
│   ├── license/
│   │   ├── index.ts           # License management
│   │   ├── validator.ts       # Key validation logic
│   │   ├── features.ts        # Feature flag definitions
│   │   └── ui.ts              # License modal UI
│   └── ...
└── ...

docs/
├── MONETIZATION.md            # This file
└── ...
```

### Feature Flags Definition

```typescript
// src/license/features.ts

export enum Feature {
  MAP_INTEGRATION = 'map_integration',
  CLOUD_SAVE = 'cloud_save',
  UNLIMITED_SOURCES = 'unlimited_sources',
  ADVANCED_EXPORT = 'advanced_export',
  TEAM_SHARING = 'team_sharing',
}

export const FREE_TIER_LIMITS = {
  maxSources: 5,
  maxReceivers: 10,
  maxBarriers: 10,
  exportFormats: ['csv'],
};

export const PRO_TIER_FEATURES: Feature[] = [
  Feature.MAP_INTEGRATION,
  Feature.CLOUD_SAVE,
  Feature.UNLIMITED_SOURCES,
  Feature.ADVANCED_EXPORT,
];
```

### License Validator (Phase 1 - Offline)

```typescript
// src/license/validator.ts

interface LicenseInfo {
  tier: 'free' | 'pro' | 'team';
  userId: string;
  expiryDate: Date;
  features: Feature[];
  isValid: boolean;
}

export function validateLicenseKey(key: string): LicenseInfo {
  // Parse: GEONOISE-PRO-{USER_ID}-{EXPIRY_YYYYMM}-{SIGNATURE}
  const parts = key.split('-');
  
  if (parts.length !== 5 || parts[0] !== 'GEONOISE') {
    return { tier: 'free', isValid: false, ... };
  }
  
  const tier = parts[1].toLowerCase();
  const userId = parts[2];
  const expiry = parseExpiry(parts[3]); // YYYYMM -> Date
  const signature = parts[4];
  
  // Validate signature (simple HMAC or hash check)
  const expectedSig = generateSignature(tier, userId, expiry);
  if (signature !== expectedSig) {
    return { tier: 'free', isValid: false, ... };
  }
  
  // Check expiry
  if (new Date() > expiry) {
    return { tier: 'free', isValid: false, expired: true, ... };
  }
  
  return {
    tier,
    userId,
    expiryDate: expiry,
    features: getFeaturesForTier(tier),
    isValid: true,
  };
}

export function hasFeature(feature: Feature): boolean {
  const license = getCurrentLicense();
  return license.features.includes(feature);
}
```

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Create license key generation script (for admin use)
- [ ] Implement client-side license validator
- [ ] Add "Enter License Key" modal in settings
- [ ] Gate Map Integration behind license check
- [ ] Set up Patreon page with tiers
- [ ] Write onboarding email for Patreon supporters

### Phase 2: Polish (Week 3-4)
- [ ] Add license status indicator in UI
- [ ] Implement grace period for expired licenses
- [ ] Add "Upgrade" prompts when hitting free tier limits
- [ ] Create landing page explaining Pro features
- [ ] Set up Ko-fi as alternative to Patreon

### Phase 3: Backend (Future)
- [ ] Set up Supabase/Cloudflare for auth
- [ ] Implement cloud project saving
- [ ] Add team/organization features
- [ ] Integrate Stripe for direct subscriptions
- [ ] Build admin dashboard for license management

---

## 🔒 Security Considerations

### Phase 1 (Offline Validation)
- **Risk**: License keys can be shared
- **Mitigation**: Keys are tied to Patreon account, can be revoked
- **Acceptable for**: Early stage, community-focused approach

### Phase 2 (Online Validation)
- **Add**: Rate limiting, device fingerprinting (optional)
- **Add**: License key refresh on each launch
- **Add**: Webhook from Patreon/Stripe for real-time updates

---

## 💡 Premium Feature Ideas (Future)

| Feature | Description | Priority |
|---------|-------------|----------|
| Map Integration | Mapbox overlay with 1:1 scaling | ✅ Done |
| Cloud Save | Save/load projects from cloud | High |
| Advanced Export | PDF reports, DXF, GeoJSON | Medium |
| Custom Spectra | Import custom source spectra | Medium |
| Terrain Import | Load DEM/elevation data | Low |
| Weather Effects | Wind, temperature gradients | Low |
| Team Sharing | Share projects with team | Future |
| API Access | Programmatic noise calculations | Future |

---

## 📊 Success Metrics

**Phase 1 Goals** (First 3 months):
- 50+ Patreon supporters
- $500+/mo recurring revenue
- <5% churn rate

**Phase 2 Goals** (6 months):
- 200+ paying users
- $2000+/mo recurring revenue
- 3+ enterprise clients

---

## 📝 Notes

- Start simple with Patreon - don't over-engineer
- Focus on value delivery before paywall complexity
- Keep core noise modeling FREE forever
- Be transparent about what's free vs paid
- Consider academic/student discounts

---

*Last updated: 2026-02-03*
