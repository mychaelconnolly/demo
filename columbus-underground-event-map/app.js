const CU_CATEGORIES = [
  "Art",
  "Biking & Outdoors",
  "Business & Entrepreneurship",
  "Calls to Artists & Vendors",
  "Civic Meetings",
  "Classes & Lectures",
  "Classical Music",
  "Coffee",
  "Comedy",
  "Farmers Markets",
  "Festivals",
  "Film",
  "Food + Drink",
  "Literary Events",
  "Live Music",
  "Miscellaneous",
  "Nightlife",
  "Queer/LGBTQIA",
  "Shopping",
  "Sports",
  "Theatre",
  "Tours",
  "Trivia",
  "Volunteering",
  "Wellness"
];

const DOWNTOWN_CENTER = [39.9612, -82.9988];
const DOWNTOWN_RADIUS_MILES = 2;
const METERS_PER_MILE = 1609.344;
const COLUMBUS_CENTER = [39.9711, -82.9988];
const MAP_MAX_BOUNDS = L.latLngBounds([39.72, -83.26], [40.18, -82.72]);
const DEFAULT_START_DATE = toIsoDate(new Date());
const PRETEXT_IMPORT = "./vendor/pretext/dist/layout.js";
const PRETEXT_DEFAULT_SELECTOR = ".category-options [data-pretext], .leaflet-popup [data-pretext]";
const MOBILE_QUERY = window.matchMedia("(max-width: 860px)");
const PRETEXT_TARGETS = {
  "category-label": { maxLines: 2 },
  "popup-title": { maxLines: 2 },
  "popup-event-title": { maxLines: 3 },
  default: { maxLines: 2 }
};

const state = {
  events: [],
  filters: {
    search: "",
    categories: [],
    start: "",
    end: "",
    downtown: false
  },
  markers: new Map(),
  renderFrame: 0,
  datePicker: {
    input: null,
    month: null
  },
  filteredCount: 0,
  lastVenueGroups: [],
  mobileSheet: {
    expanded: false,
    layoutFrame: 0,
    pointerId: null,
    startX: 0,
    startY: 0,
    suppressClick: false
  },
  mobileFilters: {
    expanded: false
  },
  pretext: {
    api: null,
    cache: new Map(),
    frame: 0,
    root: null,
    ready: false
  }
};

const els = {
  appShell: document.querySelector(".app-shell"),
  panel: document.querySelector(".panel"),
  filters: document.querySelector("#filters"),
  searchInput: document.querySelector("#searchInput"),
  categoryOptions: document.querySelector("#categoryOptions"),
  categoryToggle: document.querySelector("#categoryToggle"),
  categorySummary: document.querySelector("#categorySummary"),
  mobileFilterBody: document.querySelector("#mobileFilterBody"),
  mobileFiltersToggle: document.querySelector("#mobileFiltersToggle"),
  mobileFiltersSummary: document.querySelector("#mobileFiltersSummary"),
  mobileSheetBody: document.querySelector("#mobileSheetBody"),
  mobileSheetToggle: document.querySelector("#mobileSheetToggle"),
  mobileSheetSummary: document.querySelector("#mobileSheetSummary"),
  startDate: document.querySelector("#startDate"),
  endDate: document.querySelector("#endDate"),
  downtownToggle: document.querySelector("#downtownToggle"),
  resetButton: document.querySelector("#resetButton"),
  resultCount: document.querySelector("#resultCount"),
  dataStamp: document.querySelector("#dataStamp"),
  mappedCount: document.querySelector("#mappedCount"),
  unmappedCount: document.querySelector("#unmappedCount"),
  eventList: document.querySelector("#eventList"),
  eventScrollHint: document.querySelector(".event-scroll-hint"),
  template: document.querySelector("#eventCardTemplate")
};

const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
  minZoom: 11,
  maxZoom: 18,
  maxBounds: MAP_MAX_BOUNDS,
  maxBoundsViscosity: 0.9
}).setView(COLUMBUS_CENTER, 12);

