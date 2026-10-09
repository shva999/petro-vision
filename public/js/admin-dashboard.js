requireAdmin();
paintNavUser();

function statusBadge(status) {
  const cls = status === "approved" ? "badge-success" : status === "rejected" ? "badge-danger" : "badge-warning";
  return `<span class="badge ${cls}">${status[0].toUpperCase()}${status.slice(1)}</span>`;
}
function showBanner(message, type = "success") {
  document.getElementById("banner").innerHTML = `<div class="banner banner-${type}">${escapeHtml(message)}</div>`;
}
function renderReports(reports) {
  const filter = document.getElementById("report-filter").value.toLowerCase();
  const rows = reports.filter(report => filter === "all" || report.status === filter);
  document.getElementById("report-table").innerHTML = rows.map(report => {
    const actions = report.status === "pending"
      ? `<button class="btn btn-sm" onclick="reviewReport('${escapeHtml(report.id)}', 'approved')">Approve</button>
         <button class="btn btn-sm btn-danger" onclick="reviewReport('${escapeHtml(report.id)}', 'rejected')">Reject</button>`
      : `<span class="hint">Reviewed</span>`;
    return `<tr><td><strong>${escapeHtml(report.station?.name || "Station")}</strong><br><span class="hint">${escapeHtml(report.station?.address || "")}</span></td>
      <td>${escapeHtml(report.contributor?.displayName || report.contributor?.email || "Driver")}</td>
      <td>${escapeHtml(report.fuelType)}<br>₱${Number(report.price).toFixed(2)}</td>
      <td>${new Date(report.reportedAt).toLocaleDateString()}</td><td>${statusBadge(report.status)}</td><td>${actions}</td></tr>`;
  }).join("") || `<tr><td colspan="6" class="hint">No reports in this category.</td></tr>`;
}
function renderAudit(audit) {
  document.getElementById("audit-table").innerHTML = audit.slice(0, 30).map(log =>
    `<tr><td>${new Date(log.createdAt).toLocaleString()}</td><td>${escapeHtml(log.actorEmail)}</td>
      <td>${escapeHtml(log.action)}</td><td>${escapeHtml(log.entity)} ${escapeHtml(log.entityId)}</td><td>${escapeHtml(JSON.stringify(log.details))}</td></tr>`
  ).join("") || `<tr><td colspan="5" class="hint">No audit activity yet.</td></tr>`;
}

let reports = [];
async function render() {
  const [dashboard, audit] = await Promise.all([getAdminDashboard(), getAdminAudit()]);
  reports = await getAdminReports();
  document.getElementById("stat-pending").textContent = reports.filter(report => report.status === "pending").length;
  document.getElementById("stat-approved").textContent = reports.filter(report => report.status === "approved").length;
  document.getElementById("stat-rejected").textContent = reports.filter(report => report.status === "rejected").length;
  document.getElementById("stat-audit").textContent = audit.length;
  document.getElementById("stat-approved").title = `${dashboard.activeStations} verified stations`;
  renderReports(reports);
  renderAudit(audit);
}
window.reviewReport = async function(id, status) {
  try {
    await setReportStatus(id, status);
    showBanner(`Report ${status}.`);
    await render();
  } catch (error) {
    showBanner(error.message, "danger");
  }
};
document.getElementById("report-filter").addEventListener("change", () => renderReports(reports));
document.getElementById("logout-link").addEventListener("click", async event => {
  event.preventDefault();
  try {
    await signOut();
  } catch (error) {
    console.error("The API logout request failed.", error);
  }
  location.href = "index.html";
});
render().catch(error => showBanner(error.message, "danger"));
