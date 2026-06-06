const APP_CONFIG = window.APP_CONFIG || {};
const API_URL = (APP_CONFIG.API_URL || "https://6dc9v9n7sa.execute-api.us-east-2.amazonaws.com").replace(/\/$/, "");
const AUTH_STORAGE_KEY = "todoApp_authTokens";
const AUTH_PKCE_KEY = "todoApp_pkce";
const AUTH_STATE_KEY = "todoApp_oauthState";
const COGNITO_DOMAIN = (APP_CONFIG.COGNITO_DOMAIN || "").replace(/\/$/, "");
const COGNITO_CLIENT_ID = APP_CONFIG.COGNITO_CLIENT_ID || "";
const COGNITO_REDIRECT_URI = APP_CONFIG.COGNITO_REDIRECT_URI || window.location.origin + window.location.pathname;
const COGNITO_LOGOUT_URI = APP_CONFIG.COGNITO_LOGOUT_URI || window.location.origin + window.location.pathname;
const COGNITO_SCOPES = Array.isArray(APP_CONFIG.COGNITO_SCOPES)
  ? APP_CONFIG.COGNITO_SCOPES
  : ["openid", "email", "profile"];
const authConfigured = Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID);

const TASK_FILTER_KEY = "todoApp_taskFilter";
const THEME_KEY = "todoApp_theme";
let authState = { tokens: null, claims: null };

let taskFilter = "all";
try {
  const tf = localStorage.getItem(TASK_FILTER_KEY);
  if (tf === "all" || tf === "active" || tf === "starred") taskFilter = tf;
} catch {
  /* ignore */
}

let cachedNewsItems = [];
let newsSourceFilter = null;
let moviesTab = "now";
let lastMoviesRegion = null;
let moviesLoading = false;
const moviePages = { now: 1, upcoming: 1 };
const moviePageCache = new Map();

function base64UrlEncode(bytes) {
  const raw = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function tokenExpired(claims, skewSeconds = 60) {
  if (!claims || typeof claims.exp !== "number") return true;
  return claims.exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

function saveAuth(tokens) {
  authState.tokens = tokens;
  authState.claims = decodeJwtPayload(tokens.id_token || tokens.access_token || "");
  sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(tokens));
}

function loadStoredAuth() {
  try {
    const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const tokens = JSON.parse(raw);
    if (!tokens || !tokens.access_token) return false;
    authState.tokens = tokens;
    authState.claims = decodeJwtPayload(tokens.id_token || tokens.access_token);
    return !tokenExpired(decodeJwtPayload(tokens.access_token), 0);
  } catch {
    return false;
  }
}

function clearAuth() {
  authState = { tokens: null, claims: null };
  sessionStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_PKCE_KEY);
  sessionStorage.removeItem(AUTH_STATE_KEY);
}

function showAuthError(msg) {
  const el = document.getElementById("authError");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearAuthError() {
  const el = document.getElementById("authError");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

function renderSignedOut(message) {
  const panel = document.getElementById("authPanel");
  const content = document.getElementById("dashboardContent");
  const userEl = document.getElementById("authUser");
  const signInBtn = document.getElementById("authSignIn");
  const signOutBtn = document.getElementById("authSignOut");
  if (panel) panel.hidden = false;
  if (content) content.hidden = true;
  if (userEl) userEl.textContent = authConfigured ? "Signed out" : "Auth not configured";
  if (signInBtn) signInBtn.hidden = false;
  if (signOutBtn) signOutBtn.hidden = true;
  if (!authConfigured) {
    showAuthError("Cognito is not configured. Fill frontend/config.js with Cognito domain and client ID.");
  } else if (message) {
    showAuthError(message);
  }
}

function renderSignedIn() {
  const panel = document.getElementById("authPanel");
  const content = document.getElementById("dashboardContent");
  const userEl = document.getElementById("authUser");
  const signInBtn = document.getElementById("authSignIn");
  const signOutBtn = document.getElementById("authSignOut");
  const claims = authState.claims || {};
  if (panel) panel.hidden = true;
  if (content) content.hidden = false;
  if (userEl) userEl.textContent = claims.email || claims["cognito:username"] || "Signed in";
  if (signInBtn) signInBtn.hidden = true;
  if (signOutBtn) signOutBtn.hidden = false;
  clearAuthError();
}

async function beginSignIn() {
  clearAuthError();
  if (!authConfigured) {
    renderSignedOut();
    return;
  }
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomBase64Url(24);
  sessionStorage.setItem(AUTH_PKCE_KEY, verifier);
  sessionStorage.setItem(AUTH_STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: COGNITO_CLIENT_ID,
    redirect_uri: COGNITO_REDIRECT_URI,
    scope: COGNITO_SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256"
  });
  window.location.assign(`${COGNITO_DOMAIN}/oauth2/authorize?${params}`);
}

async function exchangeToken(params) {
  const res = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "Token exchange failed");
  }
  return data;
}

async function completeAuthRedirect() {
  if (!authConfigured) return false;
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) {
    showAuthError(url.searchParams.get("error_description") || error);
    return false;
  }
  if (!code) return false;

  const expectedState = sessionStorage.getItem(AUTH_STATE_KEY);
  const verifier = sessionStorage.getItem(AUTH_PKCE_KEY);
  if (!expectedState || expectedState !== state || !verifier) {
    clearAuth();
    showAuthError("Could not verify the sign-in response. Please try again.");
    return false;
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: COGNITO_REDIRECT_URI,
    code_verifier: verifier
  });
  const tokens = await exchangeToken(body);
  saveAuth(tokens);
  sessionStorage.removeItem(AUTH_PKCE_KEY);
  sessionStorage.removeItem(AUTH_STATE_KEY);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  return true;
}

