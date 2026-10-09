/* ============================================================
   PetroVision — js/alerts.js
   ------------------------------------------------------------
   Creates and lists Fuel Price Alerts. Each alert is checked
   against the selected station and its latest crowdsourced price.
   ============================================================ */

const username = requireAuth();
paintNavUser();

const fuelSelect = document.getElementById("a-fuel");
const stationSelect = document.getElementById("a-station");
FUEL_TYPES.forEach(f => fuelSelect.innerHTML += `<option value="${f}">${f}</option>`);

let stations = [];
async function renderAlerts() {
  const alerts = await getAlerts();
  const list = document.getElementById("alert-list");

  if (alerts.length === 0) {
    list.innerHTML = `<p class="hint">No alerts yet — create one to get notified of a price match.</p>`;
    return;
  }

  list.innerHTML = alerts.map(a => {
    const match = checkAlert(a, stations);
    const conditionText = a.condition === "below" ? "drops below" : "rises above";
    return `
      <div class="card" style="padding:14px 16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <strong>${escapeHtml(a.fuelType)}</strong> at ${escapeHtml(match?.name || "selected station")} ${conditionText} ₱${Number(a.maxPrice).toFixed(2)}
          </div>
          <button class="btn btn-outline btn-sm" data-id="${a.id}">Delete</button>
        </div>
        ${match
          ? `<div class="banner banner-success" style="margin:10px 0 0;">
               Triggered: ${escapeHtml(match.name)} (${escapeHtml(match.city)}) is at ₱${match.price.toFixed(2)}
             </div>`
          : `<p class="hint" style="margin-top:8px;">No station matches this yet.</p>`}
      </div>
    `;
  }).join("");

  list.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await deleteAlert(btn.dataset.id);
        await renderAlerts();
      } catch (error) {
        document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
        btn.disabled = false;
      }
    });
  });
}
(async function initializeAlerts() {
  try {
    stations = await getStations();
    const uniqueStations = [...new Map(stations.filter(s => s.fuelType && s.price > 0).map(s => [s.id, s])).values()];
    stationSelect.innerHTML += uniqueStations.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)} — ${escapeHtml(s.city)}</option>`).join("");
    if (!uniqueStations.length) {
      stationSelect.disabled = true;
      document.getElementById("alert-form").querySelector("button[type=submit]").disabled = true;
      document.getElementById("banner").innerHTML = `<div class="banner banner-info">Report a station price before creating an alert.</div>`;
    }
    await renderAlerts();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  }
})();

document.getElementById("alert-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const condition = document.querySelector('input[name="a-condition"]:checked').value;
  const form = event.currentTarget;
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await addAlert({
      stationId: stationSelect.value,
      fuelType: fuelSelect.value,
      condition,
      threshold: document.getElementById("a-threshold").value
    });
    document.getElementById("banner").innerHTML = `<div class="banner banner-success">Alert created. Points have been added to your rewards account.</div>`;
    form.reset();
    await renderAlerts();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  } finally {
    submit.disabled = false;
  }
});
