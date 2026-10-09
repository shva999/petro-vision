/* ============================================================
   PetroVision — js/dashboard.js
   ------------------------------------------------------------
   Fills in the welcome message, the three quick-stat tiles, and
   the feature grid on dashboard.html.
   ============================================================ */

requireAuth();
paintNavUser();

// Each feature card: title, one-line description, and the
// page it links to. Kept as one array so it's easy to add a
// feature later without touching the HTML.
const FEATURES = [
  { title: "Crowdsourced Map", desc: "Real-time station locations and prices.", href: "map.html" },
  { title: "Trip Cost Estimator", desc: "Estimate fuel cost for your next trip.", href: "trip-estimator.html" },
  { title: "Refuel & Trip History", desc: "Your past trips and refueling log.", href: "history.html" },
  { title: "Rewards", desc: "Earn points for accurate contributions.", href: "rewards.html" },
  { title: "Vehicle Garage", desc: "Manage your registered vehicles.", href: "garage.html" },
  { title: "Price Alerts", desc: "Get notified when prices hit your target.", href: "alerts.html" },
  { title: "Availability Tracker", desc: "Check which stations have stock.", href: "availability.html" },
];

document.getElementById("feature-grid").innerHTML = FEATURES.map(f => `
  <article class="feature-card">
    <h3>${f.title}</h3>
    <p>${f.desc}</p>
    <a href="${f.href}">Open →</a>
  </article>
`).join("");

(async function loadDashboard() {
  try {
    const [user, account, vehicles] = await Promise.all([getCurrentUser(), getRewardAccount(), getVehicles()]);
    const badge = getBadge(account.points);
    document.getElementById("welcome-heading").textContent = `Welcome back, ${user.displayName.split(" ")[0]}.`;
    document.getElementById("stat-points").textContent = account.points;
    document.getElementById("stat-badge").innerHTML = `<span class="tier-badge" style="background:${badge.color}">${badge.name}</span>`;
    document.getElementById("stat-misc").textContent = `${vehicles.length} vehicles · ${account.contributions} contributions`;
  } catch (error) {
    document.getElementById("banner").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  }
})();
