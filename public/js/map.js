/* ============================================================
   PetroVision — js/map.js
   ------------------------------------------------------------
   Sets up the Leaflet map, plots every station as a colored dot
   (color = fuel type), and powers the "Report a Fuel Price"
   flow: click the button, click the map to drop a pin, fill in
   the small form, submit.

   Leaflet reference used here: L.map(), L.tileLayer(),
   L.circleMarker(), L.marker(), .bindPopup(), .addTo(),
   map.fitBounds(), map.on("click", ...).
   ============================================================ */

const username = requireAuth();
paintNavUser();

// ---------- fuel type dropdowns ----------
const fuelSelect = document.getElementById("st-fuel");
const filterSelect = document.getElementById("filter-fuel");
FUEL_TYPES.forEach(f => {
  fuelSelect.innerHTML += `<option value="${f}">${f}</option>`;
  filterSelect.innerHTML += `<option value="${f}">${f}</option>`;
});

// A consistent color per fuel type, used for both map dots and
// small colored squares in the sidebar list.
const FUEL_COLORS = {
  "Diesel": "#0B3D5C",
  "Gasoline (RON 95)": "#F2732B",
  "Gasoline (RON 97)": "#D64545",
};

// ---------- map setup ----------
const map = L.map("map");
map.setView([12.8797, 121.7740], 6);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 18,
}).addTo(map);

// Keep panning roughly within the Philippines so the map doesn't
// drift off into open ocean.
map.setMaxBounds([[3, 113], [22, 130]]);

let stationLayer = L.layerGroup().addTo(map);

function renderMarkers(stations) {
  stationLayer.clearLayers();
  stations.forEach(s => {
    const marker = L.circleMarker([s.lat, s.lng], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: FUEL_COLORS[s.fuelType] || "#666",
      fillOpacity: 0.9,
    }).bindPopup(popupHtml(s));
    marker._stationId = s.id;
    stationLayer.addLayer(marker);
  });
}

function popupHtml(s) {
  const verifiedTag = s.verified
    ? `<span class="badge badge-success">Verified</span>`
    : `<span class="badge badge-warning">Pending</span>`;
  return `
    <strong>${escapeHtml(s.name)}</strong><br>
    ${escapeHtml(s.city)}<br>
    ${escapeHtml(s.fuelType)} — ₱${s.price.toFixed(2)}/L<br>
    ${verifiedTag} <span class="badge badge-neutral">${escapeHtml(s.availability)}</span><br>
    <span style="color:#5B6B7A;">Reported ${s.date ? `on ${new Date(s.date).toLocaleDateString()}` : ""}</span>
  `;
}

function fitToStations(stations) {
  if (stations.length === 0) return;
  const bounds = L.latLngBounds(stations.map(s => [s.lat, s.lng]));
  map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
}

// ---------- sidebar list ----------
async function renderList() {
  const filter = filterSelect.value;
  const stations = (await getStations())
    .filter(s => s.price > 0)
    .filter(s => !filter || s.fuelType === filter)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  document.getElementById("station-list").innerHTML = stations.map(s => `
    <div class="station-row" data-id="${s.id}">
      <div class="top">
        <span class="name">${escapeHtml(s.name)}</span>
        <span style="font-weight:700; color:${FUEL_COLORS[s.fuelType]};">₱${s.price.toFixed(2)}</span>
      </div>
      <div class="meta">${escapeHtml(s.city)} · ${escapeHtml(s.fuelType)} · ${escapeHtml(s.availability)}</div>
    </div>
  `).join("") || `<p class="hint">No stations match that filter yet.</p>`;

  // Clicking a row pans the map to that station and opens its popup.
  document.querySelectorAll(".station-row").forEach(row => {
    row.addEventListener("click", () => {
      const station = stations.find(s => s.id === row.dataset.id);
      if (!station) return;
      map.setView([station.lat, station.lng], 12);
      stationLayer.eachLayer(layer => {
        if (layer._stationId === station.id) layer.openPopup();
      });
    });
  });

  renderMarkers(stations);
  return stations;
}

filterSelect.addEventListener("change", () => renderList().catch(showApiError));

// initial paint
renderList().then(stations => fitToStations(stations)).catch(showApiError);
function showApiError(error) {
  banner.innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
}

// ---------- "Report a Fuel Price" flow ----------
const reportBtn = document.getElementById("report-btn");
const reportHint = document.getElementById("report-hint");
const reportForm = document.getElementById("report-form");
const banner = document.getElementById("banner");

let awaitingClick = false;
let pendingMarker = null;

reportBtn.addEventListener("click", () => {
  awaitingClick = !awaitingClick;
  reportHint.style.display = awaitingClick ? "block" : "none";
  reportBtn.textContent = awaitingClick ? "Cancel" : "Report a Fuel Price";
  if (!awaitingClick) {
    reportForm.style.display = "none";
    if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }
  }
});

map.on("click", (e) => {
  if (!awaitingClick) return;

  if (pendingMarker) map.removeLayer(pendingMarker);
  pendingMarker = L.marker(e.latlng).addTo(map);

  const nearest = nearestCity(e.latlng.lat, e.latlng.lng);
  document.getElementById("st-lat").value = e.latlng.lat;
  document.getElementById("st-lng").value = e.latlng.lng;
  document.getElementById("st-city").value = nearest;

  reportHint.textContent = `Pin placed near ${nearest}. Fill in the details below.`;
  reportForm.style.display = "block";
});

// Finds the closest known city to a clicked point, just so the
// report has a readable place name instead of raw coordinates.
function nearestCity(lat, lng) {
  let best = null, bestDist = Infinity;
  for (const name in CITIES) {
    const d = haversineKm({ lat, lng }, CITIES[name]);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return best;
}

reportForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = reportForm.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await addStation({
    name: document.getElementById("st-name").value.trim(),
    city: document.getElementById("st-city").value,
    lat: Number(document.getElementById("st-lat").value),
    lng: Number(document.getElementById("st-lng").value),
    fuelType: document.getElementById("st-fuel").value,
    price: document.getElementById("st-price").value,
  });

  banner.innerHTML = `<div class="banner banner-success">Thanks! Your station and price report were submitted. Rewards have been added to your account.</div>`;

  reportForm.reset();
  reportForm.style.display = "none";
  reportHint.style.display = "none";
  reportBtn.textContent = "Report a Fuel Price";
  awaitingClick = false;
  if (pendingMarker) { map.removeLayer(pendingMarker); pendingMarker = null; }

    await renderList();
  } catch (error) {
    showApiError(error);
  } finally {
    submit.disabled = false;
  }
});
