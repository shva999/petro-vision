/* ============================================================
   PetroVision — js/auth.js
   ------------------------------------------------------------
   Powers index.html: switching between the Log In and Sign Up
   forms, and authenticating against the PetroVision API.

   If someone is already logged in and lands back on this page
   (e.g. they hit the back button), send them straight to the
   dashboard instead of showing the login form again.
   ============================================================ */

const activeSession = getSession();
if (activeSession?.user) {
  window.location.href = activeSession.user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
} else if (activeSession) {
  clearSession();
}

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const banner = document.getElementById("banner");

function showTab(which) {
  const isLogin = which === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabSignup.classList.toggle("active", !isLogin);
  loginForm.style.display = isLogin ? "block" : "none";
  signupForm.style.display = isLogin ? "none" : "block";
  banner.innerHTML = "";
  banner.className = "";
}

tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const user = await signIn(email, password);
    window.location.href = user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
  } catch (error) {
    banner.textContent = error.message;
    banner.className = "banner banner-danger";
  } finally {
    button.disabled = false;
  }
});

signupForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  const fullName = document.getElementById("signup-fullname").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  const button = signupForm.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const user = await signUp(fullName, email, password);
    window.location.href = user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
  } catch (error) {
    banner.textContent = error.message;
    banner.className = "banner banner-danger";
  } finally {
    button.disabled = false;
  }
});