const zoomControl = L.control.zoom({ position: mobileZoomPosition() }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  minZoom: 11,
  noWrap: true,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const markerLayer = L.layerGroup().addTo(map);
const downtownRangeLayer = L.layerGroup().addTo(map);

init();

async function init() {
  populateCategories();
  applyDefaultFilters();
  readFilters();
  bindEvents();
  bindPretextRelayout();
  syncMobileSheetForViewport();
  syncMobileFiltersForViewport();
  loadPretext();

  try {
    const response = await fetch("data/events.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    state.events = normalizeEvents(payload.events || []);
    els.dataStamp.textContent = payload.generatedAt
      ? `Updated ${formatDateTime(payload.generatedAt)}`
      : "Snapshot loaded";
    render();
  } catch (error) {
    els.dataStamp.textContent = "Data failed to load";
    els.eventList.innerHTML = `<div class="empty-state">Could not load data/events.json. ${escapeHtml(error.message)}</div>`;
  }
}

async function loadPretext() {
  try {
    state.pretext.api = await import(PRETEXT_IMPORT);
    state.pretext.ready = true;
    document.documentElement.dataset.pretext = "ready";
    schedulePretextLayout();
  } catch (error) {
    document.documentElement.dataset.pretext = "unavailable";
    console.warn(`Pretext failed to load: ${error.message}`);
  }
}

function populateCategories() {
  for (const category of CU_CATEGORIES) {
    const button = document.createElement("button");
    button.className = "category-option";
    button.type = "button";
    button.dataset.category = category;
    button.title = category;
    button.setAttribute("aria-pressed", "false");
    button.innerHTML = `<span data-pretext="category-label">${escapeHtml(category)}</span>`;
    els.categoryOptions.append(button);
  }
}

function bindPretextRelayout() {
  window.addEventListener("resize", () => schedulePretextLayout());
  map.on("popupopen", (event) => schedulePretextLayout(event.popup.getElement()));
}

function bindEvents() {
  bindDatePickers();

  els.filters.addEventListener("submit", (event) => {
    event.preventDefault();
    readFilters();
    if (isMobileViewport()) setMobileSheetExpanded(false);
    render();
  });

  els.filters.addEventListener("input", () => {
    readFilters();
    scheduleRender();
  });

  els.eventList.addEventListener("scroll", updateEventScrollHint);

  els.categoryOptions.addEventListener("click", (event) => {
    const option = event.target.closest(".category-option");
    if (!option) return;
    closeDatePicker();
    setCategoryOptionSelected(option, option.getAttribute("aria-pressed") !== "true");
    readFilters();
    scheduleRender();
    schedulePretextLayout(els.categoryOptions);
  });

  els.categoryToggle.addEventListener("click", () => {
    closeDatePicker();
    setCategoryMenuOpen(els.categoryOptions.hidden);
  });

  els.filters.addEventListener("reset", () => {
    closeDatePicker();
    setCategoryMenuOpen(false);
    setMobileFiltersExpanded(false);
    clearCategorySelections();
    window.setTimeout(() => {
      applyDefaultFilters();
      readFilters();
      scheduleRender();
    }, 0);
  });

  if (els.mobileSheetToggle) {
    els.mobileSheetToggle.addEventListener("click", () => {
      if (state.mobileSheet.suppressClick) {
        state.mobileSheet.suppressClick = false;
        return;
      }
      setMobileSheetExpanded(!state.mobileSheet.expanded);
    });
    els.mobileSheetToggle.addEventListener("pointerdown", handleMobileSheetPointerDown);
    els.mobileSheetToggle.addEventListener("pointerup", handleMobileSheetPointerUp);
    els.mobileSheetToggle.addEventListener("pointercancel", resetMobileSheetPointer);
    els.mobileSheetToggle.addEventListener("lostpointercapture", resetMobileSheetPointer);
  }

  if (els.mobileFiltersToggle) {
    els.mobileFiltersToggle.addEventListener("click", () => {
      setMobileFiltersExpanded(!state.mobileFilters.expanded);
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isMobileViewport() || !state.mobileSheet.expanded) return;
    if (document.activeElement && els.panel?.contains(document.activeElement)) {
      setMobileSheetExpanded(false, { focusToggle: true });
    }
  });

  const handleViewportChange = () => {
    syncMobileSheetForViewport({ refit: true });
    syncMobileFiltersForViewport();
  };
  if (MOBILE_QUERY.addEventListener) {
    MOBILE_QUERY.addEventListener("change", handleViewportChange);
  } else {
    MOBILE_QUERY.addListener(handleViewportChange);
  }
}

function handleMobileSheetPointerDown(event) {
  if (!isMobileViewport()) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  state.mobileSheet.pointerId = event.pointerId;
  state.mobileSheet.startX = event.clientX;
  state.mobileSheet.startY = event.clientY;
  state.mobileSheet.suppressClick = false;
  els.mobileSheetToggle.setPointerCapture?.(event.pointerId);
}

function handleMobileSheetPointerUp(event) {
  if (state.mobileSheet.pointerId !== event.pointerId) return;
  const deltaX = event.clientX - state.mobileSheet.startX;
  const deltaY = event.clientY - state.mobileSheet.startY;
  resetMobileSheetPointer();

  const verticalIntent = Math.abs(deltaY) >= 34 && Math.abs(deltaY) > Math.abs(deltaX) * 1.25;
  if (!verticalIntent) return;

  state.mobileSheet.suppressClick = true;
  setMobileSheetExpanded(deltaY < 0);
  window.setTimeout(() => {
    state.mobileSheet.suppressClick = false;
  }, 0);
}

function resetMobileSheetPointer() {
  state.mobileSheet.pointerId = null;
  state.mobileSheet.startX = 0;
  state.mobileSheet.startY = 0;
}

function isMobileViewport() {
  return MOBILE_QUERY.matches;
}

function mobileZoomPosition() {
  return isMobileViewport() ? "topright" : "bottomright";
}

function syncMobileSheetForViewport({ refit = false } = {}) {
  zoomControl.setPosition(mobileZoomPosition());
  setMobileSheetExpanded(isMobileViewport() ? false : true, { refit });
}

function syncMobileFiltersForViewport() {
  setMobileFiltersExpanded(false);
}

function setMobileSheetExpanded(expanded, { focusToggle = false, refit = false } = {}) {
  const isMobile = isMobileViewport();
  const hadFocusInSheetBody = Boolean(els.mobileSheetBody?.contains(document.activeElement));
  state.mobileSheet.expanded = isMobile ? Boolean(expanded) : true;
  const sheetState = state.mobileSheet.expanded ? "expanded" : "collapsed";
  const bodyHidden = isMobile && !state.mobileSheet.expanded;

  if (els.appShell) els.appShell.dataset.mobileSheet = sheetState;
  if (els.mobileSheetBody) {
    els.mobileSheetBody.inert = bodyHidden;
    els.mobileSheetBody.setAttribute("aria-hidden", bodyHidden ? "true" : "false");
  }
  if (els.mobileSheetToggle) {
    els.mobileSheetToggle.setAttribute("aria-expanded", isMobile && state.mobileSheet.expanded ? "true" : "false");
  }
  document.body.classList.toggle("is-mobile-sheet-open", isMobile && state.mobileSheet.expanded);

  if (isMobile && !state.mobileSheet.expanded) {
    closeDatePicker();
    setCategoryMenuOpen(false);
    setMobileFiltersExpanded(false);
  }

  updateMobileSheetSummary();
  scheduleMapLayout({ refit });

  if ((focusToggle || (bodyHidden && hadFocusInSheetBody)) && els.mobileSheetToggle) {
    els.mobileSheetToggle.focus({ preventScroll: true });
  }
}

function updateMobileSheetSummary() {
  if (!els.mobileSheetSummary) return;
  if (isMobileViewport() && state.mobileSheet.expanded) {
    els.mobileSheetSummary.textContent = "Swipe down for map";
    return;
  }
  els.mobileSheetSummary.textContent = "Tap to search & filter";
}

function setMobileFiltersExpanded(expanded) {
  const isMobile = isMobileViewport();
  state.mobileFilters.expanded = isMobile ? Boolean(expanded) : true;
  const filtersState = state.mobileFilters.expanded ? "expanded" : "collapsed";
  const filtersHidden = isMobile && !state.mobileFilters.expanded;

  if (els.appShell) els.appShell.dataset.mobileFilters = filtersState;
  if (els.mobileFiltersToggle) {
    els.mobileFiltersToggle.setAttribute("aria-expanded", isMobile && state.mobileFilters.expanded ? "true" : "false");
  }
  if (els.mobileFilterBody) {
    els.mobileFilterBody.inert = filtersHidden;
    els.mobileFilterBody.setAttribute("aria-hidden", filtersHidden ? "true" : "false");
  }

  if (filtersHidden) {
    closeDatePicker();
    setCategoryMenuOpen(false);
  }

  updateMobileFiltersSummary();
  if (state.mobileFilters.expanded) schedulePretextLayout(els.mobileFilterBody);
}

function updateMobileFiltersSummary() {
  if (!els.mobileFiltersSummary) return;
  els.mobileFiltersSummary.textContent = state.mobileFilters.expanded
    ? "Hide controls"
    : "Categories, dates, downtown";
}

function scheduleMapLayout({ refit = false } = {}) {
  window.cancelAnimationFrame(state.mobileSheet.layoutFrame);
  state.mobileSheet.layoutFrame = window.requestAnimationFrame(() => {
    map.invalidateSize();
    if (refit) updateMapView(state.lastVenueGroups);
    schedulePretextLayout();
  });
}

function setCategoryMenuOpen(open) {
  els.categoryOptions.hidden = !open;
  els.categoryToggle.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) schedulePretextLayout(els.categoryOptions);
}

function applyDefaultFilters() {
  els.startDate.value = formatInputDate(DEFAULT_START_DATE);
  els.endDate.value = "";
}

function bindDatePickers() {
  for (const input of [els.startDate, els.endDate]) {
    input.addEventListener("focus", () => openDatePicker(input));
    input.addEventListener("click", () => openDatePicker(input));
    input.addEventListener("blur", () => normalizeDateInputValue(input));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeDatePicker();
        input.blur();
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        openDatePicker(input);
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!state.datePicker.input) return;
    if (!event.target.closest(".date-field")) {
      closeDatePickers();
    }
  });
}

