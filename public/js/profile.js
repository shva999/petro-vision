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
    const [user, account, vehicles, history, stations] = await Promise.all([
      getCurrentUser(), getRewardAccount(), getVehicles(), getHistory(), getStations()
    ]);
    const badge = getBadge(account.points);
    document.getElementById("profile-avatar").textContent = initials(user.displayName);
    document.getElementById("profile-name").textContent = user.displayName;
    document.getElementById("profile-username").textContent = user.email;
    document.getElementById("profile-badge").textContent = badge.name;
    document.getElementById("profile-badge").style.background = badge.color;
    document.getElementById("profile-joined").textContent = user.createdAt.slice(0, 10);
    document.getElementById("profile-points").textContent = account.points;
    document.getElementById("profile-submissions").textContent = account.contributions;
    document.getElementById("profile-vehicles").textContent = vehicles.length;
    document.getElementById("profile-history").textContent = history.length;
    const mine = stations.filter(station => station.submittedBy === user.id && station.fuelType);
    if (mine.length === 0) {
      stationsBox.innerHTML = `<p class="hint">You haven't reported a station or fuel price yet — try it from the Map page.</p>`;
    } else {
      stationsBox.innerHTML = `<table><thead><tr><th>Station</th><th>Fuel</th><th>Price</th><th>Status</th></tr></thead>
        <tbody>${mine.map(station => `        <tr><td>${escapeHtml(station.name)}</td><td>${escapeHtml(station.fuelType)}</td>
          <td>₱${station.price.toFixed(2)}</td><td>${station.verified
            ? '<span class="badge badge-success">Verified</span>'
            : '<span class="badge badge-warning">Pending</span>'}</td></tr>`).join("")}</tbody></table>`;
    }
  } catch (error) {
    stationsBox.innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
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
