"use strict";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && (data.error || data.message) ? (data.error || data.message) : "REQUEST_FAILED";
    throw new Error(msg);
  }
  return data;
}

function $(id) { return document.getElementById(id); }

window.addEventListener("DOMContentLoaded", () => {
  const invite = $("invite_code");
  const username = $("username");
  const pin = $("pin");
  const btn = $("btnSignup");
  const status = $("status");
  const out = $("out");

  btn.addEventListener("click", async () => {
    status.textContent = "Working...";
    out.textContent = "";

    try {
      const payload = {
        invite_code: invite.value.trim(),
        username: username.value.trim(),
        pin: pin.value,
      };

      const data = await postJson("/api/auth/signup-invite", payload);

      // Store token (overwrite any existing admin token) using all legacy keys
      if (data && data.token) {
        try {
          localStorage.removeItem("mep_auth_token");
          localStorage.removeItem("mep_token");
          localStorage.removeItem("token");
        } catch (e) {}
        try {
          localStorage.setItem("mep_auth_token", data.token);
          localStorage.setItem("mep_token", data.token);
          localStorage.setItem("token", data.token);
        } catch (e) {}
      }

      status.textContent = "Account created. Redirecting to app...";
      out.textContent = JSON.stringify(data, null, 2);

      setTimeout(() => {
        window.location.href = "/app.html";
      }, 800);
    } catch (e) {
      status.textContent = "Failed";
      out.textContent = String(e && e.message ? e.message : e);
    }
  });
});