function openDatePicker(input) {
  const field = input.closest(".date-field");
  const popover = ensureDatePicker(field);
  const selectedDate = parseDateInput(input.value);
  closeDatePickers();
  state.datePicker.input = input;
  state.datePicker.month = selectedDate || new Date();
  input.setAttribute("aria-expanded", "true");
  popover.hidden = false;
  renderDatePicker();
}

function closeDatePicker() {
  closeDatePickers();
}

function closeDatePickers() {
  document.querySelectorAll(".date-picker-popover").forEach((popover) => {
    popover.hidden = true;
  });
  document.querySelectorAll(".date-field input[aria-expanded]").forEach((input) => {
    input.setAttribute("aria-expanded", "false");
  });
  if (!state.datePicker.input) return;
  state.datePicker.input = null;
  state.datePicker.month = null;
}

function ensureDatePicker(field) {
  let popover = field.querySelector(".date-picker-popover");
  if (popover) return popover;

  popover = document.createElement("div");
  popover.className = "date-picker-popover";
  popover.hidden = true;
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `${field.querySelector("span")?.textContent || "Date"} calendar`);
  popover.addEventListener("click", handleDatePickerClick);
  field.querySelector(".date-control").append(popover);
  return popover;
}

function handleDatePickerClick(event) {
  const action = event.target.closest("[data-action]");
  const day = event.target.closest("[data-date]");
  if (!action && !day) return;
  event.preventDefault();

  if (action) {
    const direction = action.dataset.action === "next" ? 1 : -1;
    const month = state.datePicker.month;
    state.datePicker.month = new Date(month.getFullYear(), month.getMonth() + direction, 1);
    renderDatePicker();
    return;
  }

  state.datePicker.input.value = formatInputDate(day.dataset.date);
  state.datePicker.input.dispatchEvent(new Event("input", { bubbles: true }));
  closeDatePicker();
}