async function refreshTokens() {
  if (!authConfigured || !authState.tokens?.refresh_token) return false;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: COGNITO_CLIENT_ID,
    refresh_token: authState.tokens.refresh_token
  });
  const next = await exchangeToken(body);
  saveAuth({ ...authState.tokens, ...next });
  return true;
}

async function getAccessToken() {
  if (!authState.tokens && !loadStoredAuth()) return null;
  const accessClaims = decodeJwtPayload(authState.tokens.access_token);
  if (!tokenExpired(accessClaims)) return authState.tokens.access_token;
  try {
    const refreshed = await refreshTokens();
    return refreshed ? authState.tokens.access_token : null;
  } catch {
    clearAuth();
    renderSignedOut("Your session expired. Please sign in again.");
    return null;
  }
}

async function authenticatedFetch(url, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    renderSignedOut("Sign in to continue.");
    throw new Error("Authentication required");
  }
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    clearAuth();
    renderSignedOut("Your session is no longer valid. Please sign in again.");
  }
  return res;
}

function apiFetch(path, options) {
  return authenticatedFetch(`${API_URL}${path}`, options);
}

function authenticatedFetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return authenticatedFetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function signOut() {
  clearAuth();
  renderSignedOut();
  if (authConfigured) {
    const params = new URLSearchParams({
      client_id: COGNITO_CLIENT_ID,
      logout_uri: COGNITO_LOGOUT_URI
    });
    window.location.assign(`${COGNITO_DOMAIN}/logout?${params}`);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getMovieRegion() {
  const city = getSavedWeatherCity();
  const code = city && typeof city.countryCode === "string" ? city.countryCode.trim().toUpperCase() : "";
  return /^[A-Z]{2}$/.test(code) ? code : "CA";
}

function getMovieCacheKey(region, category, page) {
  return `${region}:${category}:${page}`;
}

function getActiveMoviePage() {
  return moviePages[moviesTab] || 1;
}

function getActiveMoviePayload() {
  const region = getMovieRegion();
  return moviePageCache.get(getMovieCacheKey(region, moviesTab, getActiveMoviePage())) || null;
}

function renderMovieCard(row) {
  const title = escapeHtml(row.title || "Untitled");
  const url = escapeHtml(row.tmdbUrl || "#");
  const poster = row.posterUrl
    ? `<img class="movie-poster" src="${escapeHtml(row.posterUrl)}" alt="" loading="lazy" />`
    : '<div class="movie-poster movie-poster-fallback" aria-hidden="true">🎬</div>';
  const release = row.releaseDate ? `<span>${escapeHtml(row.releaseDate)}</span>` : "";
  const rating = row.rating != null ? `<span>★ ${escapeHtml(String(row.rating))}</span>` : "";
  const overview = row.overview
    ? `<p class="movie-overview">${escapeHtml(row.overview)}</p>`
    : '<p class="movie-overview muted">No synopsis available.</p>';

  return `
    <a class="movie-card" href="${url}" target="_blank" rel="noopener noreferrer">
      ${poster}
      <div class="movie-info">
        <h3 class="movie-title">${title}</h3>
        <div class="movie-meta muted">${release}${rating}</div>
        ${overview}
      </div>
    </a>`;
}

function syncMovieTabs() {
  document.querySelectorAll("[data-movies-tab]").forEach(btn => {
    const active = btn.getAttribute("data-movies-tab") === moviesTab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  const mount = document.getElementById("moviesMount");
  if (mount) {
    mount.setAttribute("aria-labelledby", moviesTab === "now" ? "moviesTabNow" : "moviesTabUpcoming");
  }
}

function renderMoviesFromCache() {
  const mount = document.getElementById("moviesMount");
  const pageLabel = document.getElementById("moviesPageLabel");
  const prevBtn = document.getElementById("moviesPrev");
  const nextBtn = document.getElementById("moviesNext");
  const payload = getActiveMoviePayload();
  if (!mount || !payload) return;
  syncMovieTabs();

  const items = Array.isArray(payload.items) ? payload.items : [];
  const page = Number(payload.page || getActiveMoviePage());
  const totalPages = Math.max(1, Number(payload.totalPages || page));
  moviePages[moviesTab] = page;

  if (pageLabel) pageLabel.textContent = `Page ${page} of ${totalPages}`;
  if (prevBtn) prevBtn.disabled = moviesLoading || page <= 1;
  if (nextBtn) nextBtn.disabled = moviesLoading || page >= totalPages;

  if (!items.length) {
    mount.innerHTML = '<p class="movies-panel-note muted">No movies found for this region right now.</p>';
    return;
  }
  mount.innerHTML = items.map(renderMovieCard).join("");
}

function setMoviePaginationLoading(isLoading) {
  moviesLoading = isLoading;
  const prevBtn = document.getElementById("moviesPrev");
  const nextBtn = document.getElementById("moviesNext");
  if (prevBtn) prevBtn.disabled = true;
  if (nextBtn) nextBtn.disabled = true;
}

async function loadMovies(options = {}) {
  const mount = document.getElementById("moviesMount");
  const regionEl = document.getElementById("moviesRegion");
  if (!mount) return;

  const region = getMovieRegion();
  if (region !== lastMoviesRegion) {
    moviePages.now = 1;
    moviePages.upcoming = 1;
    lastMoviesRegion = region;
  }
  if (regionEl) regionEl.textContent = region === "CA" ? "Canada" : region;
  syncMovieTabs();

  const page = getActiveMoviePage();
  const cacheKey = getMovieCacheKey(region, moviesTab, page);
  if (!options.force && moviePageCache.has(cacheKey)) {
    renderMoviesFromCache();
    return;
  }

  setMoviePaginationLoading(true);
  mount.innerHTML = '<p class="movies-panel-note muted">Loading movies…</p>';

  try {
    const params = new URLSearchParams({
      region,
      category: moviesTab,
      page: String(page)
    });
    const res = await apiFetch(`/movies?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.message || data.error || "Could not load movies.";
      mount.innerHTML = `<p class="movies-panel-error">${escapeHtml(msg)}</p>`;
      return;
    }
    const payload = {
      region: data.region || region,
      category: data.category || moviesTab,
      page: Number(data.page || page),
      totalPages: Number(data.totalPages || 1),
      totalResults: Number(data.totalResults || 0),
      items: Array.isArray(data.items) ? data.items : []
    };
    moviePageCache.set(cacheKey, payload);
    renderMoviesFromCache();
  } catch {
    mount.innerHTML =
      '<p class="movies-panel-error">Network error. Check API URL, CORS, and that <code>GET /movies</code> is configured on API Gateway.</p>';
  } finally {
    setMoviePaginationLoading(false);
    renderMoviesFromCache();
  }
}

document.getElementById("moviesRefresh").addEventListener("click", () => {
  loadMovies({ force: true });
});

document.querySelectorAll("[data-movies-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    const next = btn.getAttribute("data-movies-tab");
    if (next !== "now" && next !== "upcoming") return;
    moviesTab = next;
    loadMovies();
  });
});

document.getElementById("moviesPrev").addEventListener("click", () => {
  moviePages[moviesTab] = Math.max(1, getActiveMoviePage() - 1);
  loadMovies();
});

document.getElementById("moviesNext").addEventListener("click", () => {
  moviePages[moviesTab] = getActiveMoviePage() + 1;
  loadMovies();
});

function showAddError(msg) {
  const el = document.getElementById("addError");
  el.textContent = msg;
  el.hidden = false;
}

function clearAddError() {
  const el = document.getElementById("addError");
  el.textContent = "";
  el.hidden = true;
}

function showTaskListError(msg) {
  const el = document.getElementById("taskListError");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearTaskListError() {
  const el = document.getElementById("taskListError");
  if (!el) return;
  el.textContent = "";
  el.hidden = true;
}

function renderTaskListLoading() {
  const list = document.getElementById("taskList");
  if (!list) return;
  list.innerHTML = '<li class="task-list-loading" role="status">Loading tasks…</li>';
}

async function readApiErrorMessage(res, fallback) {
  try {
    const data = await res.json();
    return (data && (data.message || data.error)) || fallback;
  } catch {
    return fallback;
  }
}

const WEATHER_STORAGE_KEY = "todoApp_weatherCity";
const DEFAULT_WEATHER_CITY = {
  lat: 43.6532,
  lon: -79.3832,
  label: "Toronto, Ontario, Canada",
  countryCode: "CA"
};

function getSavedWeatherCity() {
  try {
    const raw = localStorage.getItem(WEATHER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o == null || typeof o.lat !== "number" || typeof o.lon !== "number" || !o.label) return null;
    return o;
  } catch {
    return null;
  }
}

function saveWeatherCity(loc) {
  localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(loc));
}

function formatGeocodeResult(r) {
  const parts = [r.name];
  if (r.admin1) parts.push(r.admin1);
  parts.push(r.country || "");
  return parts.filter(Boolean).join(", ");
}

async function searchCities(query) {
  const q = query.trim();
  if (!q) return [];
  const lang = /[\u3400-\u9FFF\u3040-\u30FF]/.test(q) ? "zh" : "en";
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(q) +
    "&count=10&language=" +
    lang +
    "&format=json";
  const res = await fetch(url);
  if (!res.ok) throw new Error("City search failed");
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function reverseGeocodeLocation(lat, lon) {
  const ctrl = new AbortController();
  const timeoutMs = 4500;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const params = new URLSearchParams({
    format: "jsonv2",
    lat: String(lat),
    lon: String(lon),
    zoom: "10",
    addressdetails: "1"
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
    headers: {
      Accept: "application/json"
    },
    signal: ctrl.signal
  }).finally(() => clearTimeout(t));
  if (!res.ok) throw new Error("Reverse geocoding failed");
  const data = await res.json();
  const addr = data && typeof data.address === "object" ? data.address : {};

  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
  const state = addr.state || "";
  const country = addr.country || "";
  const label = [city, state, country].filter(Boolean).join(", ");
  const countryCode = (addr.country_code || "").toUpperCase();

  return {
    label: label || "Current location",
    countryCode
  };
}

function hideCityResults() {
  const ul = document.getElementById("weatherCityResults");
  ul.classList.remove("is-open");
  ul.innerHTML = "";
}

function showCityResults(results) {
  const ul = document.getElementById("weatherCityResults");
  ul.innerHTML = "";
  if (!results.length) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "No cities found. Try another spelling.";
    btn.disabled = true;
    li.appendChild(btn);
    ul.appendChild(li);
    ul.classList.add("is-open");
    return;
  }
  results.forEach(r => {
    const label = formatGeocodeResult(r);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.textContent = label;
    btn.onclick = () => {
      const loc = {
        lat: r.latitude,
        lon: r.longitude,
        label,
        countryCode: (r.country_code || "").toUpperCase()
      };
      saveWeatherCity(loc);
      hideCityResults();
      document.getElementById("weatherCitySearch").value = "";
      loadWeatherForCity(loc);
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
  ul.classList.add("is-open");
}

async function runCitySearch() {
  const input = document.getElementById("weatherCitySearch");
  const btn = document.getElementById("weatherCitySearchBtn");
  const q = input.value.trim();
  if (!q) {
    hideCityResults();
    return;
  }
  btn.disabled = true;
  try {
    const results = await searchCities(q);
    showCityResults(results);
  } catch {
    const ul = document.getElementById("weatherCityResults");
    ul.innerHTML = "";
    const li = document.createElement("li");
    const errBtn = document.createElement("button");
    errBtn.type = "button";
    errBtn.textContent = "Search failed. Check your connection.";
    errBtn.disabled = true;
    li.appendChild(errBtn);
    ul.appendChild(li);
    ul.classList.add("is-open");
  } finally {
    btn.disabled = false;
  }
}

function decodeWmo(code) {
  if (code == null || Number.isNaN(code)) return { icon: "☁", text: "—" };
  const c = Number(code);
  if (c === 0) return { icon: "☀", text: "Clear" };
  if (c === 1) return { icon: "◐", text: "Mostly clear" };
  if (c === 2) return { icon: "⛅", text: "Partly cloudy" };
  if (c === 3) return { icon: "☁", text: "Overcast" };
  if (c >= 45 && c <= 48) return { icon: "≋", text: "Fog" };
  if (c >= 51 && c <= 57) return { icon: "⌇", text: "Drizzle" };
  if (c >= 61 && c <= 67) return { icon: "☂", text: "Rain" };
  if (c >= 71 && c <= 77) return { icon: "❄", text: "Snow" };
  if (c >= 80 && c <= 82) return { icon: "☂", text: "Showers" };
  if (c >= 85 && c <= 86) return { icon: "❄", text: "Snow showers" };
  if (c >= 95 && c <= 99) return { icon: "⚡", text: "Thunderstorm" };
  return { icon: "☁", text: "Current conditions" };
}

const WEATHER_MOOD_CLASSES = [
  "weather-clear",
  "weather-rain",
  "weather-snow",
  "weather-cloudy",
  "weather-storm"
];

function getWeatherMoodClass(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return "weather-cloudy";
  if (c === 0 || c === 1) return "weather-clear";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "weather-rain";
  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return "weather-snow";
  if (c >= 95 && c <= 99) return "weather-storm";
  return "weather-cloudy";
}

function getWeatherFxType(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return "none";
  if (c === 0 || c === 1) return "clear";
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return "rain";
  if ((c >= 71 && c <= 77) || (c >= 85 && c <= 86)) return "snow";
  if (c >= 95 && c <= 99) return "storm";
  return "none";
}

function getWeatherFxIntensity(code) {
  const c = Number(code);
  if (Number.isNaN(c)) return 1;
  if (c >= 51 && c <= 57) return 0.5;
  if (c >= 80 && c <= 82) return 1.2;
  if (c >= 95 && c <= 99) return 1.4;
  return 1;
}

function setWeatherMood(widget, code) {
  if (!widget) return;
  widget.classList.remove(...WEATHER_MOOD_CLASSES);
  if (code == null) {
    if (window.WeatherFx) window.WeatherFx.stop();
    return;
  }
  widget.classList.add(getWeatherMoodClass(code));
  if (window.WeatherFx) {
    window.WeatherFx.start(getWeatherFxType(code), getWeatherFxIntensity(code));
  }
}

function getGeoPosition(ms) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"));
      return;
    }
    const t = setTimeout(() => reject(new Error("Location timeout")), ms);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(t);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: "Your location" });
      },
      err => {
        clearTimeout(t);
        reject(err);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: ms }
    );
  });
}

function formatForecastDayLabel(dateStr, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

function renderWeatherForecast(daily) {
  const mount = document.getElementById("weatherForecast");
  if (!mount) return;
  if (!daily || !Array.isArray(daily.time) || !daily.time.length) {
    mount.innerHTML = "";
    return;
  }
  const days = daily.time.slice(0, 5);
  mount.innerHTML = days
    .map((dateStr, i) => {
      const code = daily.weather_code?.[i];
      const max = daily.temperature_2m_max?.[i];
      const min = daily.temperature_2m_min?.[i];
      const { icon } = decodeWmo(code);
      const label = escapeHtml(formatForecastDayLabel(dateStr, i));
      const hi =
        max != null && !Number.isNaN(Number(max))
          ? `${Math.round(Number(max))}°`
          : "—";
      const lo =
        min != null && !Number.isNaN(Number(min))
          ? `${Math.round(Number(min))}°`
          : "—";
      return `
        <div class="weather-forecast-day">
          <div class="weather-forecast-label">${label}</div>
          <div class="weather-forecast-icon" aria-hidden="true">${icon}</div>
          <div class="weather-forecast-temps">
            <span class="weather-forecast-hi">${hi}</span>
            <span class="weather-forecast-lo muted">${lo}</span>
          </div>
        </div>`;
    })
    .join("");
}

async function fetchOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    daily: ["weather_code", "temperature_2m_max", "temperature_2m_min"].join(","),
    forecast_days: "5",
    wind_speed_unit: "kmh",
    timezone: "auto"
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error("Weather API error");
  return res.json();
}

async function loadWeatherForCity(coords) {
  const widget = document.getElementById("weatherWidget");
  const btn = document.getElementById("weatherRefresh");
  const elTemp = document.getElementById("weatherTemp");
  const elDesc = document.getElementById("weatherDesc");
  const elDetails = document.getElementById("weatherDetails");
  const elLoc = document.getElementById("weatherLocation");
  const elUpdated = document.getElementById("weatherUpdated");
  const elEmoji = document.getElementById("weatherEmoji");

  const titleEl = document.getElementById("weatherCardTitle");

  if (!coords) {
    widget.classList.remove("is-error");
    setWeatherMood(widget, null);
    if (titleEl) titleEl.textContent = "Weather";
    elEmoji.textContent = "☁";
    elTemp.textContent = "—";
    elDesc.textContent = "Search for a city to see the forecast";
    elDetails.textContent = "";
    elLoc.textContent = "";
    elUpdated.textContent = "";
    const elForecast = document.getElementById("weatherForecast");
    if (elForecast) elForecast.innerHTML = "";
    return;
  }

  widget.classList.remove("is-error");
  if (window.WeatherFx) window.WeatherFx.stop();
  btn.disabled = true;
  elDesc.textContent = "Loading…";
  if (titleEl) {
    const cityLabel = (coords.label || "").replace(/\s*(天气|Weather)\s*$/i, "").trim();
    titleEl.textContent = cityLabel ? `${cityLabel} weather` : "Weather";
  }
  elDetails.textContent = "";
  elUpdated.textContent = "";
  elLoc.textContent = coords.label;
  const elForecastLoading = document.getElementById("weatherForecast");
  if (elForecastLoading) elForecastLoading.innerHTML = "";

  try {
    const data = await fetchOpenMeteo(coords.lat, coords.lon);
    const cur = data.current;
    if (!cur) throw new Error("No current data");

    const { icon, text } = decodeWmo(cur.weather_code);
    elEmoji.textContent = icon;
    elTemp.textContent = Math.round(cur.temperature_2m * 10) / 10;
    elDesc.textContent = text;
    setWeatherMood(widget, cur.weather_code);

    const hum = cur.relative_humidity_2m != null ? `Humidity ${cur.relative_humidity_2m}%` : "";
    const wind = cur.wind_speed_10m != null ? `Wind ${Math.round(cur.wind_speed_10m)} km/h` : "";
    elDetails.innerHTML = [hum, wind]
      .filter(Boolean)
      .map(s => `<span>${s}</span>`)
      .join("");

    const t = cur.time ? new Date(cur.time) : new Date();
    elUpdated.textContent = Number.isNaN(t.getTime())
      ? ""
      : `Updated ${t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;

    renderWeatherForecast(data.daily);
  } catch (e) {
    widget.classList.add("is-error");
    setWeatherMood(widget, null);
    elEmoji.textContent = "☁";
    elTemp.textContent = "—";
    elDesc.textContent = "Could not load weather. Try again.";
    elDetails.textContent = e.message || "";
    elUpdated.textContent = "";
    const elForecastErr = document.getElementById("weatherForecast");
    if (elForecastErr) elForecastErr.innerHTML = "";
  } finally {
    btn.disabled = false;
    if (authState.tokens) loadMovies();
  }
}

function loadWeather() {
  loadWeatherForCity(getSavedWeatherCity() || DEFAULT_WEATHER_CITY);
}

document.getElementById("weatherRefresh").addEventListener("click", () => loadWeather());

document.getElementById("weatherCitySearchBtn").addEventListener("click", () => runCitySearch());

document.getElementById("weatherCitySearch").addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    runCitySearch();
  }
});

document.getElementById("weatherUseLocation").addEventListener("click", async () => {
  const btn = document.getElementById("weatherRefresh");
  const elDesc = document.getElementById("weatherDesc");
  btn.disabled = true;
  elDesc.textContent = "Getting your location…";
  hideCityResults();
  try {
    const pos = await getGeoPosition(12000);
    let place = { label: "Current location", countryCode: "" };
    try {
      place = await reverseGeocodeLocation(pos.lat, pos.lon);
    } catch {
      /* fallback to generic label while still loading weather by coords */
    }
    const loc = { ...pos, label: place.label || "Current location", countryCode: place.countryCode || "" };
    saveWeatherCity(loc);
    await loadWeatherForCity(loc);
  } catch {
    elDesc.textContent = "Could not get location. Search for a city instead.";
    document.getElementById("weatherWidget").classList.add("is-error");
  } finally {
    btn.disabled = false;
  }
});

function syncTaskFilterButtons() {
  document.querySelectorAll("#taskFilterChips .chip, #taskFilterChips .task-filter-btn").forEach(btn => {
    btn.classList.toggle("is-active", btn.getAttribute("data-task-filter") === taskFilter);
  });
}

function setTaskFilter(mode) {
  if (mode !== "all" && mode !== "active" && mode !== "starred") return;
  taskFilter = mode;
  try {
    localStorage.setItem(TASK_FILTER_KEY, mode);
  } catch {
    /* ignore */
  }
  syncTaskFilterButtons();
  loadTasks();
}

document.getElementById("taskFilterChips").addEventListener("click", e => {
  const btn = e.target.closest(".chip, .task-filter-btn");
  if (!btn) return;
  setTaskFilter(btn.getAttribute("data-task-filter"));
});

async function loadTasks() {
  const list = document.getElementById("taskList");
  if (!list) return;
  const wrap = list.parentElement;

  clearTaskListError();
  renderTaskListLoading();

  let emptyEl = wrap.querySelector(".empty-state");
  if (emptyEl) emptyEl.remove();

  syncTaskFilterButtons();

  let data;
  try {
    const res = await apiFetch("/tasks");
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg =
        (data && (data.message || data.error)) ||
        "Could not load tasks.";
      showTaskListError(msg);
      list.innerHTML = "";
      return;
    }
    if (!Array.isArray(data)) {
      showTaskListError("Unexpected response from tasks API.");
      list.innerHTML = "";
      return;
    }
  } catch {
    showTaskListError(
      "Network error. Check API URL, CORS, and that GET /tasks is configured."
    );
    list.innerHTML = "";
    return;
  }

  list.innerHTML = "";

  if (!data.length) {
    emptyEl = document.createElement("div");
    emptyEl.className = "empty-state";
    emptyEl.setAttribute("role", "status");
    const t = document.createElement("p");
    t.className = "empty-state-title";
    t.textContent = "Nothing here yet";
    const line = document.createElement("p");
    line.className = "empty-state-line";
    line.textContent = "Add a task above — star what matters, then check it off.";
    emptyEl.appendChild(t);
    emptyEl.appendChild(line);
    wrap.insertBefore(emptyEl, list);
    return;
  }

  const sorted = [...data].sort(
    (a, b) => Number(!!b.starred) - Number(!!a.starred)
  );

  let rows = sorted;
  if (taskFilter === "active") rows = sorted.filter(t => !t.completed);
  else if (taskFilter === "starred") rows = sorted.filter(t => t.starred);

  if (!rows.length) {
    emptyEl = document.createElement("div");
    emptyEl.className = "empty-state";
    emptyEl.setAttribute("role", "status");
    const t = document.createElement("p");
    t.className = "empty-state-title";
    t.textContent =
      taskFilter === "active"
        ? "No active tasks"
        : taskFilter === "starred"
          ? "No starred tasks"
          : "Nothing to show";
    const line = document.createElement("p");
    line.className = "empty-state-line";
    line.textContent =
      taskFilter === "active"
        ? "Everything is done, or switch to All / Starred."
        : taskFilter === "starred"
          ? "Star important items with the star button, or choose another filter."
          : "Try another filter.";
    emptyEl.appendChild(t);
    emptyEl.appendChild(line);
    wrap.insertBefore(emptyEl, list);
    return;
  }

  rows.forEach(task => {
    const li = document.createElement("li");
    li.className = "task-row todo-item" + (task.completed ? " completed" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!task.completed;
    cb.setAttribute("aria-label", "Mark complete");
    cb.onchange = () => setCompleted(task.taskId, cb.checked);

    const starBtn = document.createElement("button");
    starBtn.type = "button";
    starBtn.className = "btn-star" + (task.starred ? " starred" : "");
    starBtn.setAttribute("aria-label", task.starred ? "Unstar" : "Star as important");
    starBtn.setAttribute("aria-pressed", task.starred ? "true" : "false");
    starBtn.textContent = task.starred ? "\u2605" : "\u2606";
    starBtn.onclick = () => setStarred(task.taskId, !task.starred);

    const label = document.createElement("span");
    label.className = "task-title" + (task.completed ? " done" : "");
    label.textContent = task.title;
    label.title = "Double-click to edit";
    if (!task.completed) {
      label.addEventListener("dblclick", e => {
        e.preventDefault();
        startTaskTitleEdit(task.taskId, task.title, li);
      });
    }

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn btn-delete";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => deleteTask(task.taskId, task.title);

    li.appendChild(cb);
    li.appendChild(starBtn);
    li.appendChild(label);
    li.appendChild(delBtn);
    list.appendChild(li);
  });
}

async function setCompleted(id, completed) {
  const res = await apiFetch("/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      op: "setCompleted",
      taskId: id,
      completed
    })
  });
  if (!res.ok) {
    const msg = await readApiErrorMessage(res, "Could not update task.");
    console.error("setCompleted failed", res.status, msg);
    showTaskListError(msg);
  }
  await loadTasks();
}

