/**
 * ============================================================
 * Gmail Send API — Google Apps Script
 * ============================================================
 * Exposes a POST endpoint to send an email via the Google
 * account this script runs under.
 *
 * Authentication: API key passed as `key` query parameter.
 * Note: GAS does not support custom request headers, so query
 * param is the only viable approach. Treat these keys as
 * secrets and rotate them if exposed.
 *
 * Required POST parameters:
 *   key          {string}  API key
 *   to_email     {string}  Recipient email address
 *   email_body   {string}  HTML body of the email
 *
 * Optional POST parameters:
 *   email_subject {string}  Subject line (default: "No Subject")
 *   from_alias    {string}  Sender alias display name
 *   cc            {string}  CC address(es), comma-separated
 *   bcc           {string}  BCC address(es), comma-separated
 *
 * GET /  — Health check (requires valid key, no other params)
 * ============================================================
 */


// ─── Constants ───────────────────────────────────────────────

/** Add/remove keys here. In production, consider storing these
 *  in PropertiesService instead of hardcoding. */
  const VALID_API_KEYS = ['xxxxxxx', 'yyyyyyyy']; //IMPORTANT: PLEASE MAKE SURE TO REMOVE THE API KEYS BEFORE PUSHING

const LIMITS = {
  EMAIL_MAX_LENGTH: 254,        // RFC 5321
  SUBJECT_MAX_LENGTH: 998,      // RFC 2822
  BODY_MAX_BYTES: 5 * 1024 * 1024, // 5MB — GAS limit is ~20MB but be conservative
};


// ─── Entry Points ─────────────────────────────────────────────

/**
 * POST handler — sends an email if auth + params are valid.
 * @param {GoogleAppsScript.Events.DoPost} e
 */
function doPost(e) {
  try {
    const authError = checkAuth(e);
    if (authError) return authError;

    const params = extractParams(e);
    const validationError = validateMailParams(params);
    if (validationError) return validationError;

    sendMail(params);

    return jsonResponse(200, { success: true, message: 'Email sent successfully.' });

  } catch (err) {
    Logger.log('doPost error: ' + err.message);
    return jsonResponse(500, { success: false, message: 'Internal server error.', error: err.message });
  }
}

/**
 * GET handler — health check endpoint.
 * @param {GoogleAppsScript.Events.DoGet} e
 */
function doGet(e) {
  try {
    const authError = checkAuth(e);
    if (authError) return authError;

    return jsonResponse(200, {
      success: true,
      message: 'API is healthy.',
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return jsonResponse(500, { success: false, message: 'Internal server error.', error: err.message });
  }
}


// ─── Auth ─────────────────────────────────────────────────────

/**
 * Validates the API key from query params.
 * Returns a 401 response if invalid, null if valid.
 * @param {GoogleAppsScript.Events.DoPost|DoGet} e
 * @returns {GoogleAppsScript.Content.TextOutput|null}
 */
function checkAuth(e) {
  const key = safeGet(e, 'key');
  if (!key) {
    return jsonResponse(401, { success: false, message: 'Unauthorized: No API key provided.' });
  }
  if (!VALID_API_KEYS.includes(key)) {
    return jsonResponse(401, { success: false, message: 'Unauthorized: Invalid API key.' });
  }
  return null;
}


// ─── Validation ───────────────────────────────────────────────

/**
 * Validates all mail parameters.
 * Returns a 400 response if invalid, null if valid.
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput|null}
 */
function validateMailParams(params) {
  if (!params.to_email) {
    return jsonResponse(400, { success: false, message: 'Missing required parameter: to_email.' });
  }
  if (!params.email_body) {
    return jsonResponse(400, { success: false, message: 'Missing required parameter: email_body.' });
  }
  if (!isValidEmail(params.to_email)) {
    return jsonResponse(400, { success: false, message: 'Invalid format: to_email.' });
  }
  if (params.to_email.length > LIMITS.EMAIL_MAX_LENGTH) {
    return jsonResponse(400, { success: false, message: 'to_email exceeds maximum length.' });
  }
  if (params.cc && !isValidEmailList(params.cc)) {
    return jsonResponse(400, { success: false, message: 'Invalid format: cc.' });
  }
  if (params.bcc && !isValidEmailList(params.bcc)) {
    return jsonResponse(400, { success: false, message: 'Invalid format: bcc.' });
  }
  if (params.email_subject && params.email_subject.length > LIMITS.SUBJECT_MAX_LENGTH) {
    return jsonResponse(400, { success: false, message: 'email_subject exceeds maximum length.' });
  }
  if (params.email_body.length > LIMITS.BODY_MAX_BYTES) {
    return jsonResponse(400, { success: false, message: 'email_body exceeds maximum size (1MB).' });
  }
  return null;
}

/**
 * Basic RFC-aligned email format check.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim());
}

/**
 * Validates a comma-separated list of emails.
 * @param {string} list
 * @returns {boolean}
 */
function isValidEmailList(list) {
  return list.split(',').map(s => s.trim()).every(isValidEmail);
}


// ─── Mail ─────────────────────────────────────────────────────

/**
 * Extracts and normalises mail parameters from the request.
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {Object}
 */
function extractParams(e) {
  return {
    to_email:      safeGet(e, 'to_email'),
    email_body:    safeGet(e, 'email_body'),
    email_subject: safeGet(e, 'email_subject') || 'No Subject',
    from_alias:    safeGet(e, 'from_alias')    || '',
    cc:            safeGet(e, 'cc')            || '',
    bcc:           safeGet(e, 'bcc')           || '',
  };
}

/**
 * Sends an email via GmailApp using the script owner's account.
 * @param {Object} params - Validated mail parameters.
 */
function sendMail(params) {
  const options = {
    htmlBody: params.email_body,
    ...(params.from_alias && { name: params.from_alias }),
    ...(params.cc         && { cc: params.cc }),
    ...(params.bcc        && { bcc: params.bcc }),
  };

  GmailApp.sendEmail(
    params.to_email,
    params.email_subject,
    // GmailApp requires a plain text fallback — strip tags for it
    stripHtml(params.email_body),
    options
  );
}

/**
 * Strips HTML tags to produce a plain text fallback.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}


// ─── Helpers ──────────────────────────────────────────────────

/**
 * Safely retrieves a parameter from the request, returning
 * null if missing, undefined, or blank.
 * @param {Object} e
 * @param {string} key
 * @returns {string|null}
 */
function safeGet(e, key) {
  if (!e || !e.parameter) return null;
  const val = e.parameter[key];
  if (val === undefined || val === null) return null;
  const trimmed = String(val).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Builds a JSON ContentService response.
 * Note: GAS does not support custom HTTP status codes in the
 * response object — the status is included in the body only.
 * Callers should inspect `success` to determine outcome.
 * @param {number} status  - Semantic HTTP status code (included in body)
 * @param {Object} payload - Response data
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function jsonResponse(status, payload) {
  const body = JSON.stringify({ status, ...payload });
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}