function renderDatePicker() {
  const input = state.datePicker.input;
  const month = state.datePicker.month;
  if (!input || !month) return;

  const field = input.closest(".date-field");
  const popover = field.querySelector(".date-picker-popover");
  const selectedIso = inputDateToIso(input.value);
  const todayIso = toIsoDate(new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - monthStart.getDay());
  const days = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const iso = toIsoDate(date);
    const classes = [
      "date-picker-day",
      date.getMonth() !== monthIndex ? "is-outside" : "",
      iso === selectedIso ? "is-selected" : "",
      iso === todayIso ? "is-today" : ""
    ].filter(Boolean).join(" ");
    days.push(`<button class="${classes}" type="button" data-date="${iso}">${date.getDate()}</button>`);
  }

  popover.innerHTML = `
    <div class="date-picker-head">
      <button class="date-picker-nav" type="button" data-action="prev" aria-label="Previous month">&#8249;</button>
      <strong>${escapeHtml(formatMonthYear(month))}</strong>
      <button class="date-picker-nav" type="button" data-action="next" aria-label="Next month">&#8250;</button>
    </div>
    <div class="date-picker-weekdays" aria-hidden="true">
      <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
    </div>
    <div class="date-picker-grid">${days.join("")}</div>
  `;
}

function scheduleRender() {
  window.cancelAnimationFrame(state.renderFrame);
  state.renderFrame = window.requestAnimationFrame(render);
}