async function setStarred(id, starred) {
  const res = await apiFetch("/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      op: "setStarred",
      taskId: id,
      starred
    })
  });
  if (!res.ok) {
    const msg = await readApiErrorMessage(res, "Could not update task.");
    console.error("setStarred failed", res.status, msg);
    showTaskListError(msg);
  }
  await loadTasks();
}

async function renameTask(id, title) {
  const res = await apiFetch("/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      op: "rename",
      taskId: id,
      title
    })
  });
  if (!res.ok) {
    const msg = await readApiErrorMessage(res, "Could not rename task.");
    console.error("renameTask failed", res.status, msg);
    showTaskListError(msg);
    return false;
  }
  await loadTasks();
  return true;
}

function startTaskTitleEdit(taskId, currentTitle, rowEl) {
  if (!rowEl || rowEl.querySelector(".task-title-edit")) return;

  const label = rowEl.querySelector(".task-title");
  if (!label) return;

  const originalTitle = currentTitle || "";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "task-title-edit";
  input.value = originalTitle;
  input.setAttribute("aria-label", "Edit task title");

  let finished = false;

  const restoreLabel = title => {
    label.textContent = title;
    if (input.parentElement) input.replaceWith(label);
  };

  const commitEdit = async () => {
    if (finished) return;
    finished = true;

    const nextTitle = input.value.trim();
    if (!nextTitle || nextTitle === originalTitle) {
      restoreLabel(originalTitle);
      return;
    }

    const ok = await renameTask(taskId, nextTitle);
    if (!ok) restoreLabel(originalTitle);
  };

  const cancelEdit = () => {
    if (finished) return;
    finished = true;
    restoreLabel(originalTitle);
  };

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  });
  input.addEventListener("blur", () => commitEdit());

  label.replaceWith(input);
  input.focus();
  input.select();
}

