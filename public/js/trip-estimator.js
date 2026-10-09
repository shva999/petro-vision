/* ============================================================
   PetroVision — js/trip-estimator.js
   ------------------------------------------------------------
   Estimates fuel cost for a trip:
     distance (km) comes from the backend Routes estimator
     liters needed = distance / vehicle.efficiency (km per liter)
     price used    = average verified backend price
     total cost    = liters needed × price used
   ============================================================ */

const username = requireAuth();
paintNavUser();

const fromSelect = document.getElementById("from-city");
const toSelect = document.getElementById("to-city");
const vehicleSelect = document.getElementById("vehicle-select");
const vehicleInfo = document.getElementById("vehicle-info");
const form = document.getElementById("estimate-form");

// ---------- city dropdowns ----------
Object.keys(CITIES).forEach(city => {
  fromSelect.innerHTML += `<option value="${city}">${city}</option>`;
  toSelect.innerHTML += `<option value="${city}">${city}</option>`;
});
toSelect.selectedIndex = 1; // default to a different city than "from"

// ---------- vehicle dropdown ----------
let vehicles = [];

function updateVehicleInfo() {
  const v = vehicles.find(v => v.id === vehicleSelect.value);
  if (!v) { vehicleInfo.textContent = ""; return; }
  vehicleInfo.textContent = `${v.type} · ${v.fuelType} · about ${v.efficiency} km/L`;
}
vehicleSelect.addEventListener("change", updateVehicleInfo);

(async function initializeEstimator() {
  try {
    vehicles = await getVehicles();
    if (vehicles.length === 0) {
      document.getElementById("no-vehicle-notice").style.display = "block";
      form.querySelector("button[type=submit]").disabled = true;
      return;
    }
    vehicles.forEach(v => vehicleSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)} (${escapeHtml(v.fuelType)})</option>`));
    updateVehicleInfo();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  }
})();

// ---------- estimate ----------
let lastEstimate = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const from = fromSelect.value;
  const to = toSelect.value;
  const vehicle = vehicles.find(v => v.id === vehicleSelect.value);
  if (!vehicle) return;

  if (from === to) {
    document.getElementById("banner").innerHTML =
      `<div class="banner banner-danger">Starting point and destination can't be the same city.</div>`;
    return;
  }
  document.getElementById("banner").innerHTML = "";

  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const result = await estimateTrip(from, to, vehicle.id);
    document.getElementById("res-distance").textContent = `${result.distanceKm.toFixed(0)} km`;
    document.getElementById("res-liters").textContent = `${result.fuelLitres.toFixed(1)} L`;
    document.getElementById("res-price").textContent = `₱${result.pricePerLitre.toFixed(2)}/L`;
    document.getElementById("res-cost").textContent = `₱${result.estimatedFuelCost.toFixed(0)}`;
    document.getElementById("result-card").style.display = "block";
    lastEstimate = { from, to, vehicle };
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("save-history-btn").addEventListener("click", async () => {
  if (!lastEstimate) return;
  const button = document.getElementById("save-history-btn");
  button.disabled = true;
  try {
    await addHistoryEntry({ type: "Trip", from: lastEstimate.from, to: lastEstimate.to }, lastEstimate.vehicle.id);
    document.getElementById("banner").innerHTML =
      `<div class="banner banner-success">Trip saved to your History. Points have been added to your rewards account.</div>`;
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  } finally {
    button.disabled = false;
  }
});