function readFilters() {
  state.filters.search = els.searchInput.value.trim().toLowerCase();
  state.filters.categories = Array.from(
    els.categoryOptions.querySelectorAll('.category-option[aria-pressed="true"]'),
    (option) => option.dataset.category
  );
  state.filters.start = inputDateToIso(els.startDate.value);
  state.filters.end = inputDateToIso(els.endDate.value);
  state.filters.downtown = els.downtownToggle.checked;
  renderCategorySummary();
}

function renderCategorySummary() {
  const count = state.filters.categories.length;
  if (!count) {
    els.categorySummary.textContent = "All categories";
    return;
  }
  const preview = state.filters.categories.slice(0, 2).join(", ");
  const extra = count > 2 ? ` +${count - 2}` : "";
  els.categorySummary.textContent = `${preview}${extra}`;
}

function setCategoryOptionSelected(option, selected) {
  option.classList.toggle("is-selected", selected);
  option.setAttribute("aria-pressed", selected ? "true" : "false");
}

function clearCategorySelections() {
  els.categoryOptions.querySelectorAll(".category-option").forEach((option) => {
    setCategoryOptionSelected(option, false);
  });
}

function normalizeEvents(events) {
  return events.map((event) => {
    const hasRawLat = event.lat !== null && event.lat !== "" && event.lat !== undefined;
    const hasRawLng = event.lng !== null && event.lng !== "" && event.lng !== undefined;
    const lat = hasRawLat ? Number(event.lat) : null;
    const lng = hasRawLng ? Number(event.lng) : null;
    const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
    return {
      ...event,
      categories: Array.isArray(event.categories) ? event.categories : [],
      searchable: [
        event.title,
        event.summary,
        event.venue,
        event.address,
        ...(event.categories || [])
      ].filter(Boolean).join(" ").toLowerCase(),
      hasLocation,
      lat,
      lng
    };
  });
}