async function addTask() {
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  clearAddError();
  if (!title) return;

  const res = await apiFetch("/tasks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });

  if (!res.ok) {
    let msg = "Could not add this task.";
    try {
      const data = await res.json();
      if (data.message) msg = data.message;
    } catch (_) {
      /* ignore */
    }
    showAddError(msg);
    return;
  }

  input.value = "";
  loadTasks();
}

document.getElementById("taskInput").addEventListener("keydown", e => {
  if (e.key === "Enter") addTask();
});

document.getElementById("taskInput").addEventListener("input", clearAddError);

async function deleteTask(id, title) {
  const label = (title || "").trim() || "this task";
  if (!confirm(`Delete "${label}"?`)) return;

  const res = await apiFetch("/tasks/" + id, {
    method: "DELETE"
  });
  if (!res.ok) {
    const msg = await readApiErrorMessage(res, "Could not delete task.");
    console.error("deleteTask failed", res.status, msg);
    showTaskListError(msg);
    return;
  }

  loadTasks();
}

function formatNewsTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins >= 0 && mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

const CLIENT_NEWS_FEEDS = [
  { rss: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", source: "The New York Times" },
  { rss: "https://www.theguardian.com/world/rss", source: "The Guardian" },
  { rss: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC News" },
  { rss: "https://feeds.washingtonpost.com/rss/world", source: "The Washington Post" },
  { rss: "https://www.ft.com/world?format=rss", source: "Financial Times" },
  { rss: "https://www.xinhuanet.com/english/rss/worldrss.xml", source: "Xinhua" },
  { rss: "https://www.thetimes.co.uk/tto/news/world/rss", source: "The Times" },
  { rss: "https://www.telegraph.co.uk/world-news/rss.xml", source: "The Telegraph" }
];

function parseRssXmlString(xmlText, source, maxItems) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  const out = [];
  const nodes = doc.getElementsByTagName("item");
  const n = Math.min(nodes.length, maxItems);
  for (let i = 0; i < n; i++) {
    const item = nodes[i];
    const title =
      item.getElementsByTagName("title")[0]?.textContent?.replace(/\s+/g, " ").trim() || "";
    let link = item.getElementsByTagName("link")[0]?.textContent?.trim() || "";
    if (!link) link = item.getElementsByTagName("guid")[0]?.textContent?.trim() || "";
    const pubRaw = item.getElementsByTagName("pubDate")[0]?.textContent?.trim() || "";
    if (!title || !/^https?:\/\//i.test(link)) continue;
    let published = null;
    const pd = Date.parse(pubRaw);
    if (!Number.isNaN(pd)) published = new Date(pd).toISOString();
    out.push({
      title: title.slice(0, 300),
      url: link,
      source,
      published
    });
  }
  return out;
}

function rssXmlLooksParsable(text) {
  if (!text || text.length < 80) return false;
  const head = text.slice(0, 2500).toLowerCase();
  return (
    head.includes("<rss") ||
    head.includes("<rdf:rdf") ||
    head.includes("<item") ||
    (head.includes("<feed") && head.includes("xmlns"))
  );
}

function rssProxyUrlList(target) {
  const enc = encodeURIComponent(target);
  return [
    "https://api.allorigins.win/raw?url=" + enc,
    "https://corsproxy.io/?" + enc,
    "https://r.jina.ai/" + target,
  ];
}

async function fetchRssTextThroughProxies(rssUrl) {
  for (const proxyUrl of rssProxyUrlList(rssUrl)) {
    try {
      const res = await fetchWithTimeout(proxyUrl, 18000);
      if (!res.ok) continue;
      const text = await res.text();
      if (rssXmlLooksParsable(text)) return text;
    } catch {
      /* try next proxy */
    }
  }
  return null;
}

async function fetchNewsClientFallback() {
  const perFeed = 6;
  const chunks = await Promise.all(
    CLIENT_NEWS_FEEDS.map(async ({ rss, source }) => {
      try {
        const text = await fetchRssTextThroughProxies(rss);
        if (!text) return [];
        return parseRssXmlString(text, source, perFeed);
      } catch {
        return [];
      }
    })
  );
  const merged = chunks.flat();
  const seen = new Set();
  const unique = [];
  for (const row of merged) {
    const key = row.url.split("#")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  unique.sort((a, b) => {
    const ta = a.published ? Date.parse(a.published) : 0;
    const tb = b.published ? Date.parse(b.published) : 0;
    return tb - ta;
  });
  return unique.slice(0, 22);
}

function getActiveNewsItems() {
  if (newsSourceFilter === null || newsSourceFilter.size === 0) return cachedNewsItems.slice();
  return cachedNewsItems.filter(it => newsSourceFilter.has(it.source));
}

function buildNewsFilterChips() {
  const bar = document.getElementById("newsFilterBar");
  const chips = document.getElementById("newsFilterChips");
  if (!bar || !chips) return;
  if (!cachedNewsItems.length) {
    bar.hidden = true;
    chips.innerHTML = "";
    return;
  }
  const sources = [...new Set(cachedNewsItems.map(i => i.source).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "zh-Hans-CN")
  );
  if (sources.length < 2) {
    bar.hidden = true;
    chips.innerHTML = "";
    return;
  }
  bar.hidden = false;
  chips.innerHTML = "";
  const mkBtn = (label, mode, sourceVal, active) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip news-filter-btn" + (active ? " is-active" : "");
    b.textContent = label;
    if (mode === "all") b.setAttribute("data-news-filter", "all");
    else b.setAttribute("data-news-source", sourceVal);
    chips.appendChild(b);
  };
  mkBtn("All", "all", null, newsSourceFilter === null);
  sources.forEach(s => {
    mkBtn(s, "src", s, newsSourceFilter !== null && newsSourceFilter.has(s));
  });
}

document.getElementById("newsFilterChips").addEventListener("click", e => {
  const b = e.target.closest(".news-filter-btn");
  if (!b || !b.closest("#newsFilterChips")) return;
  if (b.getAttribute("data-news-filter") === "all") {
    newsSourceFilter = null;
  } else {
    const src = b.getAttribute("data-news-source");
    if (!src) return;
    if (newsSourceFilter === null) newsSourceFilter = new Set([src]);
    else if (newsSourceFilter.has(src)) {
      newsSourceFilter.delete(src);
      if (newsSourceFilter.size === 0) newsSourceFilter = null;
    } else newsSourceFilter.add(src);
  }
  buildNewsFilterChips();
  renderNewsFromCache();
});

document.getElementById("newsRefresh").addEventListener("click", () => {
  loadNews();
});

function renderNewsFromCache() {
  const list = document.getElementById("newsList");
  if (!list) return;
  const filtered = getActiveNewsItems();
  if (!filtered.length && cachedNewsItems.length) {
    list.innerHTML =
      '<li class="news-error" style="text-align:center;padding:14px 12px">No headlines for the selected sources. Turn on more sources or choose All.</li>';
    return;
  }
  renderNewsList(list, filtered);
}

function renderNewsList(listEl, items) {
  listEl.innerHTML = "";
  items.forEach(row => {
    const li = document.createElement("li");
    li.className = "news-item";

    const a = document.createElement("a");
    a.href = row.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const main = document.createElement("div");
    main.className = "news-item-main";

    const title = document.createElement("span");
    title.className = "news-item-title";
    title.textContent = row.title || "Untitled";

    const meta = document.createElement("div");
    meta.className = "news-item-meta";
    const src = document.createElement("span");
    src.className = "news-source";
    src.textContent = row.source || "News";
    meta.appendChild(src);
    const t = formatNewsTime(row.published);
    if (t) {
      const timeEl = document.createElement("span");
      timeEl.textContent = t;
      meta.appendChild(timeEl);
    }

    main.appendChild(title);
    main.appendChild(meta);

    const ext = document.createElement("span");
    ext.className = "news-external";
    ext.setAttribute("aria-hidden", "true");
    ext.textContent = "↗";

    a.appendChild(main);
    a.appendChild(ext);
    li.appendChild(a);
    listEl.appendChild(li);
  });
}

async function fetchNewsItemsFromApi() {
  const once = async () => {
    const res = await authenticatedFetchWithTimeout(API_URL + "/news", 26000);
    let data = {};
    try {
      data = await res.json();
    } catch {
      return [];
    }
    if (Array.isArray(data.items) && data.items.length) return data.items;
    return [];
  };
  let got = await once();
  if (got.length) return got;
  await new Promise(r => setTimeout(r, 800));
  got = await once();
  return got;
}

async function loadNews() {
  const list = document.getElementById("newsList");
  const fallbackNote = document.getElementById("newsFallbackNote");
  const filterBar = document.getElementById("newsFilterBar");
  fallbackNote.hidden = true;
  if (filterBar) filterBar.hidden = true;
  list.innerHTML = '<li class="news-loading">Loading…</li>';

  let items = [];

  try {
    items = await fetchNewsItemsFromApi();
  } catch {
    /* Network / CORS / missing route */
  }

  if (!items.length) {
    try {
      items = await fetchNewsClientFallback();
      if (items.length) fallbackNote.hidden = false;
    } catch {
      items = [];
    }
  }

  if (!items.length) {
    cachedNewsItems = [];
    const bar = document.getElementById("newsFilterBar");
    if (bar) bar.hidden = true;
    list.innerHTML =
      '<li class="news-error">No headlines right now. RSS sources or proxies can be slow — try <strong>refresh</strong>. If this persists: confirm API Gateway has <strong>GET /news</strong> on your Lambda, redeploy Lambda, and check the browser can reach your API (CORS).</li>';
    return;
  }

  cachedNewsItems = items;
  if (newsSourceFilter) {
    const valid = new Set(items.map(i => i.source).filter(Boolean));
    for (const x of [...newsSourceFilter]) {
      if (!valid.has(x)) newsSourceFilter.delete(x);
    }
    if (newsSourceFilter.size === 0) newsSourceFilter = null;
  }
  buildNewsFilterChips();
  renderNewsFromCache();
}

function setHeaderTodayDate() {
  const el = document.getElementById("dashboardDate");
  if (!el) return;
  const now = new Date();
  el.setAttribute("datetime", now.toISOString().slice(0, 10));
  el.textContent = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(now);
}

function syncThemeToggleUi() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  btn.textContent = dark ? "\u2600" : "\u263e";
  btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  btn.setAttribute("aria-pressed", dark ? "true" : "false");
}

function applyTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  if (window.WeatherFx) window.WeatherFx.setTheme(theme);
  syncThemeToggleUi();
}

function initPointerGlow() {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) return;

  let raf = 0;
  let nextX = "50%";
  let nextY = "20%";

  const update = () => {
    root.style.setProperty("--mouse-x", nextX);
    root.style.setProperty("--mouse-y", nextY);
    raf = 0;
  };

  window.addEventListener(
    "pointermove",
    e => {
      nextX = `${e.clientX}px`;
      nextY = `${e.clientY}px`;
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true }
  );
}

