# STRIDE-lite Threat Model — `<project-name>`

> 30-minute exercise. Not a full security audit — a forcing function to surface the obvious risks before a pen-tester (or an attacker) finds them.

## 1. Asset inventory

| Asset                           | Why an attacker wants it  | Class (public / internal / PII / secret) | Store           |
| ------------------------------- | ------------------------- | ---------------------------------------- | --------------- |
| User emails                     | phishing lists            | PII                                      | Postgres        |
| Session tokens                  | account takeover          | secret                                   | cookies + Redis |
| Document contents               | confidentiality breach    | PII/sensitive                            | S3              |
| API keys (OpenAI, Stripe, etc.) | cost theft, impersonation | secret                                   | secret manager  |

## 2. Trust boundaries (sketch)

<!-- Draw / describe where data crosses a boundary: browser ↔ edge ↔ app ↔ DB ↔ 3rd-party. -->

```
[Browser] --TLS--> [Edge/CDN] --mTLS--> [App] --private net--> [DB]
                                      |
                                      +--> [OpenAI API]   (boundary: data leaves our infra)
```

## 3. STRIDE-lite per boundary

| Threat                     | Where it applies          | Mitigation                                                                  | Owner |
| -------------------------- | ------------------------- | --------------------------------------------------------------------------- | ----- |
| **S**poofing identity      | login, API keys           | strong password + MFA, rotate keys, WebAuthn                                |       |
| **T**ampering with data    | client → API              | server-side validation, signed URLs, idempotency keys                       |       |
| **R**epudiation            | admin actions             | append-only audit log with user id + timestamp                              |       |
| **I**nformation disclosure | logs, error pages, URLs   | strip PII from logs, no stack traces in prod, presigned short-TTL URLs      |       |
| **D**enial of service      | public endpoints          | rate limits, body size limits, WAF, circuit breakers                        |       |
| **E**levation of privilege | role checks, multi-tenant | tenant-scoped queries everywhere, deny-by-default authz, row-level security |       |

## 4. Secrets inventory

| Secret               | Where it lives | Rotation cadence | Who can read |
| -------------------- | -------------- | ---------------- | ------------ |
| DB URL               |                |                  |              |
| OpenAI API key       |                |                  |              |
| JWT signing key      |                |                  |              |
| Third-party webhooks |                |                  |              |

Rules:

- [ ] No secret is in the repo (grep the history).
- [ ] No secret is in a developer's `.env` shared on Slack.
- [ ] Prod secrets are readable only by the app's runtime role.

## 5. Incident response preamble

- Who gets paged first:
- Runbook location:
- Kill switches (feature flags, circuit breakers) in place for: <list>
- Status page:

## 6. Compliance scope (fill if applicable)

- [ ] GDPR — data subject rights flow defined
- [ ] HIPAA — BAAs signed with: <list>
- [ ] SOC2 — scope in progress? Start date?
- [ ] PCI — if no, confirm you never touch raw card data (Stripe Elements, etc.)
