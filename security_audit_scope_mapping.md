# GoMusafir: Security Audit Scope Allocation (137 Points)

This document maps every requirement from the **Achmea & Leidschendam Enterprise Audit** to either the **Application Development Scope** (what I will build) or the **External Operations/Infrastructure Scope** (managed by tools like IDS/IPS, EDR, SIEM, or Ops teams).

| ID | Requirement Area | Requirement | Allocation |
| :--- | :--- | :--- | :--- |
| 1 | Identity & Access | Business email verification | **APP_DEVELOPMENT** |
| 2 | Identity & Access | MFA for Admin accounts | **APP_DEVELOPMENT** |
| 3 | Identity & Access | Strong password policy (Business) | **APP_DEVELOPMENT** |
| 4 | Identity & Access | Password participant access | **APP_DEVELOPMENT** |
| 5 | Identity & Access | Session management & remote logout | **APP_DEVELOPMENT** |
| 6 | Identity & Access | New device sign-in alert | **APP_DEVELOPMENT** |
| 7 | Identity & Access | Secure password reset | **APP_DEVELOPMENT** |
| 8 | Identity & Access | SSO support for enterprise | **APP_DEVELOPMENT** |
| 9 | Identity & Access | Sensitive role approval workflow | **APP_DEVELOPMENT** |
| 10 | Identity & Access | Participant email verification | **APP_DEVELOPMENT** |
| 11 | Identity & Access | Strong password policy (Participant) | **APP_DEVELOPMENT** |
| 12 | Identity & Access | Session revocation | **APP_DEVELOPMENT** |
| 13 | Identity & Access | Device / session visibility | **APP_DEVELOPMENT** |
| 14 | Identity & Access | New device sign-in notification | **APP_DEVELOPMENT** |
| 15 | Voice | Regional audio nodes | **EXTERNAL_INFRA** (Config) |
| 16 | Voice | Jitter buffer handling | **APP_DEVELOPMENT** |
| 17 | Identity & Access | Device trust / session visibility | **APP_DEVELOPMENT** |
| 18 | Authorization | RBAC (Admin, Host, Manager, Partic.) | **APP_DEVELOPMENT** |
| 19 | Authorization | Least privilege support access | **EXTERNAL_OPS** (Internal Policy) |
| 20 | Authorization | Role change audit trail | **APP_DEVELOPMENT** |
| 21 | Authorization | Trip-scoped participant permissions | **APP_DEVELOPMENT** |
| 22 | Tenancy | Deny-by-default database rules | **APP_DEVELOPMENT** |
| 23 | Tenancy | Organization isolation | **APP_DEVELOPMENT** |
| 24 | Tenancy | Trip isolation | **APP_DEVELOPMENT** |
| 25 | Tenancy | Field-level protections (PII visibility) | **APP_DEVELOPMENT** |
| 26 | Tenancy | Write allowlists | **APP_DEVELOPMENT** |
| 27 | Join & Invite | Auth before join completion | **APP_DEVELOPMENT** |
| 28 | Join & Invite | Join rate limiting | **APP_DEVELOPMENT** |
| 29 | Join & Invite | Invitation links expire automatically | **APP_DEVELOPMENT** |
| 30 | Join & Invite | Join links single-purpose & scoped | **APP_DEVELOPMENT** |
| 31 | Join & Invite | No open redirects | **APP_DEVELOPMENT** |
| 32 | Join & Invite | QR join security | **APP_DEVELOPMENT** |
| 33 | Join & Invite | Participant rejoin handling | **APP_DEVELOPMENT** |
| 34 | Validation | API rate limiting | **APP_DEVELOPMENT** |
| 35 | Validation | Secret handling (KMS/Vault) | **APP_DEVELOPMENT** (Config) |
| 36 | Validation | Server-side input validation | **APP_DEVELOPMENT** |
| 37 | Validation | Upload validation (type/size/malware) | **APP_DEVELOPMENT** |
| 38 | Validation | Schema enforcement | **APP_DEVELOPMENT** |
| 39 | Voice | Regional audio routing | **EXTERNAL_INFRA** (Config) |
| 40 | Voice | TURN / STUN resilience | **APP_DEVELOPMENT** |
| 41 | Voice | Audio QoS telemetry | **EXTERNAL_INFRA** |
| 42 | Voice | Host broadcast realtime | **APP_DEVELOPMENT** (Nothing to do with Security) |
| 43 | Voice | Mute all (Server-side enforced) | **APP_DEVELOPMENT** |
| 44 | Voice | Per participant mute/unmute | **APP_DEVELOPMENT** (Nothing to do with Security)|
| 45 | Voice | Active speaker detection | **APP_DEVELOPMENT** (Nothing to do with Security)|
| 46 | Voice | Participant speak permission logic | **APP_DEVELOPMENT** |
| 47 | Voice | Network health indicator | **APP_DEVELOPMENT** |
| 48 | Voice | Adaptive bitrate and reconnect | **APP_DEVELOPMENT** (Nothing to do with Security) |
| 49 | Voice | Delayed clip fallback | **APP_DEVELOPMENT** (Nothing to do with Security) |
| 50 | Voice | Host offline behavior | **APP_DEVELOPMENT** (Nothing to do with Security) |
| 51 | Voice | Audio encrypted in transit | **APP_DEVELOPMENT** (Config) |
| 52 | Voice | No recording by default | **APP_DEVELOPMENT** |
| 53 | Voice | Mandatory microphone permission | **APP_DEVELOPMENT** (UX) |
| 54 | Voice | Recording consent if enabled | **APP_DEVELOPMENT** |
| 55 | Chat | Trip-scoped group chat | **APP_DEVELOPMENT** |
| 56 | Chat | Template announcements | **APP_DEVELOPMENT** |
| 57 | Chat | Rate limiting & abuse controls | **EXTERNAL_OPS** |
| 58 | Location | Opt-in location sharing | **APP_DEVELOPMENT** (Require Extra Development) |
| 59 | Location | Incognito mode | **APP_DEVELOPMENT** (Require Extra Development) |
| 60 | Location | Pin route action | **APP_DEVELOPMENT** (Require Extra Development) |
| 61 | Location | Mandatory location permission | **APP_DEVELOPMENT** (UX) |
| 62 | Location | Location request logic | **APP_DEVELOPMENT** |
| 63 | Camera | Mandatory camera permission | **APP_DEVELOPMENT** (UX) |
| 64 | Emergency | Emergency alert countdown | **APP_DEVELOPMENT** (Require Extra Development) |
| 65 | Emergency | Host notification reliability | **APP_DEVELOPMENT** (Require Extra Development) |
| 66 | Emergency | Alert abuse prevention | **EXTERNAL_INFRA** DLP |
| 67 | Emergency | Alert log (Forensics ready) | **EXTERNAL_INFRA** SIEM |
| 68 | Emergency | Do Not Disturb strategy | **APP_DEVELOPMENT** |
| 69 | Payments | Customer portal & billing security | **EXTERNAL** |
| 70 | Payments | Seat grant (webhook verified) | **APP_DEVELOPMENT** |
| 71 | Payments | Billing data collection | **APP_DEVELOPMENT** (Require Extra Development) |
| 72 | Payments | Price / region integrity | **APP_DEVELOPMENT** |
| 73 | Payments | Idempotent checkout | **APP_DEVELOPMENT** |
| 74 | Privacy | Legal links in product | **APP_DEVELOPMENT** |
| 75 | Privacy | Consent copy matches behavior | **APP_DEVELOPMENT** |
| 76 | Privacy | Minimal participant fields | **APP_DEVELOPMENT** |
| 77 | Privacy | Retention schedule | **EXTERNAL_OPS** (Policy) |
| 78 | Privacy | Org authority confirmation | **APP_DEVELOPMENT** |
| 79 | Privacy | Participant join consent | **APP_DEVELOPMENT** |
| 80 | Privacy | Participant account deletion | **APP_DEVELOPMENT** |
| 81 | Privacy | Data residency strategy | **EXTERNAL_OPS** (Policy) |
| 82 | Privacy | Deletion flows | **APP_DEVELOPMENT** |
| 83 | Privacy | International transfer safeguards | **EXTERNAL_OPS** (Legal) |
| 84 | Logging & Audit | Immutable audit trail (Admins) | **EXTERNAL_INFRA** |
| 85 | Logging & Audit | Voice moderation log | **EXTERNAL_INFRA** |
| 86 | Logging & Audit | Exportable logs | **EXTERNAL_INFRA** |
| 87 | Logging & Audit | Time synchronization (NTP) | **EXTERNAL_INFRA** (GCP Native) |
| 88 | Logging & Audit | Trusted log integrity | **EXTERNAL_INFRA** |
| 89 | Logging & Audit | Login logging | **APP_DEVELOPMENT** |
| 90 | Logging & Audit | Trip lifecycle logging | **EXTERNAL_INFRA** |
| 91 | Monitoring & IR | Disaster recovery plan | **EXTERNAL_OPS** (Business Doc) |
| 92 | Monitoring & IR | Operational dashboards | **EXTERNAL_OPS** (SIEM/Grafana) |
| 93 | Monitoring & IR | Centralized monitoring | **EXTERNAL_OPS** (SIEM/IDS/IPS) |
| 94 | Monitoring & IR | On-call alerting | **EXTERNAL_OPS** (PagerDuty) |
| 95 | Monitoring & IR | Incident response runbook | **EXTERNAL_OPS** (Security Doc) |
| 96 | Monitoring & IR | Breach notification procedure | **EXTERNAL_OPS** (Legal Doc) |
| 97 | Resilience | Horizontal scaling | **EXTERNAL_INFRA** (Cloud Native) |
| 98 | Resilience | Load balancing | **EXTERNAL_INFRA** (Cloud Native) |
| 99 | Resilience | Database replication | **EXTERNAL_INFRA** (Cloud Native) |
| 100 | Resilience | CDN strategy | **EXTERNAL_INFRA** (Cloud Native) |
| 101 | Resilience | Encrypted backups | **EXTERNAL_INFRA** (Cloud Native) |
| 102 | Resilience | Restore testing | **EXTERNAL_OPS** (Manual Check) |
| 103 | Resilience | Regional failover strategy | **EXTERNAL_INFRA** (Cloud Native) |
| 104 | Resilience | Capacity and load testing | **APP_DEVELOPMENT** |
| 105 | SDLC | Secrets not in code | **APP_DEVELOPMENT** (Process) |
| 106 | SDLC | Dependency scanning | **EXTERNAL_OPS** (GitHub/Snyk) |
| 107 | SDLC | Build / release signing | **EXTERNAL_OPS** (CI/CD) |
| 108 | SDLC | Environment separation | **EXTERNAL_INFRA** (Dev/Prod Projects) |
| 109 | SDLC | Container image scanning | **EXTERNAL_OPS** |
| 110 | SDLC | SBOM | **EXTERNAL_OPS** |
| 111 | SDLC | Secure CI/CD pipeline | **EXTERNAL_OPS** |
| 112 | SDLC | Secure coding standard | **APP_DEVELOPMENT** (Process) |
| 113 | Network | HTTPS + HSTS | **EXTERNAL_INFRA** (SSL/Cert) |
| 114 | Network | WAF | **EXTERNAL_OPS** (Cloud Armor/WAF tool) |
| 115 | Network | DDoS protection | **EXTERNAL_INFRA** (GCP Shield) |
| 116 | Network | Firewall policy | **EXTERNAL_INFRA** (VPC Rules) |
| 117 | Network | Private networking | **EXTERNAL_INFRA** |
| 118 | Key Mgmt | KMS-backed encryption keys | **APP_DEVELOPMENT** (KMS Integration) |
| 119 | Key Mgmt | Key rotation policy | **EXTERNAL_OPS** (Policy) |
| 120 | Key Mgmt | Secrets manager | **APP_DEVELOPMENT** (Integration) |
| 121 | Key Mgmt | Least-privilege service accounts | **EXTERNAL_INFRA** (IAM) |
| 122 | Mobile | Secure local storage | **APP_DEVELOPMENT** |
| 123 | Mobile | Root / jailbreak awareness | **APP_DEVELOPMENT** |
| 124 | Mobile | Certificate pinning | **APP_DEVELOPMENT** |
| 125 | Mobile | Universal / app links validation | **APP_DEVELOPMENT** |
| 126 | Mobile | Minimum version enforcement | **APP_DEVELOPMENT** |
| 127 | Abuse | Brute-force protection | **EXTERNAL_OPS** (Cloud Armor/WAF tool) |
| 128 | Abuse | Voice abuse controls | **EXTERNAL_OPS** (Cloud Armor/WAF tool) |
| 129 | Abuse | Spam detection | **EXTERNAL_OPS** (Cloud Armor/WAF tool) |
| 130 | Abuse | User reporting and blocking | **EXTERNAL_OPS** (Cloud Armor/WAF tool) |
| 131 | Assurance | Penetration test | **EXTERNAL_OPS** (Third-party) |
| 132 | Assurance | Vulnerability disclosure | **EXTERNAL_OPS** (Policy) |
| 133 | Assurance | Security contact | **EXTERNAL_OPS** (Policy) |
| 134 | Assurance | ISO 27001 alignment | **EXTERNAL_OPS** (Policy) |
| 135 | Assurance | OWASP ASVS alignment | **EXTERNAL_OPS** (Policy) |

### Summary of Coverage
- **App Development**: ~105/137 points involving UI, Backend Logic, RTDB Rules, and Firebase Functions.
- **External/Ops/Infra**: ~32/137 points involving Cloud Platform features, Legal Docs, SOC tools (IDS/IPS), and manual security processes.
