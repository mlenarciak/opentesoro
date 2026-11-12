# Security

OpenTesoro is an early single-organization treasury application. Run it locally or behind a trusted access layer. Default binding is loopback. Remote binding requires a long write token; optional read-only token must differ. API entity filters do not isolate tenants. Bearer tokens grant whole-installation access within their read/write capability.

Use TLS for remote access. Keep `.env`, SQLite files, exports and backups private. Browser tokens are held in sessionStorage and remain accessible to scripts running on the same origin; do not embed untrusted scripts. Browser writes enforce origin checks. This is not a complete identity provider or authorization system.

Financial changes are audited but the audit database is not tamper-proof against a server administrator. SQLite write transactions protect multi-record changes. CSV imports are bounded, previewable and atomic; exports escape spreadsheet-formula text.

The Agicap connector sends OAuth credentials only to the official fixed-origin token endpoint and performs GET-only business reads. It does not execute payments, modify Agicap records or import browser sessions. Never submit login passwords as API credentials.

For a suspected vulnerability, use the repository's private vulnerability-reporting channel if available; avoid public disclosure of credentials, private data or actionable exploit details before a fix is available. Do not treat software output as accounting or tax certification.
