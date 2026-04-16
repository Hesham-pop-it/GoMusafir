# GoMusafir — Master Backend Implementation Plan

> **Status**: Ready for final review before implementation begins.

---

## 1. Technical Stack

| Layer | Technology |
| :--- | :--- |
| **Runtime** | Node.js 20+ |
| **Backend SDK** | Firebase Admin SDK |
| **Database** | Firebase Realtime Database (`europe-west1`, Belgium) |
| **Functions** | Firebase Cloud Functions (Gen 2) |
| **Encryption** | Google Cloud KMS |
| **Secrets** | Google Secret Manager |
| **Bot Protection** | Firebase App Check |

---

## 2. Database Schema (RTDB)

### 2.1 Full JSON Structure

```json
{
  "orgs": {
    "{ORG_ID}": {

      "metadata": {
        "name": "Nusuk Travel Co.",
        "plan": "enterprise",
        "admin_uid": "{UID_ADMIN}",
        "created_at": 1710000000000,
        "min_app_version": "2.1.0"
      },

      "staff": {
        "{UID_ADMIN}":    "admin",
        "{UID_MANAGER}":  "manager",
        "{UID_COHOST}":   "co-host"
      },

      "settings": {
        "visibility_policy": {
          "email":    "organizer-only",
          "phone":    "hidden",
          "location": "everyone"
        },
        "recording_allowed": false,
        "mfa_required": true
      },

      "trips": {
        "{TRIP_ID}": {
          "title":           "Makkah 2025",
          "destination":     "Makkah, Saudi Arabia",
          "start_date":      1720000000000,
          "end_date":        1720800000000,
          "status":          "active",
          "invitation_code": "{UUID_CODE}",
          "invite_expires_at": 1720800000000,
          "created_by":      "{UID_ADMIN}",
          "created_at":      1710000000000,

          "live_data": {
            "bus_id": {
              "lat": 21.3891,
              "lng": 39.8579,
              "updated_at": 1720000000000
            }
          }
        }
      },

      "consents": {
        "{UID_USER}": {
          "terms":     "accepted",
          "privacy":   "accepted",
          "voice":     "accepted",
          "location":  "accepted",
          "recorded_at": 1710000000000,
          "ip_hash":   "sha256_hash"
        }
      },

      "logs": {
        "{LOG_ID}": {
          "action":     "TRIP_CREATED",
          "by":         "{UID_ADMIN}",
          "target":     "{TRIP_ID}",
          "timestamp":  1710000000000,
          "ip_hash":    "sha256_hash"
        }
      }

    }
  },

  "users": {
    "{UID}": {
      "full_name":     "John Doe",
      "p_email":       "KMS_ENCRYPTED_EMAIL",
      "p_phone":       "KMS_ENCRYPTED_PHONE",
      "mfa_enrolled":  true,
      "staff_org_id":  "{ORG_ID}",
      "active_sessions": {
        "{SESSION_ID}": {
          "device":       "iPhone 15",
          "last_seen":    1710000000000,
          "revoked":      false
        }
      },
      "joined_trips": {
        "{TRIP_ID}": { "org_id": "{ORG_ID}", "status": "joined", "joined_at": 1710000000000 },
        "{TRIP_ID_B}": { "org_id": "{ORG_ID_B}", "status": "invited" }
      }
    }
  },

  "trips_participants": {
    "{TRIP_ID}": {
      "{UID_USER_1}": true,
      "{UID_USER_2}": true
    }
  },

  "invites": {
    "{UUID_CODE}": {
      "org_id":     "{ORG_ID}",
      "trip_id":    "{TRIP_ID}",
      "role":       "participant",
      "expires_at": 1720800000000,
      "redeemed":   false
    }
  }
}
```

### 2.2 Relationships

```
Company (ORG_ID)
  │
  ├── Staff (Admin: 1:1, Manager/Co-host: 1:N)  [orgs/{id}/staff]
  │     └── staff_org_id lock in users/{uid}
  │
  └── Trips (1:N)  [orgs/{id}/trips]
        │
        └── Participants (M:N)
              ├── trips_participants/{trip_id}/{uid} = true
              └── users/{uid}/joined_trips/{trip_id}
```

