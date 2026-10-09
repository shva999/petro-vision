/* ============================================================
   PetroVision — js/profile.js
   ------------------------------------------------------------
   Fills in the Driver Profile Card: basic info, badge, stats
   pulled from across the other features (vehicles, history,
   stations), and handles logging out.
   ============================================================ */

const username = requireAuth();
paintNavUser();

function initials(fullName) {
  return fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

const stationsBox = document.getElementById("profile-stations");
(async function loadProfile() {
  try {
    const [user, account] = await Promise.all([getCurrentUser(), getRewardAccount()]);
    const badge = getBadge(account.points);
    document.getElementById("profile-avatar").textContent = initials(user.displayName);
    document.getElementById("profile-name").textContent = user.displayName;
    document.getElementById("profile-username").textContent = user.email;
    document.getElementById("profile-badge").textContent = badge.name;
    document.getElementById("profile-badge").style.background = badge.color;
    document.getElementById("profile-joined").textContent = user.createdAt.slice(0, 10);
    document.getElementById("profile-points").textContent = account.points;
    document.getElementById("profile-submissions").textContent = account.contributions;
    const [vehiclesResult, historyResult, stationsResult] = await Promise.allSettled([
      getVehicles(), getHistory(), getStations()
    ]);
    document.getElementById("profile-vehicles").textContent =
      vehiclesResult.status === "fulfilled" ? vehiclesResult.value.length : "Unavailable";
    document.getElementById("profile-history").textContent =
      historyResult.status === "fulfilled" ? historyResult.value.length : "Unavailable";
    if (vehiclesResult.status === "rejected") console.error("Could not load garage vehicles for the profile.", vehiclesResult.reason);
    if (historyResult.status === "rejected") console.error("Could not load trip and refuel history for the profile.", historyResult.reason);
    if (stationsResult.status === "rejected") {
      stationsBox.innerHTML = `<div class="banner banner-danger">${escapeHtml(stationsResult.reason.message || "Could not load station reports.")}</div>`;
      return;
    }
    const mine = stationsResult.value.filter(station => station.submittedBy === user.id && station.fuelType);
    stationsBox.innerHTML = mine.length
      ? `<table><thead><tr><th>Station</th><th>Fuel</th><th>Price</th><th>Status</th></tr></thead>
        <tbody>${mine.map(station => `<tr><td>${escapeHtml(station.name)}</td><td>${escapeHtml(station.fuelType)}</td>
          <td>₱${station.price.toFixed(2)}</td><td>${station.verified
            ? '<span class="badge badge-success">Verified</span>'
            : '<span class="badge badge-warning">Pending</span>'}</td></tr>`).join("")}</tbody></table>`
      : `<p class="hint">You haven't reported a station or fuel price yet — try it from the Map page.</p>`;
  } catch (error) {
    stationsBox.innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message || "Could not load your profile.")}</div>`;
  }
})();

document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await signOut();
  } catch (error) {
    console.error("The API logout request failed.", error);
  }
  window.location.href = "index.html";
});