function initCardSpotlight() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) return;

  document.querySelectorAll(".card").forEach(card => {
    card.addEventListener(
      "pointermove",
      e => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--card-x", `${e.clientX - rect.left}px`);
        card.style.setProperty("--card-y", `${e.clientY - rect.top}px`);
      },
      { passive: true }
    );
  });
}

function initThemeFromStorage() {
  try {
    const s = localStorage.getItem(THEME_KEY);
    if (s === "light" || s === "dark") {
      document.documentElement.setAttribute("data-theme", s);
    } else if (!document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  } catch {
    if (!document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }
  syncThemeToggleUi();
}

document.getElementById("themeToggle").addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

document.getElementById("authSignIn").addEventListener("click", () => beginSignIn());
document.getElementById("authPanelSignIn").addEventListener("click", () => beginSignIn());
document.getElementById("authSignOut").addEventListener("click", () => signOut());

async function bootstrapAuthenticatedApp() {
  try {
    await completeAuthRedirect();
  } catch (e) {
    clearAuth();
    showAuthError(e.message || "Sign-in failed. Please try again.");
  }

  if (!authState.tokens) loadStoredAuth();

  if (!authConfigured || !authState.tokens) {
    renderSignedOut();
    return;
  }

  const token = await getAccessToken();
  if (!token) return;

  renderSignedIn();
  loadMovies();
  loadTasks();
  loadNews();
}

initThemeFromStorage();
initPointerGlow();
initCardSpotlight();
if (window.WeatherFx) {
  window.WeatherFx.init(
    document.getElementById("weatherWidget"),
    document.getElementById("weatherFxCanvas")
  );
}
setHeaderTodayDate();
loadWeather();
bootstrapAuthenticatedApp();
