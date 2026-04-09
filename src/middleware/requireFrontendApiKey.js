function getBearerToken(authorizationHeader = "") {
  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

function requireFrontendApiKey(req, res, next) {
  if (req.method === "OPTIONS") {
    return next();
  }

  const expectedApiKey = process.env.FRONTEND_API_AUTH_KEY;

  if (!expectedApiKey) {
    return res.status(503).json({
      success: false,
      error: "FRONTEND_API_AUTH_KEY is not configured on the server",
    });
  }

  const providedApiKey =
    req.get("x-api-key") || getBearerToken(req.get("authorization"));

  if (providedApiKey !== expectedApiKey) {
    return res.status(401).json({
      success: false,
      error: "Invalid or missing API auth key",
    });
  }

  next();
}

module.exports = { requireFrontendApiKey };