function render() {
  const filtered = state.events.filter(matchesFilters);
  const mapped = filtered.filter((event) => event.hasLocation);
  const venueGroups = groupEventsByLocation(mapped);
  const groupsByEventId = mapGroupsByEventId(venueGroups);
  const unmapped = filtered.length - mapped.length;

  state.filteredCount = filtered.length;
  state.lastVenueGroups = venueGroups;
  els.resultCount.textContent = pluralize(filtered.length, "event");
  els.mappedCount.textContent = `${mapped.length} mapped across ${pluralize(venueGroups.length, "venue")}`;
  els.unmappedCount.textContent = `${unmapped} unmapped`;
  updateMobileSheetSummary();

  renderMarkers(venueGroups);
  renderDowntownRange();
  updateMapView(venueGroups);
  renderList(filtered, groupsByEventId);
  updateEventScrollHint();
}

function updateEventScrollHint() {
  const hint = els.eventScrollHint;
  if (!hint) return;
  const thumb = hint.querySelector("span");
  const maxScroll = els.eventList.scrollHeight - els.eventList.clientHeight;
  const canScroll = maxScroll > 4;
  hint.classList.toggle("is-visible", canScroll);
  if (!canScroll) {
    thumb.style.height = "100%";
    thumb.style.transform = "translateY(0)";
    return;
  }
  const trackHeight = hint.clientHeight || 1;
  const thumbHeight = Math.max(42, Math.round((els.eventList.clientHeight / els.eventList.scrollHeight) * trackHeight));
  const travel = Math.max(0, trackHeight - thumbHeight);
  const offset = Math.round((els.eventList.scrollTop / maxScroll) * travel);
  thumb.style.height = `${thumbHeight}px`;
  thumb.style.transform = `translateY(${offset}px)`;
}

function matchesFilters(event) {
  const { search, categories, start, end, downtown } = state.filters;
  if (search && !event.searchable.includes(search)) return false;
  if (categories.length && !categories.some((category) => event.categories.includes(category))) return false;
  if (start && event.date < start) return false;
  if (end && event.date > end) return false;
  if (downtown) {
    if (!event.hasLocation) return false;
    if (distanceMiles(DOWNTOWN_CENTER[0], DOWNTOWN_CENTER[1], event.lat, event.lng) > DOWNTOWN_RADIUS_MILES) return false;
  }
  return true;
}

function groupEventsByLocation(events) {
  const groups = new Map();

  for (const event of events) {
    const key = locationKey(event);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        lat: event.lat,
        lng: event.lng,
        label: event.venue || event.address || "Mapped venue",
        address: event.address || "",
        venue: event.venue || "",
        events: []
      });
    }
    groups.get(key).events.push(event);
  }

  return Array.from(groups.values());
}

function mapGroupsByEventId(groups) {
  const groupsByEventId = new Map();
  for (const group of groups) {
    for (const event of group.events) {
      groupsByEventId.set(event.id, group);
    }
  }
  return groupsByEventId;
}

function locationKey(event) {
  return `${event.lat.toFixed(5)},${event.lng.toFixed(5)}`;
}

function renderMarkers(groups) {
  markerLayer.clearLayers();
  state.markers.clear();

  for (const group of groups) {
    const marker = L.marker([group.lat, group.lng], {
      icon: venueIcon(group),
      title: `${group.label}: ${pluralize(group.events.length, "event")}`,
      keyboard: true,
      riseOnHover: true,
      zIndexOffset: group.events.length > 1 ? group.events.length * 100 : 0
    });

    marker.bindPopup(groupPopupHtml(group));
    marker.on("click", () => marker.setPopupContent(groupPopupHtml(group)));

    marker.addTo(markerLayer);
    for (const event of group.events) {
      state.markers.set(event.id, { marker, group });
    }
  }
}

function renderDowntownRange() {
  downtownRangeLayer.clearLayers();
  if (!state.filters.downtown) return;
  L.circle(DOWNTOWN_CENTER, {
    radius: DOWNTOWN_RADIUS_MILES * METERS_PER_MILE,
    interactive: false,
    pane: "overlayPane",
    color: "#1f72b8",
    weight: 2,
    opacity: 0.74,
    fillColor: "#1f72b8",
    fillOpacity: 0.07,
    dashArray: "8 9"
  }).addTo(downtownRangeLayer);
}

