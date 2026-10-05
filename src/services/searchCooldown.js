const SEARCH_COOLDOWN_MS = 5 * 60 * 1000;
let disabledUntil = 0;

function startSearchCooldown() {
  disabledUntil = Date.now() + SEARCH_COOLDOWN_MS;
}

function getSearchCooldownRemainingMs() {
  return Math.max(0, disabledUntil - Date.now());
}

module.exports = { startSearchCooldown, getSearchCooldownRemainingMs };