**Key Rules:**
- One Admin per Company (enforced by `admin_uid` in metadata).
- Staff (Manager/Co-host) can only belong to **one** org (`staff_org_id`).
- Participants are global — they can join trips across **many** companies.
- Invites are single-use, scoped, and auto-expire.

---

## 3. Security Implementation — Point by Point

| # | Security Requirement | How We Implement It |
| :--- | :--- | :--- |
| **S1** | Email Verification | RTDB Rule: `auth.token.email_verified == true` on all writes |
| **S2** | MFA for Admin | RTDB Rule: `auth.token.firebase.sign_in_second_factor != null` on org-level writes |
| **S3** | Step-up MFA | Cloud Function checks re-auth timestamp before destructive actions (delete org, change billing) |
| **S4** | Strong Password Policy | Firebase Auth password policy config + custom regex validation in signup function |
| **S5** | Session Revocation | `authFunctions/revokeSession` calls Admin SDK `revokeRefreshTokens(uid)` + marks `users/{uid}/active_sessions/{id}/revoked = true` |
| **S6** | RBAC Enforcement | Custom Claims set at signup (`role`, `orgId`). RTDB Rules check `auth.token.role` on every path |
| **S7** | Deny-by-Default RTDB | All paths default to `".read": false, ".write": false`. Access only granted explicitly |
| **S8** | Org Isolation | Rule: `auth.token.orgId == $orgId` enforced at `/orgs/$orgId/` root |
| **S9** | Trip Isolation | Rule: `trips_participants/$tripId/$uid == true` required to read trip data |
| **S10** | Field-Level Visibility | RTDB `.validate` rules + server-side `settings/visibility_policy` checked before returning PII |
| **S11** | Write Allowlist | RTDB `.validate` rules mark unknown fields invalid; `.child('unknownField').notexists()` pattern |
| **S12** | PII Encryption (KMS) | `onUserSignup` function encrypts `email` + `phone` via Cloud KMS before writing to DB. Stored as `p_email`, `p_phone` |
| **S13** | App Check (Bot Protection) | Firebase App Check enforced on all callable functions. `verifyAppCheckToken` middleware in every endpoint |
| **S14** | Join Rate Limiting | `inviteFunctions/redeemInvitation` uses per-IP counter in Firebase (or Redis) — max 10 attempts/min |
| **S15** | Invite Expiry & Scope | `invites/{code}` has `expires_at` + `redeemed` flag. Function atomically flips `redeemed = true` |
| **S16** | No Open Redirects | `redeemInvitation` only allows redirects to `/*.gomusafir.app` allowlist |
| **S17** | Server Input Validation | Every Cloud Function uses `zod` schema validation before any DB write |
| **S18** | Upload Validation | Cloud Storage triggers: file type allowlist (jpg/png), max 5MB, Cloud Vision / malware scan |
| **S19** | Mute-All (Server-side) | Voice server state stored in RTDB; client `canSpeak` flag enforced by server — client-side UI is only display |
| **S20** | Audit Logging | `systemFunctions/auditLogger` writes to `orgs/{id}/logs` — append-only (no `.write` on existing entries) |
| **S21** | Login Logging | `auth.onCreate` + `auth.beforeSignIn` triggers log `LOGIN_SUCCESS` / `LOGIN_FAIL` with IP hash |
| **S22** | Immutable Audit Log | RTDB Rule: `".write": "!data.exists()"` on `logs/{id}` — new entries only, no overwrites |
| **S23** | Consent Storage | `inviteFunctions/redeemInvitation` writes consent record before granting trip access |
| **S24** | Secure Local Storage | Mobile: use `expo-secure-store` (Keychain/Keystore) for tokens — never AsyncStorage |
| **S25** | Jailbreak / Root Detection | Integrate `react-native-jailbreak-term` on app launch; block Trip access if flagged |
| **S26** | Certificate Pinning | Configure via `react-native-ssl-pinning` with Firebase domain hashes |
| **S27** | Deep Link Validation | [App.js](file:///d:/GoMusafir/App.js) deep link handler validates scheme, host (`*.gomusafir.app`), and path before acting |
| **S28** | Brute Force Protection | Firebase Auth native lockout + Cloud Function blocks after 5 failed OTP attempts |
| **S29** | Seat Grant via Webhook | Stripe webhook verified with `stripe.webhooks.constructEvent()` — seat granted only on success |
| **S30** | Idempotent Payments | Idempotency key generated from `orgId + planId + timestamp` — duplicate webhook ignored |

---

## 4. Cloud Functions — Grouped Architecture

### Group A — `authFunctions`
| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| `onUserSignup` | Auth onCreate | Encrypt PII, set default role claims, create `users/{uid}` profile |
| `verifyMFAState` | HTTPS Callable | Check if user has enrolled MFA; return status |
| `revokeSession` | HTTPS Callable (Admin) | Revoke refresh token + flag session in DB |
| `onNewDeviceSignin` | Auth beforeSignIn | Detect new device, trigger alert notification |

### Group B — `orgFunctions`
| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| `createOrganization` | HTTPS Callable | Initialize org node, set Admin, write audit log |
| `updateMemberRole` | HTTPS Callable | Add/remove Managers and Co-hosts, verify caller is Admin, log action |
| `deleteOrganization` | HTTPS Callable | Step-up MFA check, cascade delete org data |

### Group C — `tripFunctions`
| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| `createTrip` | HTTPS Callable | Generate trip + UUID invite code, write audit log |
| `updateLiveLocation` | HTTPS Callable | GPS update endpoint (rate-limited, optimized write) |
| `closeTrip` | HTTPS Callable | Archive trip, invalidate invite code, clear live_data |
| `rotateInviteCode` | HTTPS Callable | Generate new UUID, invalidate old code |

### Group D — `inviteFunctions`
| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| `redeemInvitation` | HTTPS Callable | Validate code + expiry + auth, write consent, atomic join |
| `getInviteMetadata` | HTTPS Callable | Return safe trip preview (no auth required) for link landing page |

### Group E — `systemFunctions`
| Function | Trigger | Purpose |
| :--- | :--- | :--- |
| `auditLogger` | RTDB onWrite | Triggered by critical path changes, writes to `logs` |
| `dataCleanupCron` | Pub/Sub Schedule (Daily) | Purge old logs (>90 days), revoked sessions, expired invites |
| `stripeWebhookHandler` | HTTPS (Stripe Signed) | Validate Stripe event, grant/revoke seats |

---

## 5. Deployment Structure

```
functions/
  ├── index.js                 ← exports all groups
  ├── groups/
  │   ├── authFunctions.js
  │   ├── orgFunctions.js
  │   ├── tripFunctions.js
  │   ├── inviteFunctions.js
  │   └── systemFunctions.js
  ├── middleware/
  │   ├── appCheckMiddleware.js
  │   ├── rateLimiter.js
  │   └── validateSchema.js
  ├── services/
  │   ├── kmsService.js        ← encrypt/decrypt PII
  │   ├── auditService.js      ← write audit entries
  │   └── stripeService.js
  └── rules/
      └── database.rules.json  ← RTDB Security Rules
```

### Deployment Commands
```bash
# Deploy specific group only
firebase deploy --only functions:authFunctions
firebase deploy --only functions:tripFunctions

# Deploy all
firebase deploy --only functions

# Deploy rules only
firebase deploy --only database
```

---

## 6. Responsibility Matrix

| Scope | What | How |
| :--- | :--- | :--- |
| **App Dev** | All 30 security points above | Node.js Cloud Functions + RTDB Rules + Mobile SDK |
| **Firebase/GCP** | HTTPS, DDoS, DB replication, backups, failover | Firebase console + GCP config |
| **Your Ops Team** | SIEM, IDS/IPS, Penetration Testing, Runbooks | External tools (Grafana, PagerDuty, etc.) |
| **Legal** | Privacy Policy, DPA, International Transfers | Legal documents |
