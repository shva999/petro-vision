/* ============================================================
   PetroVision — js/availability.js
   ------------------------------------------------------------
   Shows every crowdsourced station as a filterable table and
   lets the user update a station's availability status inline
   (a dropdown per row) — reusing the same stations as the Map page.
   ============================================================ */

const username = requireAuth();
paintNavUser();

const fuelFilter = document.getElementById("filter-fuel");
const statusFilter = document.getElementById("filter-status");
FUEL_TYPES.forEach(f => fuelFilter.innerHTML += `<option value="${f}">${f}</option>`);

const STATUS_BADGE = {
  "In Stock": "badge-success",
  "Low Stock": "badge-warning",
  "Out of Stock": "badge-danger",
};

async function renderTable() {
  const stations = (await getStations())
    .filter(s => !fuelFilter.value || s.fuelType === fuelFilter.value)
    .filter(s => !statusFilter.value || s.availability === statusFilter.value)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const body = document.getElementById("availability-body");

  if (stations.length === 0) {
    body.innerHTML = `<tr><td colspan="7" class="hint">No stations match these filters.</td></tr>`;
    return;
  }

  body.innerHTML = stations.map(s => `
    <tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.city)}</td>
      <td>${escapeHtml(s.fuelType)}</td>
      <td>${s.price ? `₱${s.price.toFixed(2)}` : "—"}</td>
      <td><span class="badge ${STATUS_BADGE[s.availability] || "badge-neutral"}">${escapeHtml(s.availability)}</span></td>
      <td class="hint">${escapeHtml(s.date)}</td>
      <td>
        <select class="status-update" data-id="${s.id}" data-fuel="${s.fuelType}" style="padding:6px 8px; border-radius:6px; border:1px solid var(--line);">
          <option value="">Update…</option>
          <option value="In Stock">In Stock</option>
          <option value="Low Stock">Low Stock</option>
          <option value="Out of Stock">Out of Stock</option>
        </select>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".status-update").forEach(select => {
    select.addEventListener("change", async () => {
      if (!select.value) return;
      select.disabled = true;
      try {
        await updateAvailability(select.dataset.id, select.value, select.dataset.fuel);
        document.getElementById("banner").innerHTML =
          `<div class="banner banner-success">Availability updated. Points have been added to your rewards account.</div>`;
        await renderTable();
      } catch (error) {
        document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
        select.disabled = false;
      }
    });
  });
}

fuelFilter.addEventListener("change", renderTable);
statusFilter.addEventListener("change", renderTable);
renderTable().catch(error => {
  document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
});
