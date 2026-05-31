const API_URL = "https://6dc9v9n7sa.execute-api.us-east-2.amazonaws.com";

const TASK_FILTER_KEY = "todoApp_taskFilter";
const THEME_KEY = "todoApp_theme";

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
    const res = await fetch(`${API_URL}/movies?${params}`);
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
    if (titleEl) titleEl.textContent = "Weather";
    elEmoji.textContent = "☁";
    elTemp.textContent = "—";
    elDesc.textContent = "Search for a city to see the forecast";
    elDetails.textContent = "";
    elLoc.textContent = "";
    elUpdated.textContent = "";
    return;
  }

  widget.classList.remove("is-error");
  btn.disabled = true;
  elDesc.textContent = "Loading…";
  if (titleEl) {
    const cityLabel = (coords.label || "").replace(/\s*(天气|Weather)\s*$/i, "").trim();
    titleEl.textContent = cityLabel ? `${cityLabel} weather` : "Weather";
  }
  elDetails.textContent = "";
  elUpdated.textContent = "";
  elLoc.textContent = coords.label;

  try {
    const data = await fetchOpenMeteo(coords.lat, coords.lon);
    const cur = data.current;
    if (!cur) throw new Error("No current data");

    const { icon, text } = decodeWmo(cur.weather_code);
    elEmoji.textContent = icon;
    elTemp.textContent = Math.round(cur.temperature_2m * 10) / 10;
    elDesc.textContent = text;

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
  } catch (e) {
    widget.classList.add("is-error");
    elEmoji.textContent = "☁";
    elTemp.textContent = "—";
    elDesc.textContent = "Could not load weather. Try again.";
    elDetails.textContent = e.message || "";
    elUpdated.textContent = "";
  } finally {
    btn.disabled = false;
    loadMovies();
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
    const loc = { ...pos, label: "Current location" };
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
  const res = await fetch(API_URL + "/tasks");
  const data = await res.json();

  const list = document.getElementById("taskList");
  const wrap = list.parentElement;
  list.innerHTML = "";

  let emptyEl = wrap.querySelector(".empty-state");
  if (emptyEl) emptyEl.remove();

  syncTaskFilterButtons();

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
  const res = await fetch(API_URL + "/tasks", {
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
    console.error("setCompleted failed", res.status, await res.text());
  }
  await loadTasks();
}

async function setStarred(id, starred) {
  const res = await fetch(API_URL + "/tasks", {
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
    console.error("setStarred failed", res.status, await res.text());
  }
  await loadTasks();
}

async function renameTask(id, title) {
  const res = await fetch(API_URL + "/tasks", {
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
    console.error("renameTask failed", res.status, await res.text());
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

  const res = await fetch(API_URL + "/tasks", {
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

  const res = await fetch(API_URL + "/tasks/" + id, {
    method: "DELETE"
  });
  if (!res.ok) {
    console.error("deleteTask failed", res.status, await res.text());
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
  { rss: "https://feeds.reuters.com/Reuters/worldNews", source: "Reuters" },
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
    const res = await fetchWithTimeout(API_URL + "/news", 26000);
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
  syncThemeToggleUi();
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

initThemeFromStorage();
setHeaderTodayDate();
loadWeather();
loadMovies();
loadTasks();
loadNews();
