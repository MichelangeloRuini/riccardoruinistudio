const {
  HttpError,
  assertAllowedOrigin,
  assertMethod,
  parseJsonBody,
  rateLimitHash,
  requestSupabase,
  sendError,
  sendJson
} = require("./_lib/server");

const SERVICE_OPTIONS = new Set([
  "Creative Direction",
  "Brand Identity",
  "Campaigns",
  "Films & Content",
  "Events & Experiences",
  "Publishing",
  "Other"
]);
const BUDGET_OPTIONS = new Set([
  "Under €10K",
  "€10K–25K",
  "€25K–50K",
  "€50K–100K",
  "€100K+",
  "Prefer not to say"
]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanString(value, maxLength, { required = false } = {}) {
  if (value === undefined || value === null) value = "";
  if (typeof value !== "string") return { error: true };
  const normalized = value.trim().replace(/\r\n?/g, "\n");
  if ((required && !normalized) || normalized.length > maxLength) return { error: true };
  return { value: normalized || null };
}

function validateInquiry(body) {
  const name = cleanString(body.name, 120, { required: true });
  const email = cleanString(body.email, 254, { required: true });
  const company = cleanString(body.company, 200);
  const service = cleanString(body.service, 64);
  const description = cleanString(body.description, 5000, { required: true });
  const budget = cleanString(body.budget, 64);
  const website = cleanString(body.website, 200);

  if ([name, email, company, service, description, budget, website].some(field => field.error)) {
    throw new HttpError(400, "invalid_fields", "Please check the submitted fields and try again.");
  }
  if (website.value) {
    throw new HttpError(400, "invalid_submission", "The inquiry could not be submitted.");
  }

  const normalizedEmail = email.value.toLowerCase();
  if (!EMAIL_PATTERN.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new HttpError(400, "invalid_email", "Please enter a valid email address.");
  }
  if (service.value && !SERVICE_OPTIONS.has(service.value)) {
    throw new HttpError(400, "invalid_service", "Please select a valid service.");
  }
  if (budget.value && !BUDGET_OPTIONS.has(budget.value)) {
    throw new HttpError(400, "invalid_budget", "Please select a valid budget.");
  }

  return {
    name: name.value,
    email: normalizedEmail,
    company: company.value,
    service: service.value,
    description: description.value,
    budget: budget.value
  };
}

async function handler(req, res) {
  try {
    assertMethod(req, ["POST"]);
    assertAllowedOrigin(req);

    if (process.env.PROJECT_INQUIRIES_ENABLED !== "true") {
      throw new HttpError(503, "service_not_active", "Project inquiries are not active yet.");
    }

    const inquiry = validateInquiry(parseJsonBody(req));
    const keyHash = rateLimitHash(req, "project-inquiry");
    const rateLimit = await requestSupabase("/rest/v1/rpc/check_project_inquiry_rate_limit", {
      method: "POST",
      serviceRole: true,
      body: { p_key_hash: keyHash, p_max_requests: 5, p_window_seconds: 900 },
      phase: "project_inquiry_rate_limit"
    });

    if (!rateLimit.ok) {
      throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
    }
    if (rateLimit.data !== true) {
      res.setHeader("Retry-After", "900");
      throw new HttpError(429, "rate_limited", "Too many attempts. Please try again later.");
    }

    const insert = await requestSupabase("/rest/v1/project_inquiries", {
      method: "POST",
      serviceRole: true,
      prefer: "return=minimal",
      body: inquiry,
      phase: "project_inquiry_insert"
    });
    if (!insert.ok) {
      throw new HttpError(500, "internal_error", "The request could not be completed. Please try again.");
    }

    sendJson(res, 201, {
      ok: true,
      message: "THANK YOU. YOUR INQUIRY HAS BEEN RECEIVED."
    });
  } catch (error) {
    sendError(res, error);
  }
}

module.exports = handler;
module.exports._test = { validateInquiry, SERVICE_OPTIONS, BUDGET_OPTIONS };
