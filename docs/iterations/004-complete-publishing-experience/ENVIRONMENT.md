# Environment

| Variable | Use |
| --- | --- |
| `DATABASE_URL` | Required PostgreSQL connection URL; local service port 5434 |
| `PORT` | API port, defaults to 5051 |
| `APP_ORIGIN` | Exact browser origin, defaults to http://localhost:5175; origin guard and OAuth redirects |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth application credentials |
| `GITHUB_CALLBACK_URL` | Registered provider callback; defaults to APP_ORIGIN/api/auth/github/callback |
| `NODE_ENV` | Set production for Secure cookies and to prohibit local-outbox fallback |
| `TRUST_PROXY` | Optional trusted proxy hop count; configure only for the actual deployment topology |
| `MEDIA_DIR` | Local upload directory; production requires an absolute durable shared mount |
| `SMTP_HOST`, `SMTP_PORT` | SMTP host and port; port defaults to 587 |
| `SMTP_SECURE` | `true` for implicit TLS (typically port 465); otherwise STARTTLS transport |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional SMTP authentication |
| `MAIL_FROM` | SMTP sender identity |
| `MAIL_OUTBOX_DIR` | Explicit development-only private outbox directory when SMTP is absent |

Use an isolated development or test `DATABASE_URL` for integration checks. Tests create unique fixtures and delete only those fixtures afterward. They override media/outbox paths to a temporary directory and control GitHub provider responses.
