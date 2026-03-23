# Gmail Send API

A lightweight Google Apps Script API for sending HTML emails programmatically via the script owner's Gmail account. Exposes a POST endpoint to send mail and a GET endpoint for health checks. Key-authenticated.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [GET /exec — Health Check](#get-exec--health-check)
  - [POST /exec — Send Email](#post-exec--send-email)
- [Parameters](#parameters)
  - [Required](#required)
  - [Optional](#optional)
- [Response Format](#response-format)
  - [Success](#success)
  - [Errors](#errors)
- [Sample Requests](#sample-requests)
  - [cURL](#curl)
  - [JavaScript (fetch)](#javascript-fetch)
  - [Next.js / Node.js](#nextjs--nodejs)
- [Validation Rules](#validation-rules)
- [Limitations](#limitations)
- [Deployment](#deployment)
- [Rotating API Keys](#rotating-api-keys)

---

## Overview

- Emails are always sent **from the Google account that owns and deployed the script** — the caller cannot spoof the sender address.
- The `from_alias` parameter controls the **display name** shown to recipients, not the underlying address.
- Request body must be `application/x-www-form-urlencoded`. JSON bodies are not supported (GAS limitation).
- All responses are `application/json`. However, due to a Google Apps Script limitation, **every response returns HTTP 200 at the transport level** regardless of outcome. Inspect the `status` field in the response body to determine the actual result.

---

## Authentication

Every request must include a valid API key passed as a parameter named `key`.

```
key=your_api_key_here
```

- On `GET` requests, pass it as a query parameter.
- On `POST` requests, pass it in the request body alongside other parameters.

There is no bearer token, no OAuth, and no session — just the key on every request. Treat your keys as secrets. Do not commit them to version control.

---

## Endpoints

Base URL:
```
https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
```

### GET /exec — Health Check

Confirms the API is live and reachable. Does not send any email.

**Requires:** `key`

**Example:**
```
GET https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?key=xxxxx
```

**Success response:**
```json
{
  "status": 200,
  "success": true,
  "message": "API is healthy.",
  "timestamp": "2025-03-23T10:00:00.000Z"
}
```

---

### POST /exec — Send Email

Sends an HTML email from the script owner's Gmail account to the specified recipient.

**Requires:** `key`, `to_email`, `email_body`

**Content-Type:** `application/x-www-form-urlencoded`

---

## Parameters

### Required

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | string | API key for authentication. |
| `to_email` | string | Recipient email address. Must be a valid RFC 5321 address. Maximum 254 characters. |
| `email_body` | string | HTML body of the email. Plain text is automatically derived from this for clients that don't render HTML. Maximum 1MB. |

### Optional

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `email_subject` | string | `"No Subject"` | Subject line of the email. Maximum 998 characters (RFC 2822 header line limit). |
| `from_alias` | string | *(account name)* | Display name shown to the recipient as the sender. Does not change the actual sending address. |
| `cc` | string | *(none)* | CC recipient(s). For multiple addresses, pass a comma-separated string e.g. `a@x.com,b@x.com`. Each address is individually validated. |
| `bcc` | string | *(none)* | BCC recipient(s). Same format as `cc`. Recipients are hidden from each other and from `to_email`. |

---

## Response Format

All responses follow this structure:

```json
{
  "status": <number>,
  "success": <boolean>,
  "message": "<string>"
}
```

> ⚠️ Google Apps Script always returns HTTP 200 at the transport level. You must read the `status` field in the JSON body — not the HTTP status code — to determine whether the request succeeded or failed.

### Success

| status | success | Scenario |
|--------|---------|----------|
| `200` | `true` | Email sent successfully (POST) or API is healthy (GET). |

### Errors

| status | success | Scenario |
|--------|---------|----------|
| `400` | `false` | Missing or invalid parameters. The `message` field describes which parameter failed. |
| `401` | `false` | API key missing or not recognised. |
| `500` | `false` | Unexpected server-side error. The `message` and `error` fields contain details. |

**Example error response:**
```json
{
  "status": 401,
  "success": false,
  "message": "Unauthorized: Invalid API key."
}
```

---

## Sample Requests

### cURL

**Health check:**
```bash
curl -L "https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec?key=xxxxx"
```

**Send a basic email:**
```bash
curl -L -X POST "https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "key=xxxxx" \
  --data-urlencode "to_email=recipient@example.com" \
  --data-urlencode "email_subject=Hello from the API" \
  --data-urlencode "email_body=<h1>Hello</h1><p>This is a test email.</p>"
```

**Send with all optional parameters:**
```bash
curl -L -X POST "https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "key=xxxxx" \
  --data-urlencode "to_email=recipient@example.com" \
  --data-urlencode "email_subject=Hello from the API" \
  --data-urlencode "email_body=<h1>Hello</h1><p>This is a test email.</p>" \
  --data-urlencode "from_alias=My App" \
  --data-urlencode "cc=cc-recipient@example.com" \
  --data-urlencode "bcc=bcc-recipient@example.com"
```

> The `-L` flag is required. GAS redirects before executing the script — without it, curl stops at the redirect and returns nothing.

---

### JavaScript (fetch)

```js
const response = await fetch(
  'https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      key: 'xxxxx',
      to_email: 'recipient@example.com',
      email_subject: 'Hello from the API',
      email_body: '<h1>Hello</h1><p>This is a test email.</p>',
      from_alias: 'My App',
    }),
    redirect: 'follow', // required — equivalent of curl's -L
  }
);

const data = await response.json();

if (!data.success) {
  console.error(`API error ${data.status}: ${data.message}`);
}
```

---

### Next.js / Node.js

```ts
// lib/sendMail.ts

const GAS_ENDPOINT = process.env.GAS_API_URL!;
const GAS_API_KEY  = process.env.GAS_API_KEY!;

interface MailPayload {
  to_email: string;
  email_body: string;
  email_subject?: string;
  from_alias?: string;
  cc?: string;
  bcc?: string;
}

interface MailResponse {
  status: number;
  success: boolean;
  message: string;
  error?: string;
}

export async function sendMail(payload: MailPayload): Promise<MailResponse> {
  const body = new URLSearchParams({
    key: GAS_API_KEY,
    ...payload,
  });

  const res = await fetch(GAS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'follow',
  });

  const data: MailResponse = await res.json();

  if (!data.success) {
    throw new Error(`Mail API error ${data.status}: ${data.message}`);
  }

  return data;
}
```

Usage:
```ts
await sendMail({
  to_email: 'recipient@example.com',
  email_subject: 'Welcome',
  email_body: '<h1>Welcome aboard</h1>',
  from_alias: 'My App',
});
```

Store credentials in `.env.local`:
```
GAS_API_URL=https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec
GAS_API_KEY=xxxxx
```

---

## Validation Rules

| Field | Rule |
|-------|------|
| `to_email` | Required. Valid email format. Max 254 characters. |
| `email_body` | Required. Max 1MB. |
| `email_subject` | Optional. Max 998 characters. |
| `cc` / `bcc` | Optional. Each address in the comma-separated list must be individually valid. |
| `from_alias` | Optional. No format restriction, passed directly to GmailApp. |
| `key` | Required. Must exactly match one of the configured API keys. |

---

## Limitations

| Limitation | Detail |
|------------|--------|
| **Always HTTP 200** | GAS cannot set HTTP response codes. Check `status` in the response body. |
| **Key in request body** | GAS does not support custom request headers, so the API key travels in the body/query rather than an `Authorization` header. Use HTTPS at all times (GAS enforces this). |
| **Sender address is fixed** | Emails always originate from the account that deployed the script. `from_alias` changes the display name only. |
| **No JSON body support** | `e.parameter` in GAS only parses `application/x-www-form-urlencoded`. Sending `Content-Type: application/json` will result in all parameters being null and a 400 error. |
| **GAS quotas** | Gmail via Apps Script is subject to [Google's daily sending quotas](https://developers.google.com/apps-script/guides/services/quotas). Consumer accounts: 100 emails/day. Workspace accounts: 1,500 emails/day. |
| **Redirect required** | All clients must follow redirects (`-L` in curl, `redirect: 'follow'` in fetch). |

---

## Deployment

1. Open [Google Apps Script](https://script.google.com) and paste the script.
2. Click **Deploy → New deployment**.
3. Set type to **Web app**.
4. Set **Execute as** to `Me` — this is what allows the script to send mail from your account.
5. Set **Who has access** to `Anyone`.
6. Click **Deploy** and approve the Gmail permission prompt.
7. Copy the `/exec` URL — that is your base URL.

> **Redeployment:** Changes to the script do not take effect on the live URL automatically. After editing, go to **Deploy → Manage deployments**, edit the existing deployment, and select **New version**. The URL stays the same.

---

## Rotating API Keys

API keys are defined in the `VALID_API_KEYS` array at the top of the script. To rotate:

1. Add the new key to the array.
2. Deploy a new version (see above).
3. Update the key in all clients.
4. Remove the old key from the array.
5. Deploy a new version again.

This two-step rotation ensures zero downtime — the old key stays valid until all clients have switched over.

For better key management in production, consider storing keys in **PropertiesService** instead of hardcoding:

```js
const VALID_API_KEYS = PropertiesService
  .getScriptProperties()
  .getProperty('API_KEYS')
  .split(',');
```

Then set them in **Project Settings → Script Properties** in the Apps Script editor — no redeployment needed when rotating.
