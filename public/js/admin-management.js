requireAdmin();
paintNavUser();

const rewardFields = {
  newStation: "price-report",
  availabilityUpdate: "availability-report",
  refuelLog: "refuel-log",
  tripLog: "trip-log",
  newVehicle: "new-vehicle",
  newAlert: "new-alert"
};
let stations = [];
let users = [];

function showBanner(message, type = "success") {
  document.getElementById("banner").innerHTML = `<div class="banner banner-${type}">${escapeHtml(message)}</div>`;
}
async function loadRewards() {
  const rules = await getRewardRules();
  Object.entries(rewardFields).forEach(([field, ruleId]) => {
    const input = document.getElementById(`r-${field}`);
    if (rules[ruleId]) input.value = rules[ruleId].points;
  });
}
async function loadUsers() {
  users = (await getAdminUsers()).filter(user => user.role !== "admin");
  document.getElementById("points-user").innerHTML = users
    .map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.displayName)} (${escapeHtml(user.email)}) — ${user.points || 0} pts</option>`).join("");
}
async function renderStations() {
  stations = await getAdminStations();
  const query = document.getElementById("station-search").value.toLowerCase();
  const uniqueStations = [...new Map(stations.map(station => [station.id, station])).values()];
  const filtered = uniqueStations.filter(station => `${station.name} ${station.city}`.toLowerCase().includes(query));
  document.getElementById("station-table").innerHTML = filtered.map(station => {
    const status = station.approvalStatus;
    return `<tr><td><strong>${escapeHtml(station.name)}</strong><br><span class="hint">${escapeHtml(station.id)}</span></td>
      <td>${escapeHtml(station.city)}</td><td>${escapeHtml(station.fuelType || "—")}</td><td>${station.price ? `₱${station.price.toFixed(2)}` : "—"}</td>
      <td>${escapeHtml(station.availability)}</td><td>${escapeHtml(status)}</td><td>
      <button class="btn btn-sm btn-outline" onclick="editStation('${escapeHtml(station.id)}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="removeStation('${escapeHtml(station.id)}')">Delete</button></td></tr>`;
  }).join("") || `<tr><td colspan="7" class="hint">No matching stations.</td></tr>`;
}
window.editStation = async function(id) {
  const station = stations.find(item => item.id === id);
  if (!station) return;
  const name = prompt("Station name:", station.name);
  if (name === null) return;
  const address = prompt("Station address or city:", station.address);
  if (address === null) return;
  try {
    await updateStationAdmin(station, { name: name.trim(), city: address.trim() });
    showBanner(`Updated ${name.trim()}.`);
    await renderStations();
  } catch (error) {
    showBanner(error.message, "danger");
  }
};
window.removeStation = async function(id) {
  const station = stations.find(item => item.id === id);
  if (!station || !confirm(`Delete ${station.name}? This will remove its price reports and alerts.`)) return;
  try {
    await deleteStationAdmin(station);
    showBanner(`Deleted ${station.name}.`);
    await renderStations();
  } catch (error) {
    showBanner(error.message, "danger");
  }
};
document.getElementById("reward-form").addEventListener("submit", async event => {
  event.preventDefault();
  const rules = {};
  Object.entries(rewardFields).forEach(([field, ruleId]) => {
    rules[ruleId] = Math.max(0, Number(document.getElementById(`r-${field}`).value || 0));
  });
  const submit = event.currentTarget.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await saveRewardRules(rules);
    showBanner("Reward point rules saved.");
  } catch (error) {
    showBanner(error.message, "danger");
  } finally {
    submit.disabled = false;
  }
});
document.getElementById("points-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const userId = document.getElementById("points-user").value;
  const amount = Number(document.getElementById("points-amount").value);
  const reason = document.getElementById("points-reason").value.trim();
  if (!amount || !reason) return showBanner("Enter a non-zero point amount and a reason.", "danger");
  const submit = form.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await adjustUserPoints(userId, amount, reason);
    showBanner(`Adjusted the selected user's points by ${amount > 0 ? "+" : ""}${amount}.`);
    await loadUsers();
    form.reset();
  } catch (error) {
    showBanner(error.message, "danger");
  } finally {
    submit.disabled = false;
  }
});
document.getElementById("station-search").addEventListener("input", () => renderStations().catch(error => showBanner(error.message, "danger")));
document.getElementById("logout-link").addEventListener("click", async event => {
  event.preventDefault();
  try {
    await signOut();
  } catch (error) {
    console.error("The API logout request failed.", error);
  }
  location.href = "index.html";
});
Promise.all([loadRewards(), loadUsers(), renderStations()]).catch(error => showBanner(error.message, "danger"));
