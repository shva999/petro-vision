/* ============================================================
   PetroVision — js/rewards.js
   ------------------------------------------------------------
   Shows the logged-in user's badge and progress toward the next
   tier, a static "how to earn points" guide, the full
   leaderboard and this user's recent point-earning activity from the API.
   ============================================================ */

const username = requireAuth();
paintNavUser();

// ---------- how to earn points ----------
function initials(fullName) {
  return fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

(async function loadRewards() {
  try {
    const [account, leaderboard, activity, user, rules] = await Promise.all([
      getRewardAccount(), getLeaderboard(), getActivity(), getCurrentUser(), getPublicRewardRules()
    ]);
    const pointsById = Object.fromEntries(rules.map(rule => [rule.id, rule.points]));
    const guide = [
      ["Report a new fuel station or price", pointsById["price-report"]],
      ["Update a station's fuel availability", pointsById["availability-report"]],
      ["Log a refuel in your History", pointsById["refuel-log"]],
      ["Save a trip estimate to your History", pointsById["trip-log"]],
      ["Add a vehicle to your Garage", pointsById["new-vehicle"]],
      ["Set up a Fuel Price Alert", pointsById["new-alert"]]
    ];
    document.getElementById("points-guide").innerHTML = guide
      .map(([label, points]) => `<li>${label} — <strong>+${points ?? 0} pts</strong></li>`).join("");
    const badge = getBadge(account.points);
    const badgeIndex = BADGES.indexOf(badge);
    const nextBadge = BADGES[badgeIndex + 1];
    document.getElementById("my-badge").textContent = badge.name;
    document.getElementById("my-badge").style.background = badge.color;
    document.getElementById("my-points").textContent = `${account.points} pts`;
    if (nextBadge) {
      const progress = ((account.points - badge.min) / (nextBadge.min - badge.min)) * 100;
      document.getElementById("progress-fill").style.width = `${Math.min(100, progress).toFixed(0)}%`;
      document.getElementById("progress-hint").textContent = `${nextBadge.min - account.points} points to go until "${nextBadge.name}."`;
    } else {
      document.getElementById("progress-fill").style.width = "100%";
      document.getElementById("progress-hint").textContent = "You've reached the highest tier. Legendary!";
    }
    document.getElementById("leaderboard").innerHTML = leaderboard.map((entry, i) => {
      const isMe = entry.user.id === user.id;
      return `<div class="leaderboard-row ${isMe ? "me" : ""}">
        <span class="rank">#${i + 1}</span><span class="avatar">${initials(entry.user.displayName)}</span>
        <span class="name">${escapeHtml(entry.user.displayName)}${isMe ? " (you)" : ""}</span>
        <span class="pts">${entry.points} pts</span></div>`;
    }).join("") || `<p class="hint">No contributors yet.</p>`;
    document.getElementById("activity-feed").innerHTML = activity.length
      ? activity.slice(0, 10).map(item => {
          const labels = {
            signup: "Created an account",
            "price-report": "Reported a fuel price",
            "availability-report": "Updated station availability",
            "station-suggestion": "Suggested a station",
            "new-vehicle": "Added a vehicle",
            "trip-log": "Saved a trip",
            "refuel-log": "Logged a refuel",
            "new-alert": "Created a price alert"
          };
          return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--line); padding-bottom:8px;">
            <span>${escapeHtml(labels[item.reason] || item.reason)}</span><span style="font-weight:700; color:var(--accent);">+${item.amount}</span></div>`;
        }).join("")
      : `<p class="hint">Nothing yet — go report a station or log a trip!</p>`;
  } catch (error) {
    document.getElementById("activity-feed").innerHTML = `<div class="banner banner-danger">${escapeHtml(error.message)}</div>`;
  }
})();
