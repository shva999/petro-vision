/* ============================================================
   PetroVision — js/history.js
   ------------------------------------------------------------
   Lists every Trip/Refuel entry for the logged-in user (Trip
   entries come from the Trip Cost Estimator's "Save to History"
   button; Refuel entries are logged directly on this page) and
   totals up what's been spent so far.
   ============================================================ */

const username = requireAuth();
paintNavUser();

let vehicles = [];
const vehicleSelect = document.getElementById("r-vehicle");
const litersInput = document.getElementById("r-liters");
const priceInput = document.getElementById("r-price");
const stationSelect = document.getElementById("r-station");
const costPreview = document.getElementById("r-cost-preview");
const form = document.getElementById("refuel-form");

const noVehicles = () => {
  document.getElementById("no-vehicle-notice").style.display = "block";
  form.querySelector("button[type=submit]").disabled = true;
};

function suggestPrice() {
  const v = vehicles.find(v => v.id === vehicleSelect.value);
  if (!v) return;
  const avg = averagePrice(v.fuelType, stationsCache);
  if (avg) priceInput.value = avg.toFixed(2);
  updatePreview();
}
vehicleSelect.addEventListener("change", suggestPrice);

function updatePreview() {
  const liters = Number(litersInput.value);
  const price = Number(priceInput.value);
  if (liters > 0 && price > 0) {
    costPreview.textContent = `Total: ₱${(liters * price).toFixed(0)}`;
  } else {
    costPreview.textContent = "";
  }
}
litersInput.addEventListener("input", updatePreview);
priceInput.addEventListener("input", updatePreview);
if (vehicles.length > 0) suggestPrice();

let stationsCache = [];
function vehicleName(id) {
  const v = vehicles.find(v => v.id === id);
  return v ? v.name : "—";
}

async function renderHistory() {
  const entries = await getHistory();
  const body = document.getElementById("history-body");

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="6" class="hint">No trips or refuels logged yet.</td></tr>`;
  } else {
    body.innerHTML = entries.map(h => {
      const details = h.type === "Trip"
        ? `${h.from} → ${h.to}`
        : (h.stationId ? stationsCache.find(station => station.id === h.stationId)?.name || h.notes : h.notes || "Refuel");
      return `
        <tr>
          <td>${escapeHtml(new Date(h.date).toLocaleDateString())}</td>
          <td><span class="badge ${h.type === "Trip" ? "badge-neutral" : "badge-success"}">${h.type}</span></td>
          <td>${escapeHtml(details)}</td>
          <td>${vehicleName(h.vehicleId)}</td>
          <td>${Number(h.liters).toFixed(1)} L</td>
          <td>₱${Number(h.cost).toFixed(0)}</td>
        </tr>
      `;
    }).join("");
  }

  const total = entries.reduce((sum, h) => sum + Number(h.cost || 0), 0);
  document.getElementById("total-spent").textContent = `₱${total.toFixed(0)}`;
}
(async function initializeHistory() {
  try {
    [vehicles, stationsCache] = await Promise.all([getVehicles(), getStations()]);
    if (!vehicles.length) noVehicles();
    vehicles.forEach(v => vehicleSelect.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(v.id)}">${escapeHtml(v.name)}</option>`));
    const uniqueStations = [...new Map(stationsCache.map(station => [station.id, station])).values()];
    stationSelect.insertAdjacentHTML("beforeend", uniqueStations.map(station =>
      `<option value="${escapeHtml(station.id)}">${escapeHtml(station.name)} — ${escapeHtml(station.city)}</option>`).join(""));
    if (vehicles.length) suggestPrice();
    await renderHistory();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  }
})();

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const liters = Number(litersInput.value);
  const price = Number(priceInput.value);

  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await addHistoryEntry({ type: "Refuel", liters, cost: Math.round(liters * price) }, vehicleSelect.value, stationSelect.value);
    document.getElementById("banner").innerHTML = `<div class="banner banner-success">Refuel logged. Points have been added to your rewards account.</div>`;
    form.reset();
    costPreview.textContent = "";
    await renderHistory();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  } finally {
    submit.disabled = false;
  }
});
