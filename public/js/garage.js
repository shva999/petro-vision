/* ============================================================
   PetroVision — js/garage.js
   ------------------------------------------------------------
   add/list/delete vehicles for the logged-in user through the API.
   ============================================================ */

const username = requireAuth();
paintNavUser();

const typeSelect = document.getElementById("v-type");
const fuelSelect = document.getElementById("v-fuel");
const effInput = document.getElementById("v-eff");

VEHICLE_TYPES.forEach(t => typeSelect.innerHTML += `<option value="${t}">${t}</option>`);
FUEL_TYPES.forEach(f => fuelSelect.innerHTML += `<option value="${f}">${f}</option>`);

// Pre-fill the efficiency field with a sensible starting number
// whenever the vehicle type changes.
function suggestEfficiency() {
  effInput.value = DEFAULT_EFFICIENCY[typeSelect.value] || "";
}
typeSelect.addEventListener("change", suggestEfficiency);
suggestEfficiency();

async function renderVehicles() {
  const vehicles = await getVehicles();
  const list = document.getElementById("vehicle-list");

  if (vehicles.length === 0) {
    list.innerHTML = `<p class="hint">No vehicles yet — add your first one to unlock the Trip Cost Estimator.</p>`;
    return;
  }

  list.innerHTML = vehicles.map(v => `
    <div class="card" style="padding:16px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-weight:700;">${escapeHtml(v.name)}</div>
        <div class="hint">${escapeHtml(v.type)} · ${escapeHtml(v.fuelType)} · ${v.efficiency} km/L</div>
      </div>
      <button class="btn btn-outline btn-sm" data-id="${v.id}">Remove</button>
    </div>
  `).join("");

  list.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await deleteVehicle(btn.dataset.id);
        await renderVehicles();
      } catch (error) {
        document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
        btn.disabled = false;
      }
    });
  });
}
renderVehicles().catch(error => {
  document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
});

document.getElementById("vehicle-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await addVehicle({
    name: document.getElementById("v-name").value.trim(),
    type: typeSelect.value,
    fuelType: fuelSelect.value,
    efficiency: effInput.value,
  });
  document.getElementById("banner").innerHTML =
    `<div class="banner banner-success">Vehicle added! Points have been added to your rewards account.</div>`;
  document.getElementById("vehicle-form").reset();
  suggestEfficiency();
    await renderVehicles();
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  } finally {
    submit.disabled = false;
  }
});