function updateMapView(groups) {
  if (state.filters.downtown) {
    const range = downtownRangeLayer.getLayers()[0];
    if (range) map.fitBounds(range.getBounds().pad(0.08), mapFitOptions());
    return;
  }
  if (groups.length > 1) {
    map.fitBounds(L.latLngBounds(groups.map((group) => [group.lat, group.lng])).pad(0.22), mapFitOptions());
  } else if (groups.length === 1) {
    map.setView([groups[0].lat, groups[0].lng], 15);
  }
}

function mapFitOptions() {
  const options = { maxZoom: 14 };
  if (!isMobileViewport()) return options;
  options.paddingTopLeft = [16, 92];
  options.paddingBottomRight = [16, state.mobileSheet.expanded ? 300 : 118];
  return options;
}

function venueIcon(group) {
  const count = group.events.length;
  const size = count >= 100 ? 54 : count >= 10 ? 48 : count > 1 ? 42 : 30;
  const countHtml = count > 1 ? `<span class="venue-marker-count">${count}</span>` : "";

  return L.divIcon({
    className: `venue-marker-icon ${count > 1 ? "is-group" : "is-single"}`,
    html: countHtml,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
}

function renderList(events, groupsByEventId) {
  els.eventList.replaceChildren();

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No event found.";
    els.eventList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const event of events) {
    const group = groupsByEventId.get(event.id);
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.classList.toggle("is-unmapped", !event.hasLocation);
    node.classList.toggle("is-grouped", Boolean(group && group.events.length > 1));
    node.querySelector(".event-date").textContent = formatShortDate(event.date);
    node.querySelector(".event-title").textContent = event.title;
    node.querySelector(".event-meta").textContent = [formatLongDate(event.date), event.time].filter(Boolean).join(" • ");
    node.querySelector(".event-location").textContent = event.venue || event.address || "No map location";
    node.querySelector(".event-tags").textContent = event.categories.join(" / ");
    node.querySelector(".event-card-main").title = event.hasLocation ? "Open map pin" : "No map pin available";
    const link = node.querySelector(".event-link");
    link.href = event.url;
    link.setAttribute("aria-label", `View ${event.title} on Columbus Underground`);

    if (event.hasLocation) {
      node.querySelector(".event-card-main").addEventListener("click", () => {
        const entry = state.markers.get(event.id);
        if (entry) revealEventOnMap(entry, event.id);
      });
    } else {
      node.querySelector(".event-card-main").setAttribute("aria-disabled", "true");
    }

    fragment.append(node);
  }
  els.eventList.append(fragment);
}

function revealEventOnMap(entry, eventId) {
  if (!isMobileViewport()) {
    map.setView(entry.marker.getLatLng(), 15);
    openVenuePopup(entry.marker, entry.group, eventId);
    return;
  }

  setMobileSheetExpanded(false);
  window.requestAnimationFrame(() => {
    map.invalidateSize();
    map.setView(entry.marker.getLatLng(), 15);
    openVenuePopup(entry.marker, entry.group, eventId);
  });
}

function openVenuePopup(marker, group, activeEventId) {
  marker.setPopupContent(groupPopupHtml(group, activeEventId));
  marker.openPopup();
  schedulePretextLayout(marker.getPopup()?.getElement() || null);
}

function groupPopupHtml(group, activeEventId = "") {
  const location = [group.venue && group.venue !== group.label ? group.venue : "", group.address]
    .filter(Boolean)
    .map(escapeHtml)
    .join("<br>");
  const eventRows = group.events.map((event) => popupEventHtml(event, activeEventId)).join("");

  return `
    <section class="popup-group">
      <header class="popup-header">
        <span class="popup-count">${escapeHtml(pluralize(group.events.length, "event"))}</span>
        <strong class="popup-title" data-pretext="popup-title">${escapeHtml(group.label)}</strong>
        ${location ? `<span class="popup-meta">${location}</span>` : ""}
      </header>
      <div class="popup-event-list">${eventRows}</div>
    </section>
  `;
}

function popupEventHtml(event, activeEventId) {
  const isActive = event.id === activeEventId;
  const datetime = [formatLongDate(event.date), event.time].filter(Boolean).join(" • ");
  return `
    <a class="popup-event${isActive ? " is-active" : ""}" href="${escapeAttribute(event.url)}" target="_blank" rel="noreferrer">
      <span class="popup-event-date">${escapeHtml(formatShortDate(event.date))}</span>
      <span class="popup-event-main">
        <strong data-pretext="popup-event-title">${escapeHtml(event.title)}</strong>
        <span>${escapeHtml(datetime)}</span>
      </span>
    </a>
  `;
}

function schedulePretextLayout(root = null) {
  if (!state.pretext.ready) return;
  state.pretext.root = root;
  window.cancelAnimationFrame(state.pretext.frame);
  state.pretext.frame = window.requestAnimationFrame(applyPretextLayout);
}

function applyPretextLayout() {
  const { prepare, layout } = state.pretext.api || {};
  if (!prepare || !layout) return;

  const scope = state.pretext.root;
  const elements = scope
    ? scope.querySelectorAll("[data-pretext]")
    : document.querySelectorAll(PRETEXT_DEFAULT_SELECTOR);
  state.pretext.root = null;

  for (const element of elements) {
    const text = element.textContent.trim();
    const width = element.getBoundingClientRect().width;
    if (!text || width <= 0) continue;

    const styles = window.getComputedStyle(element);
    const font = pretextFont(styles);
    const lineHeight = pretextLineHeight(styles);
    const letterSpacing = pretextLetterSpacing(styles);
    const cacheKey = `${font}|${letterSpacing}|${text}`;
    let prepared = state.pretext.cache.get(cacheKey);
    if (!prepared) {
      prepared = prepare(text, font, { letterSpacing });
      state.pretext.cache.set(cacheKey, prepared);
    }

    const result = layout(prepared, width, lineHeight);
    const config = PRETEXT_TARGETS[element.dataset.pretext] || PRETEXT_TARGETS.default;
    const isClamped = result.lineCount > config.maxLines;
    element.dataset.pretextLines = String(result.lineCount);
    element.style.setProperty("--pretext-max-lines", String(config.maxLines));
    element.classList.toggle("is-pretext-clamped", isClamped);
    if (isClamped && !element.getAttribute("title")) {
      element.setAttribute("title", text);
    }
  }
}

function pretextFont(styles) {
  return `${styles.fontStyle} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
}

function pretextLineHeight(styles) {
  const lineHeight = Number.parseFloat(styles.lineHeight);
  if (Number.isFinite(lineHeight)) return lineHeight;
  const fontSize = Number.parseFloat(styles.fontSize);
  return Number.isFinite(fontSize) ? fontSize * 1.25 : 16;
}

function pretextLetterSpacing(styles) {
  if (styles.letterSpacing === "normal") return 0;
  const letterSpacing = Number.parseFloat(styles.letterSpacing);
  return Number.isFinite(letterSpacing) ? letterSpacing : 0;
}

function formatShortDate(value) {
  const date = parseLocalDate(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(value) {
  const date = parseLocalDate(value);
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMonthYear(value) {
  return value.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function toIsoDate(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatInputDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [year, month, day] = isoDate.split("-");
  return `${month}-${day}-${year}`;
}

function inputDateToIso(value) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const usMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (usMatch) {
    const month = String(Number(usMatch[1])).padStart(2, "0");
    const day = String(Number(usMatch[2])).padStart(2, "0");
    const iso = `${usMatch[3]}-${month}-${day}`;
    return isValidIsoDate(iso) ? iso : "";
  }
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-");
    const iso = `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
    return isValidIsoDate(iso) ? iso : "";
  }
  return "";
}

function parseDateInput(value) {
  const iso = inputDateToIso(value);
  if (!iso) return null;
  const date = parseLocalDate(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateInputValue(input) {
  const iso = inputDateToIso(input.value);
  if (iso) input.value = formatInputDate(iso);
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseLocalDate(value);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === value;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function pluralize(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function distanceMiles(lat1, lon1, lat2, lon2) {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
