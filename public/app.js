/* app.js - DEV-safe + Login + Profile Onboarding (Full Address) + Projects cache + Materials Option-1 */
// --- Phase 4.1: Auth token bridge for embedded pages (SAFE) ---
window.getMepAuthToken = function getMepAuthToken() {
  return (
    localStorage.getItem("mep_auth_token") ||
    localStorage.getItem("mep_token") ||
    localStorage.getItem("token") ||
    null
  );
};
window.__mepDispatchAuthChanged = function __mepDispatchAuthChanged() {
  try { window.dispatchEvent(new Event("mep-auth-changed")); } catch (e) {}
};
// -------------------------------------------------------------


// TOKEN_BRIDGE_MEP
(function(){
  function sync(){
    try{
      const t =
        localStorage.getItem("token") ||
        localStorage.getItem("mep_token") ||
        localStorage.getItem("mep_auth_token") ||
        "";
      if (t) {
        localStorage.setItem("token", t);
        localStorage.setItem("mep_token", t);
        localStorage.setItem("mep_auth_token", t);
      
  window.__mepDispatchAuthChanged();
}
    }catch(e){}
  }
  sync();
  window.addEventListener("storage", sync);
  setInterval(sync, 1500);
})();
const API_BASE = "";
const LS_AUTH_TOKEN = "mep_auth_token";
let mustCompleteNow = false;
// Unified auth token helpers (read/write across legacy keys)
function readAuthToken(){
  const t =
    localStorage.getItem("mep_auth_token") ||
    localStorage.getItem("mep_token") ||
    localStorage.getItem("token") ||
    null;
  return t && String(t).trim() ? String(t).trim() : null;
}
function writeAuthToken(t){
  const v = (t && String(t).trim()) ? String(t).trim() : "";
  if(!v) return;
  try{
    localStorage.setItem("mep_auth_token", v);
    localStorage.setItem("mep_token", v);
    localStorage.setItem("token", v);
  }catch(e){}
  try{ window.__mepDispatchAuthChanged(); }catch(e){}
}
function clearAuthToken(){
  try{
    localStorage.removeItem("mep_auth_token");
    localStorage.removeItem("mep_token");
    localStorage.removeItem("token");
  }catch(e){}
  try{ window.__mepDispatchAuthChanged(); }catch(e){}
}
 // profile completion gate state (set by enforceProfileGate)

// Materials local storage
const LS_MAT_DRAFT_PREFIX = "mep_mat_draft_";
const LS_MAT_SUBMITTED_PREFIX = "mep_mat_submitted_";

// Foreman option-1
const LS_FOREMAN_SELECTED_PROJECT = "foreman_selected_project_id";

const MAT_CUTOFF_HOUR = 12;
const MAT_CUTOFF_MIN = 30;

function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return [...document.querySelectorAll(sel)]; }

function toast(msg, ms=2600){
  const el = qs("#toast");
  if(!el) return alert(msg);
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>el.classList.add("hidden"), ms);
}

function showAlert(title, message){
  const existing = document.getElementById("alertOverlay");
  if(existing) existing.remove();
  const overlay = document.createElement("div");
  overlay.id="alertOverlay";
  overlay.style.position="fixed";
  overlay.style.inset="0";
  overlay.style.background="rgba(0,0,0,.5)";
  overlay.style.display="flex";
  overlay.style.alignItems="center";
  overlay.style.justifyContent="center";
  overlay.style.zIndex="9999";
  overlay.innerHTML = `
    <div style="background:#fff;padding:24px;border-radius:12px;max-width:560px;width:92%;
      box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
      <h3 style="margin:0 0 12px 0;">${title}</h3>
      <p style="margin:0 0 18px 0; line-height:1.45; white-space:pre-line;">${message}</p>
      <button id="alertOkBtn" class="btn primary">OK</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("alertOkBtn").onclick=()=>overlay.remove();
  overlay.addEventListener("click",(e)=>{ if(e.target===overlay) overlay.remove(); });
}

async function fetchJson(path, opts={}){
  const token = readAuthToken();

  // Normalize headers (supports plain object or Headers instance)
  const baseHeaders = {};
  try{
    if(opts.headers){
      if(typeof opts.headers.forEach === "function"){
        opts.headers.forEach((v,k)=>{ baseHeaders[k]=v; });
      }else{
        Object.assign(baseHeaders, opts.headers);
      }
    }
  }catch(e){}

  // Ensure JSON content-type unless explicitly overridden
  if(!baseHeaders["Content-Type"] && !baseHeaders["content-type"]){
    baseHeaders["Content-Type"] = "application/json";
  }

  // Force Authorization when we have a token (prevents accidental override)
  if(token){
    baseHeaders["Authorization"] = "Bearer " + token;
  }

  // IMPORTANT: spread opts first then force our normalized headers.
  // If we spread opts after headers, opts.headers would overwrite Authorization.
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: baseHeaders,
  });

  const text = await res.text();
  let data=null;
  try{ data = text?JSON.parse(text):null; }catch{ data=text; }
  if(!res.ok){
    const msg = (data && data.error)?data.error:`HTTP ${res.status}`;
    const err = new Error(msg);
    err.status=res.status;
    err.data=data;
    throw err;
  }
  return data;
}


async function registerServiceWorkerForAttendance(){
  try{
    if(!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.register("/sw.js");
    return !!reg;
  }catch(e){
    return false;
  }
}

async function ensureNotificationPermission(){
  try{
    if(!("Notification" in window)) return false;
    if(Notification.permission === "granted") return true;
    if(Notification.permission === "denied") return false;
    const p = await Notification.requestPermission();
    return p === "granted";
  }catch(e){
    return false;
  }
}

// Expose fetchJson globally (used by daily attendance script)
window.fetchJson = fetchJson;

// Project cache for labels (used by daily attendance script)
window.PROJECTS_CACHE = [];

const Endpoints = {
  login:"/api/auth/login",
  whoami:"/api/auth/whoami",
  projects:"/api/projects",

  // Profile
  profileMe:"/api/profile/me",
  profileDropdowns:"/api/profile/dropdowns",
  profileCreate:"/api/profile",

  // Materials
  materialsSubmit:"/api/materials/submit",

  // Foreman Option-1
  foremanProjects:"/api/materials/foreman/projects",
  foremanWorkspace:"/api/materials/foreman/workspace",
  ticketAddItems:"/api/materials/foreman/ticket/items",
  ticketSend:"/api/materials/foreman/ticket/send"
};

function todayISODate(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function isAfterCutoff(now=new Date()){
  const h=now.getHours(), m=now.getMinutes();
  if(h>MAT_CUTOFF_HOUR) return true;
  if(h<MAT_CUTOFF_HOUR) return false;
  return m>=MAT_CUTOFF_MIN;
}
function getToken(){
  return readAuthToken();
}
function setToken(t){ writeAuthToken(t); }
function clearToken(){ clearAuthToken(); }

// state
let CURRENT_USER=null;
let IS_FOREMAN_CAP=false;
let FOREMAN_PROJECTS=[];
let WORKSPACE_CACHE=null;

// Profile completion gate (UI-only in Step 2)
let PROFILE_GATED = false;
const LS_PROFILE_DONE_PREFIX = "mep_profile_done_user_";
function profileDoneKey(){
  const uid = (CURRENT_USER && (CURRENT_USER.employee_id || CURRENT_USER.user_id || CURRENT_USER.id)) ? String(CURRENT_USER.employee_id || CURRENT_USER.user_id || CURRENT_USER.id) : "anon";
  return LS_PROFILE_DONE_PREFIX + uid;
}
function isProfileCompletedLocal(){
  try { return localStorage.getItem(profileDoneKey()) === "1"; } catch(e){ return false; }
}
function setProfileCompletedLocal(val){
  try { localStorage.setItem(profileDoneKey(), val ? "1" : "0"); } catch(e){}
}


// --- Role gating (UI-only, D1) ---
function normalizeRole(r){
  return String(r || "").trim().toUpperCase();
}
function isViewAllowedForRole(view, role){
  const v = String(view || "");
  const rr = normalizeRole(role);
  if(rr === "ADMIN") return true;
  if(rr === "FOREMAN"){
    return !["admin"].includes(v);
  }
  // WORKER / default
  return !["admin","reports","assignments"].includes(v);
}
function applyRoleTabVisibility(){
  const role = normalizeRole(CURRENT_USER?.role);
  const tabs = qsa(".tab");
  tabs.forEach(btn=>{
    const v = btn.dataset.view;
    // Hide admin/reports/assignments for unauthorized roles
    if(!isViewAllowedForRole(v, role)){
      btn.style.display = "none";
    }else{
      btn.style.display = "";
    }
  });
}

function ensureAssignmentsIframeForRole(role){
  // Assignments V2 is embedded (no iframe). Keep the same function name for backward compatibility.
  const normRole = normalizeRole(role);
  if(normRole === "ADMIN"){
    // Do not auto-init in background; init when user opens the Assignments view.
    return;
  }
}

function initAssignmentsV2Once(){
  if(window.__assignmentsV2Inited) return;
  window.__assignmentsV2Inited = true;
  // Inline Assignments V2 logic extracted from assignments_v2.html (kept as-is, scoped in an IIFE).
  (function(){

/* --- Phase 4.1: robust token + auto-retry (SAFE) --- */
function getAuthToken() {
  // Same-origin iframe shares localStorage; also allow parent bridge.
  try {
    if (window.parent && window.parent !== window && typeof window.parent.getMepAuthToken === "function") {
      const t = window.parent.getMepAuthToken();
      if (t) return t;
    }
  } catch (e) {}
  return (
    localStorage.getItem("mep_auth_token") ||
    localStorage.getItem("mep_token") ||
    getAuthToken() ||
    null
  );
}

async function waitForToken(timeoutMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const t = getAuthToken();
    if (t) return t;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function onAuthChanged(handler) {
  try { window.addEventListener("mep-auth-changed", handler); } catch (e) {}
  try { window.addEventListener("storage", (ev) => {
    if (!ev) return;
    if (ev.key === "mep_auth_token" || ev.key === "mep_token" || ev.key === "token") handler();
  }); } catch (e) {}
}
/* -------------------------------------------------- */


(function() {
  const $ = (id) => document.getElementById(id);
  const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };

  const state = {
    employees: [],
    projects: [],
    assignments: [],
    myRequests: [],
    inbox: [],
    pendingDecision: null,
    pendingEdit: null,
    lastAssignmentsUpdatedAt: null
  };

  const SHIFT_OPTIONS = [
    { value: "06:00-14:30", label: "Day – 06:00-14:30 (default)" },
    { value: "14:30-23:00", label: "Evening – 14:30-23:00" },
    { value: "23:00-06:00", label: "Night – 23:00-06:00" },
    { value: "CUSTOM", label: "Custom…" }
  ];

  function yyyyMmDd(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  function shortDate(v) {
    if (!v) return "";
    const s = String(v);
    return s.length >= 10 ? s.substring(0,10) : s;
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function setDefaultDatesTomorrow() {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const v = yyyyMmDd(tomorrow);
    $("inpFrom").value = v;
    $("inpTo").value = v;
  }

  function initShiftSelect(sel, customWrap, customInput) {
    sel.innerHTML = "";
    for (const o of SHIFT_OPTIONS) {
      const opt = document.createElement("option");
      opt.value = o.value;
      opt.textContent = o.label;
      sel.appendChild(opt);
    }
    sel.value = "06:00-14:30";
    customWrap.classList.add("hidden");
    customInput.value = "";

    sel.addEventListener("change", () => {
      const v = sel.value;
      if (v === "CUSTOM") {
        customWrap.classList.remove("hidden");
        setTimeout(() => customInput.focus(), 0);
      } else {
        customWrap.classList.add("hidden");
        customInput.value = "";
      }
    });
  }

  function getToken() {
    const keys = ["token", "auth_token", "jwt", "access_token"];
    for (const k of keys) {
      const v = (localStorage.getItem(k) || "").trim();
      if (v) return v.startsWith("Bearer ") ? v : "Bearer " + v;
    }
    return "";
  }

  function setOk(el, text) { if (!el) return; el.classList.remove("hidden"); el.classList.remove("error"); el.classList.add("ok"); el.textContent = text; }
  function setErr(el, text) { if (!el) return; el.classList.remove("hidden"); el.classList.remove("ok"); el.classList.add("error"); el.textContent = text; }
  function clearMsg(el) { if (!el) return; el.classList.add("hidden"); el.textContent = ""; }

  async function api(path, opts = {}) {
  const __token = getAuthToken();

    const headers = Object.assign({}, opts.headers || {});
    headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) headers["Authorization"] = token;

    const res = await fetch(path, Object.assign({}, opts, { headers }));
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = (data && (data.error || data.message))
        ? (data.error + (data.message ? (": " + data.message) : ""))
        : (res.status + " " + res.statusText);
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function activate(tab) {
    const map = { create:["tabCreate","viewCreate"], list:["tabList","viewList"], requests:["tabRequests","viewRequests"] };
    for (const k of Object.keys(map)) {
      const [tb, vw] = map[k];
      $(tb).classList.toggle("active", k === tab);
      $(vw).classList.toggle("hidden", k !== tab);
    }
  }

  function fillSelect(sel, items, getLabel) {
    sel.innerHTML = "";
    for (const it of items) {
      const opt = document.createElement("option");
      opt.value = it.id;
      opt.textContent = getLabel(it);
      sel.appendChild(opt);
    }
  }

  function employeeLabel(row) {
    const code = row.employee_code ? (row.employee_code + " - ") : "";
    const name = row.employee_name || ("Employee #" + row.employee_id);
    return (code + name).trim();
  }
  function projectLabel(row) {
    const code = row.project_code ? (row.project_code + " - ") : "";
    const name = row.project_name || ("Project #" + row.project_id);
    return (code + name).trim();
  }

  async function loadEmployeesProjects() {
  const token = await waitForToken(3000);
  if (!token) {
    try { setErr && setErr('PLEASE_LOGIN'); } catch (e) {}
    return;
  }

    const empData = await api("/api/employees", { method: "GET" });
    state.employees = empData.rows || empData.items || empData || [];

    const projData = await api("/api/projects", { method: "GET" });
    state.projects = projData.rows || projData.items || projData || [];
  }

  function passesRangeFilter(row) {
    const mode = $("listRange").value;
    if (mode === "all") return true;

    const s = row.start_date ? startOfDay(new Date(shortDate(row.start_date))) : null;
    if (!s) return true;

    const today = startOfDay(new Date());
    if (mode === "today") return s.getTime() === today.getTime();
    if (mode === "tomorrow") {
      const t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      return s.getTime() === t.getTime();
    }
    if (mode === "week") {
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
      return s >= today && s < end;
    }
    return true;
  }

  function sortRows(rows) {
    const mode = $("listSort").value;
    const out = [...rows];

    const safe = (v) => (v || "").toString().toLowerCase();

    out.sort((a, b) => {
      if (mode === "employee_asc") {
        return safe(employeeLabel(a)).localeCompare(safe(employeeLabel(b)));
      }
      if (mode === "project_asc") {
        return safe(projectLabel(a)).localeCompare(safe(projectLabel(b)));
      }

      // date sorts
      const da = shortDate(a.start_date);
      const db = shortDate(b.start_date);
      if (mode === "date_asc") {
        if (da < db) return -1;
        if (da > db) return 1;
      } else {
        if (da < db) return 1;
        if (da > db) return -1;
      }
      return Number(b.id || 0) - Number(a.id || 0);
    });

    return out;
  }

  function renderAssignments() {
    const q = ($("listSearch").value || "").trim().toLowerCase();
    const body = $("listBody");
    body.innerHTML = "";

    let rows = Array.isArray(state.assignments) ? state.assignments : [];
    rows = rows.filter(passesRangeFilter);

    if (q) {
      rows = rows.filter(r => {
        const hay = (employeeLabel(r) + " " + projectLabel(r) + " " + (r.shift || "")).toLowerCase();
        return hay.includes(q);
      });
    }

    rows = sortRows(rows);

    $("listCountChip").textContent = `${rows.length} assignment(s)`;
    $("listUpdatedChip").textContent = `Updated: ${state.lastAssignmentsUpdatedAt || "-"}`;

    for (const r of rows) {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          <button class="btn small" data-act="modify" data-id="${r.id}">Request Modify</button>
          <button class="btn small danger" data-act="cancel" data-id="${r.id}">Request Cancel</button>
        </td>
        <td>${escapeHtml(employeeLabel(r))}</td>
        <td>${escapeHtml(projectLabel(r))}</td>
        <td>${escapeHtml(shortDate(r.start_date))}</td>
        <td>${escapeHtml(shortDate(r.end_date))}</td>
        <td><span class="pill">${escapeHtml(r.shift || "06:00-14:30")}</span></td>
        <td class="right">${escapeHtml(String(r.id ?? ""))}</td>
      `;

      body.appendChild(tr);

      tr.querySelectorAll("button[data-act]").forEach(btn => {
        const act = btn.getAttribute("data-act");
        btn.addEventListener("click", () => {
          if (act === "modify") openEditModal(r);
          if (act === "cancel") submitCancelRequest(r);
        });
      });
    }
  }

  async function refreshAssignments() {
    clearMsg($("listErr"));
    try {
      const data = await api("/api/assignments_v2", { method: "GET" });
      state.assignments = data.rows || data.items || data || [];
      state.lastAssignmentsUpdatedAt = new Date().toLocaleString();
      renderAssignments();
    } catch (e) {
      setErr($("listErr"), "❌ " + e.message);
    }
  }

  
  function employeeLabelById(empId) {
    const id = String(empId ?? "");
    if (!id) return "";
    const e = (state.employees || []).find(x => String(x.id) === id);
    if (!e) return `Employee: ${id}`;
    const code = e.employee_code ? `${e.employee_code} - ` : "";
    const name = [e.first_name, e.last_name].filter(Boolean).join(" ").trim();
    return `${code}${name || `Employee ${id}`}`;
  }

  function projectLabelById(projectId) {
    const id = String(projectId ?? "");
    if (!id) return "";
    const p = (state.projects || []).find(x => String(x.id) === id);
    if (!p) return `Project: ${id}`;
    const code = p.project_code ? `${p.project_code} - ` : "";
    const name = p.project_name || `Project ${id}`;
    return `${code}${name}`;
  }

// Requests rendering with search
  function renderMyRequests() {
    const q = ($("mineSearch").value || "").trim().toLowerCase();
    const body = $("mineBody");
    body.innerHTML = "";

    let rows = Array.isArray(state.myRequests) ? state.myRequests : [];
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));

    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="pill">${escapeHtml(r.request_type)}</span></td>
        <td><span class="pill">${escapeHtml(r.status)}</span></td>
        <td>${escapeHtml(String(r.requested_for_employee_id ?? ""))}</td>
        <td>${escapeHtml(String(r.project_id ?? ""))}</td>
        <td>${escapeHtml(shortDate(r.start_date))}</td>
        <td>${escapeHtml(shortDate(r.end_date))}</td>
        <td class="right">${escapeHtml(String(r.id))}</td>
      `;
      body.appendChild(tr);
    }
  }

  function renderInbox() {
    const q = ($("inboxSearch").value || "").trim().toLowerCase();
    const list = $("inboxList");
    if (!list) return;
    list.innerHTML = "";

    let rows = Array.isArray(state.inbox) ? state.inbox : [];
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.marginTop = "8px";
      empty.textContent = "No requests.";
      list.appendChild(empty);
      return;
    }

    for (const r of rows) {
      const status = String(r.status || "");
      const isPending = status === "PENDING";

      const card = document.createElement("div");
      card.className = "req-card " + (isPending ? "pending" : "decided");

      const type = String(r.request_type || "").replaceAll("_", " ");
      const emp = String(r.requested_for_employee_id ?? "");
      const proj = String(r.project_id ?? "");
      const from = shortDate(r.start_date);
      const to = shortDate(r.end_date);

      const metaTop = `#${r.id} • ${from} → ${to}`;

      const extra = (!isPending)
        ? `<div class="req-extra">
             <div><span class="kv">Decision:</span> ${escapeHtml(status)} • <span class="kv">at:</span> ${escapeHtml(shortDate(r.decision_at) || "")}</div>
             <div><span class="kv">Note:</span> ${escapeHtml(r.decision_note || "")}</div>
           </div>`
        : "";

      card.innerHTML = `
        <div class="req-head">
          <div>
            <div class="req-badges">
              <span class="badge primary">${escapeHtml(type)}</span>
              <span class="badge">${escapeHtml(status)}</span>
              <span class="kv">${escapeHtml(metaTop)}</span>
            </div>
            <div class="req-title"><span class="kv">Employee:</span> ${escapeHtml(emp)} &nbsp; • &nbsp; <span class="kv">Project:</span> ${escapeHtml(proj)}</div>
            <div class="req-sub"><span class="kv">Dates:</span> ${escapeHtml(from)} → ${escapeHtml(to)}</div>
            ${extra}
          </div>
          <div class="req-actions">
            <button class="btn small primary" data-act="approve" data-id="${r.id}">Approve</button>
            <button class="btn small danger" data-act="reject" data-id="${r.id}">Reject</button>
          </div>
        </div>
      `;

      list.appendChild(card);

      if (isPending) {
        card.querySelectorAll("button[data-act]").forEach(btn => {
          btn.addEventListener("click", () => {
            const act = btn.getAttribute("data-act");
            openDecisionModal({
              requestId: r.id,
              decision: act === "approve" ? "APPROVE" : "REJECT",
              meta: `#${r.id} • ${r.request_type} • ${from} → ${to} • ${employeeLabelById(emp)} • ${projectLabelById(proj)}`
            });
          });
        });
      }
    }
  }

  async function refreshRequests() {
    clearMsg($("mineErr"));
    clearMsg($("inboxErr"));
    clearMsg($("inboxOk"));

    try {
      const mine = await api("/api/assignment-requests/mine", { method: "GET" });
      state.myRequests = mine.items || mine.rows || mine || [];
      renderMyRequests();
    } catch (e) {
      setErr($("mineErr"), "❌ " + e.message);
    }

    try {
      const inbox = await api("/api/assignment-requests/inbox", { method: "GET" });
      state.inbox = inbox.items || inbox.rows || inbox || [];
      renderInbox();
    } catch (e) {
      setErr($("inboxErr"), "❌ " + e.message);
    }
  }

  // Decision modal
  function openDecisionModal({ requestId, decision, meta }) {
    state.pendingDecision = { requestId, decision };

    const isApprove = (decision === "APPROVE");
    $("modalTitle").textContent = isApprove ? "Apply change" : "Discard proposal";
    $("modalMeta").textContent = meta;

    // UX-only labels (no logic changes)
    const confirm = $("btnModalConfirm");
    if (confirm) confirm.textContent = isApprove ? "Apply" : "Discard";

    const noteLabel = $("modalNoteLabel");
    if (noteLabel) noteLabel.textContent = isApprove ? "Note (optional)" : "Reason (optional)";

    $("modalNote").value = "";
    $("modalBackdrop").classList.remove("hidden");
    $("modalBackdrop").setAttribute("aria-hidden", "false");
    setTimeout(() => $("modalNote").focus(), 0);
  }
  function closeDecisionModal() {
    $("modalBackdrop").classList.add("hidden");
    $("modalBackdrop").setAttribute("aria-hidden", "true");
    state.pendingDecision = null;
  }
  async function decide(requestId, decision, note) {
    clearMsg($("inboxErr"));
    clearMsg($("inboxOk"));
    try {
      await api(`/api/assignment-requests/${requestId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note })
      });
      setOk($("inboxOk"), `✅ ${decision} OK for request #${requestId}`);
      await refreshUnifiedRequests();
      await refreshAssignments();
    } catch (e) {
      setErr($("inboxErr"), "❌ " + e.message);
      console.error(e);
    }
  }

  // Modify / Cancel requests from List
  function openEditModal(row) {
    clearMsg($("editErr"));
    clearMsg($("editOk"));

    state.pendingEdit = row;

    $("editMeta").textContent = `Assignment #${row.id} • ${employeeLabel(row)} • ${projectLabel(row)}`;

    // projects dropdown
    fillSelect($("editProject"), state.projects, (p) => {
      const code = p.project_code ? (p.project_code + " - ") : (p.code ? (p.code + " - ") : "");
      const name = p.name || p.project_name || ("Project " + p.id);
      return (code ? code : (p.id + " - ")) + name;
    });
    $("editProject").value = String(row.project_id);

    $("editFrom").value = shortDate(row.start_date);
    $("editTo").value = shortDate(row.end_date);

    // shift dropdown
    initShiftSelect($("editShift"), $("editShiftCustomWrap"), $("editShiftCustom"));
    const currentShift = (row.shift || "06:00-14:30").trim();
    const found = SHIFT_OPTIONS.some(o => o.value === currentShift);
    if (found) {
      $("editShift").value = currentShift;
    } else {
      $("editShift").value = "CUSTOM";
      $("editShiftCustomWrap").classList.remove("hidden");
      $("editShiftCustom").value = currentShift;
    }

    $("editNote").value = "";

    $("editBackdrop").classList.remove("hidden");
    $("editBackdrop").setAttribute("aria-hidden", "false");
  }

  function closeEditModal() {
    $("editBackdrop").classList.add("hidden");
    $("editBackdrop").setAttribute("aria-hidden", "true");
    state.pendingEdit = null;
  }

  function getEditShiftValue() {
    const v = $("editShift").value;
    if (v === "CUSTOM") return ($("editShiftCustom").value || "").trim();
    return v;
  }

  async function submitModifyRequest() {
    clearMsg($("editErr"));
    clearMsg($("editOk"));

    const row = state.pendingEdit;
    if (!row) return;

    const assignmentId = Number(row.id);
    const employeeId = Number(row.employee_id);
    const projectId = Number($("editProject").value);
    const start = $("editFrom").value || null;
    const end = $("editTo").value || null;
    const shift = getEditShiftValue();
    const note = ($("editNote").value || "").trim();

    if (!start || !end) { setErr($("editErr"), "Select dates."); return; }
    if ($("editShift").value === "CUSTOM" && !shift) { setErr($("editErr"), "Enter custom shift like 07:00-15:30."); return; }

    const payload_json = { assignment_id: assignmentId, project_id: projectId, start_date: start, end_date: end, shift, note };

    const body = {
      request_type: "UPDATE_ASSIGNMENT",
      requested_for_employee_id: employeeId,
      project_id: projectId,
      start_date: start,
      end_date: end,
      payload_json
    };

    try {
      const data = await api("/api/assignment-requests", { method: "POST", body: JSON.stringify(body) });
      const r = data.request || data;
      setOk($("editOk"), `✅ Modify request submitted (#${r.id})`);
      await refreshRequests();
      closeEditModal();
      activate("requests");
    } catch (e) {
      setErr($("editErr"), "❌ " + e.message);
      console.error(e);
    }
  }

  async function submitCancelRequest(row) {
    clearMsg($("listErr"));
    const assignmentId = Number(row.id);
    const employeeId = Number(row.employee_id);
    const projectId = Number(row.project_id);
    const start = shortDate(row.start_date);
    const end = shortDate(row.end_date);

    const payload_json = { assignment_id: assignmentId, note: "cancel request" };

    const body = {
      request_type: "CANCEL_ASSIGNMENT",
      requested_for_employee_id: employeeId,
      project_id: projectId,
      start_date: start,
      end_date: end,
      payload_json
    };

    try {
      const data = await api("/api/assignment-requests", { method: "POST", body: JSON.stringify(body) });
      const r = data.request || data;
      setOk($("listErr"), `✅ Cancel request submitted (#${r.id})`);
      await refreshRequests();
      activate("requests");
    } catch (e) {
      setErr($("listErr"), "❌ " + e.message);
      console.error(e);
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  // --- Unified Requests (Tabs + Scope) ---
  const reqState = { tab: "PENDING", scope: "mine", mine: [], all: [] };

  function setReqTab(tab) {
    reqState.tab = tab;
    const map = {
      PENDING: "reqTabPending",
      APPROVED: "reqTabApproved",
      REJECTED: "reqTabRejected",
      ALL: "reqTabAll"
    };
    Object.values(map).forEach(id => { if ($(id)) $(id).classList.remove("active"); });
    const activeId = map[tab];
    if ($(activeId)) $(activeId).classList.add("active");
    renderReqList();
  }

  async function loadReqMine() {
    const mine = await api("/api/assignment-requests/mine", { method: "GET" });
    reqState.mine = mine.items || mine.rows || mine || [];
  }

  async function loadReqAll() {
    const inbox = await api("/api/assignment-requests/inbox", { method: "GET" });
    reqState.all = inbox.items || inbox.rows || inbox || [];
  }

  function currentReqRows() {
    const scope = reqState.scope;
    let rows = (scope === "all") ? reqState.all : reqState.mine;

    if (reqState.tab !== "ALL") {
      rows = rows.filter(r => String(r.status || "") === reqState.tab);
    }

    const q = ($("reqSearch")?.value || "").trim().toLowerCase();
    if (q) rows = rows.filter(r => JSON.stringify(r).toLowerCase().includes(q));

    rows = [...rows].sort((a,b) => {
      const sa = String(a.status||"");
      const sb = String(b.status||"");
      const pa = (sa === "PENDING") ? 0 : 1;
      const pb = (sb === "PENDING") ? 0 : 1;
      if (pa !== pb) return pa - pb;
      const da = (a.created_at || a.decision_at || "").toString();
      const db = (b.created_at || b.decision_at || "").toString();
      if (da < db) return 1;
      if (da > db) return -1;
      return Number(b.id||0) - Number(a.id||0);
    });

    return rows;
  }

  function dateToMs(d) {
    if (!d) return null;
    // Expect YYYY-MM-DD
    const s = String(d).slice(0, 10);
    const t = Date.parse(s + "T00:00:00");
    return Number.isFinite(t) ? t : null;
  }

  function overlapsInclusive(aStartMs, aEndMs, bStartMs, bEndMs) {
    if (aStartMs == null || aEndMs == null || bStartMs == null || bEndMs == null) return false;
    return aStartMs <= bEndMs && bStartMs <= aEndMs;
  }

  function ageLabel(isoTs) {
    if (!isoTs) return "-";
    const t = Date.parse(String(isoTs));
    if (!Number.isFinite(t)) return "-";
    const diffMs = Date.now() - t;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  async function ensureAssignmentsForRequests() {
    // Keep this UI-only: we just need assignments to show "Before/After" context.
    if (Array.isArray(state.assignments) && state.assignments.length) return;
    try {
      const data = await api("/api/assignments_v2", { method: "GET" });
      state.assignments = data.rows || data.items || data || [];
      state.lastAssignmentsUpdatedAt = new Date().toLocaleString();
    } catch {
      // If assignments cannot be loaded, Requests still render (no conflict context).
      state.assignments = Array.isArray(state.assignments) ? state.assignments : [];
    }
  }

  function requestContext(r) {
    const empId = String(r.requested_for_employee_id ?? "");
    const startMs = dateToMs(r.start_date);
    const endMs = dateToMs(r.end_date);

    const overlaps = (Array.isArray(state.assignments) ? state.assignments : [])
      .filter(a => String(a.employee_id ?? "") === empId)
      .filter(a => overlapsInclusive(startMs, endMs, dateToMs(a.start_date), dateToMs(a.end_date)));

    return { startMs, endMs, empId, overlapsCount: overlaps.length };
  }

  function computePendingOverlapCounts(rows) {
    // UI-only: find overlaps between PENDING requests for the same employee.
    const pending = rows
      .filter(r => String(r.status || "") === "PENDING")
      .map(r => ({
        id: String(r.id),
        empId: String(r.requested_for_employee_id ?? ""),
        startMs: dateToMs(r.start_date),
        endMs: dateToMs(r.end_date)
      }))
      .filter(x => x.empId && x.startMs != null && x.endMs != null);

    const byEmp = new Map();
    for (const p of pending) {
      if (!byEmp.has(p.empId)) byEmp.set(p.empId, []);
      byEmp.get(p.empId).push(p);
    }

    const counts = new Map(); // id -> number of OTHER pending overlaps
    for (const [empId, list] of byEmp.entries()) {
      for (let i = 0; i < list.length; i++) {
        let c = 0;
        for (let j = 0; j < list.length; j++) {
          if (i === j) continue;
          if (overlapsInclusive(list[i].startMs, list[i].endMs, list[j].startMs, list[j].endMs)) c++;
        }
        counts.set(list[i].id, c);
      }
    }
    return counts;
  }


  function updateReqKpi(rows, smartById) {
    const box = $("reqKpi");
    if (!box) return;

    const pending = rows.filter(r => String(r.status || "") === "PENDING");

    const conflicts = pending.filter(r => (smartById.get(String(r.id))?.smartStatus === "CONFLICT")).length;
    const duplicates = pending.filter(r => (smartById.get(String(r.id))?.smartStatus === "DUPLICATE")).length;

    let oldest = "-";
    if (pending.length) {
      const oldestRow = [...pending].sort((a,b) => {
        const ta = Date.parse(String(a.created_at || "")) || 0;
        const tb = Date.parse(String(b.created_at || "")) || 0;
        return ta - tb;
      })[0];
      const label = ageLabel(oldestRow.created_at);
      oldest = (label && label !== "-") ? label : shortDate(oldestRow.created_at);
    }

    if ($("reqKpiPending")) $("reqKpiPending").textContent = String(pending.length);
    if ($("reqKpiConflicts")) $("reqKpiConflicts").textContent = String(conflicts);
    if ($("reqKpiDuplicates")) $("reqKpiDuplicates").textContent = String(duplicates);
    if ($("reqKpiOldest")) $("reqKpiOldest").textContent = String(oldest);

    box.classList.remove("hidden");
  }


  function renderReqList() {
    clearMsg($("reqErr"));
    clearMsg($("reqOk"));

    const list = $("reqList");
    if (!list) return;
    list.innerHTML = "";

    const rows = currentReqRows();

    // Build smart context cache for current rows (UI-only).
    const pendingOverlapCounts = computePendingOverlapCounts(rows);
    const smartById = new Map();

    for (const r of rows) {
      const rid = String(r.id);
      const ctx = requestContext(r);

      // Smart badge logic (single badge):
      // - CONFLICT: overlaps with EXISTING assignments OR missing dates
      // - DUPLICATE: overlaps with OTHER pending requests for same employee
      // - OK: none of the above
      let smartStatus = "OK";
      const missingDates = (ctx.startMs == null || ctx.endMs == null);

      const dupCount = pendingOverlapCounts.get(rid) || 0;
      if (missingDates) smartStatus = "CONFLICT";
      else if (ctx.overlapsCount > 0) smartStatus = "CONFLICT";
      else if (dupCount > 0) smartStatus = "DUPLICATE";

      smartById.set(rid, {
        smartStatus,
        assignmentOverlaps: ctx.overlapsCount,
        pendingOverlaps: dupCount
      });
    }

    updateReqKpi(rows, smartById);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No requests.";
      list.appendChild(empty);
      return;
    }

    function smartBadgeHtml(status) {
      if (status === "CONFLICT") return `<span class="badge bad">CONFLICT</span>`;
      if (status === "DUPLICATE") return `<span class="badge warn">DUPLICATE</span>`;
      return `<span class="badge ok">OK</span>`;
    }

    function reqTypeShort(typeRaw) {
      const t = String(typeRaw || "");
      if (t === "CREATE_ASSIGNMENT") return "CREATE";
      if (t === "UPDATE_ASSIGNMENT") return "UPDATE";
      if (t === "CANCEL_ASSIGNMENT") return "CANCEL";
      return t.replaceAll("_"," ");
    }

    for (const r of rows) {
      const status = String(r.status || "");
      const isPending = status === "PENDING";

      const rid = String(r.id);
      const smart = smartById.get(rid) || { smartStatus: "OK", assignmentOverlaps: 0, pendingOverlaps: 0 };

      const emp = String(r.requested_for_employee_id ?? "");
      const empLabel = employeeLabelById(emp);
      const proj = String(r.project_id ?? "");
      const projLabel = projectLabelById(proj);

      const from = shortDate(r.start_date);
      const to = shortDate(r.end_date);

      const typeShort = reqTypeShort(r.request_type);

      const rangeLabel = (!from && !to) ? "—" : (from === to || !to) ? `${from}` : `${from} → ${to}`;

      const shift = (r.payload_json && r.payload_json.shift) ? String(r.payload_json.shift) : "";
      const note = (r.payload_json && r.payload_json.note) ? String(r.payload_json.note) : "";

      const startsSoon = (() => {
        const s = dateToMs(r.start_date);
        if (s == null) return false;
        const diff = s - Date.now();
        return diff <= 48*60*60*1000 && diff >= 0;
      })();

      const urgency = (isPending && startsSoon) ? `<span class="badge warn">STARTS &lt; 48H</span>` : "";

      const allowApply = (smart.smartStatus !== "CONFLICT") || (dateToMs(r.start_date) != null && dateToMs(r.end_date) != null);
      // If dates are missing, keep Apply disabled (even though badge is CONFLICT).
      const missingDates = (dateToMs(r.start_date) == null || dateToMs(r.end_date) == null);
      const applyDisabledAttr = (missingDates) ? "disabled" : "";

      const actions = isPending
        ? (() => {
            const applyBtn = `<button class="btn small ${smart.smartStatus === "CONFLICT" ? "" : "primary"}" ${applyDisabledAttr} data-act="approve" data-id="${escapeHtml(rid)}">Apply</button>`;
            const discardBtn = `<button class="btn small danger ${smart.smartStatus === "CONFLICT" ? "primary" : ""}" data-act="reject" data-id="${escapeHtml(rid)}">Discard</button>`;
            return `<div class="req-actions">${smart.smartStatus === "CONFLICT" ? discardBtn + applyBtn : applyBtn + discardBtn}</div>`;
          })()
        : `<div class="kv">#${escapeHtml(rid)}</div>`;

      const detailsHtml = isPending ? `
        <div class="req-details" id="reqDetails_${escapeHtml(rid)}">
          <div class="req-lines" style="margin-top:10px;">
            <div><span class="kv">Assignments overlap:</span> ${escapeHtml(String(smart.assignmentOverlaps))}</div>
            <div><span class="kv">Other pending requests:</span> ${escapeHtml(String(smart.pendingOverlaps))}</div>
            <div><span class="kv">Note:</span> ${escapeHtml(note || "—")}</div>
            <div class="kv" style="margin-top:6px;">#${escapeHtml(rid)} • ${escapeHtml(typeShort)}${shift ? " • Shift: " + escapeHtml(shift) : ""}</div>
          </div>
        </div>
      ` : "";

      const decidedExtra = (!isPending)
        ? `<div class="req-lines" style="margin-top:8px;">
             <div><span class="kv">Decision at:</span> ${escapeHtml(shortDate(r.decision_at) || "")}</div>
             <div><span class="kv">Decision note:</span> ${escapeHtml(r.decision_note || "—")}</div>
           </div>`
        : "";

      const card = document.createElement("div");
      card.className = "req-item " + (isPending ? "pending" : "decided");

      // Single-line summary (fast decision)
      card.innerHTML = `
        <div class="req-head">
          <div style="min-width:300px;flex:1;">
            <div class="req-badges">
              ${smartBadgeHtml(smart.smartStatus)}
              ${urgency}
              <span class="kv">${escapeHtml(empLabel)} • ${escapeHtml(projLabel)} • ${escapeHtml(rangeLabel)} • ${escapeHtml(typeShort)}</span>
            </div>
            ${isPending ? `<div class="req-meta"><button class="linklike" data-toggle="details" data-id="${escapeHtml(rid)}">Details ▾</button></div>` : ""}
            ${decidedExtra}
            ${detailsHtml}
          </div>
          ${actions}
        </div>
      `;

      list.appendChild(card);

      if (isPending) {
        // Toggle details
        const toggle = card.querySelector('button[data-toggle="details"]');
        if (toggle) {
          toggle.addEventListener("click", () => {
            const box = card.querySelector("#reqDetails_" + rid);
            if (!box) return;
            const open = box.classList.toggle("open");
            toggle.textContent = open ? "Details ▴" : "Details ▾";
          });
        }

        // Actions
        card.querySelectorAll("button[data-act]").forEach(btn => {
          btn.addEventListener("click", () => {
            if (btn.disabled) return;
            const act = btn.getAttribute("data-act");
            openDecisionModal({
              requestId: r.id,
              decision: act === "approve" ? "APPROVE" : "REJECT",
              meta: `#${r.id} • ${r.request_type} • ${rangeLabel} • ${employeeLabelById(emp)} • ${projectLabelById(proj)}`
            });
          });
        });
      }
    }
  }

  async function refreshUnifiedRequests() {
    $("btnReqRefresh").disabled = true;
    try {
      await loadReqMine();
      try {
        await loadReqAll();
        if ($("reqScope")) $("reqScope").disabled = false;
      } catch {
        if ($("reqScope")) { $("reqScope").value = "mine"; $("reqScope").disabled = true; }
        reqState.scope = "mine";
      }

      await ensureAssignmentsForRequests();

      renderReqList();
    } catch (e) {
      setErr($("reqErr"), "❌ " + e.message);
    } finally {
      $("btnReqRefresh").disabled = false;
    }
  }

  // wire tabs
  $("tabCreate").addEventListener("click", () => activate("create"));
  $("tabList").addEventListener("click", async () => { activate("list"); await refreshAssignments(); });
  $("tabRequests").addEventListener("click", async () => { activate("requests"); await refreshUnifiedRequests(); });
  if ($("reqTabPending")) $("reqTabPending").addEventListener("click", () => setReqTab("PENDING"));
  if ($("reqTabApproved")) $("reqTabApproved").addEventListener("click", () => setReqTab("APPROVED"));
  if ($("reqTabRejected")) $("reqTabRejected").addEventListener("click", () => setReqTab("REJECTED"));
  if ($("reqTabAll")) $("reqTabAll").addEventListener("click", () => setReqTab("ALL"));
  on("reqSearch", "input", renderReqList);
  if ($("reqScope")) $("reqScope").addEventListener("change", () => { reqState.scope = $("reqScope").value; renderReqList(); });


  // create submit
  $("btnSubmitRequest").addEventListener("click", async () => {
    clearMsg($("createOk"));
    clearMsg($("createErr"));

    const employeeId = Number($("selEmployee").value);
    const projectId = Number($("selProject").value);
    const start = $("inpFrom").value || null;
    const end = $("inpTo").value || null;
    if (start && end && String(end) < String(start)) { setErr($("createErr"), "End date must be the same or after start date."); return; }
    const shift = ($("selShift").value === "CUSTOM") ? ($("inpShiftCustom").value || "").trim() : $("selShift").value;
    const note = ($("inpNote").value || "").trim();

    if (!employeeId || !projectId) { setErr($("createErr"), "Select employee and project."); return; }
    if (!start || !end) { setErr($("createErr"), "Select dates."); return; }
    if ($("selShift").value === "CUSTOM" && !shift) { setErr($("createErr"), "Enter custom shift like 07:00-15:30."); return; }

    const body = {
      request_type: "CREATE_ASSIGNMENT",
      requested_for_employee_id: employeeId,
      project_id: projectId,
      start_date: start,
      end_date: end,
      payload_json: { shift, note }
    };

    try {
      const data = await api("/api/assignment-requests", { method: "POST", body: JSON.stringify(body) });
      const r = data.request || data;
      setOk($("createOk"), `✅ Request submitted (#${r.id})`);
      await refreshRequests();
      activate("requests");
    } catch (e) {
      setErr($("createErr"), "❌ " + e.message);
      console.error(e);
    }
  });

  // list controls
  on("btnListRefresh", "click", refreshAssignments);
  on("listSearch", "input", renderAssignments);
  on("listSort", "change", renderAssignments);
  on("listRange", "change", renderAssignments);

  // requests controls
  on("btnReqRefresh", "click", refreshUnifiedRequests);
  on("inboxSearch", "input", renderInbox);
  on("mineSearch", "input", renderMyRequests);

  $("btnRefreshAll").addEventListener("click", async () => {
    await refreshRequests();
    await refreshAssignments();
  });

  // decision modal buttons
  on("btnModalCancel", "click", closeDecisionModal);
  $("btnModalConfirm").addEventListener("click", async () => {
    const pending = state.pendingDecision;
    if (!pending) return;

    const note = ($("modalNote").value || "").trim();

    // Reject requires a reason
    if (pending.decision === "reject" && !note) {
      const noteWrap = $("modalNoteWrap");
      if (noteWrap) noteWrap.style.display = "block";
      const noteLabel = $("modalNoteLabel");
      if (noteLabel) noteLabel.textContent = "Reason (required)";
      $("modalNote").focus();
      return;
    }

    closeDecisionModal();
    await decide(pending.requestId, pending.decision, note);
  });
  $("modalBackdrop").addEventListener("click", (e) => {
    if (e.target === $("modalBackdrop")) closeDecisionModal();
  });

  // edit modal buttons
  on("btnEditCancel", "click", closeEditModal);
  on("btnEditSubmit", "click", submitModifyRequest);
  $("editBackdrop").addEventListener("click", (e) => {
    if (e.target === $("editBackdrop")) closeEditModal();
  });

  // init
  (async () => {
    await loadEmployeesProjects();

    // fill employee select
    fillSelect($("selEmployee"), state.employees, (e) => {
      const code = e.employee_code ? (e.employee_code + " - ") : "";
      const sot = e.sot || null;
      const sotFirst = sot?.first_name ?? null;
      const sotLast = sot?.last_name ?? null;
      const sotName = [sotFirst, sotLast].filter(Boolean).join(" ").trim();
      const name = (sotName || e.full_name || [e.first_name, e.last_name].filter(Boolean).join(" ") || ("Employee " + e.id));
      return (code + name).trim();
    });

    // fill project select
    fillSelect($("selProject"), state.projects, (p) => {
      const code = p.project_code ? (p.project_code + " - ") : (p.code ? (p.code + " - ") : "");
      const name = p.name || p.project_name || ("Project " + p.id);
      return (code ? code : (p.id + " - ")) + name;
    });

    initShiftSelect($("selShift"), $("shiftCustomWrap"), $("inpShiftCustom"));
    setDefaultDatesTomorrow();

    initShiftSelect($("editShift"), $("editShiftCustomWrap"), $("editShiftCustom"));

    await refreshRequests();
    await refreshAssignments();
  })().catch((e) => {
    console.error(e);
  });
})();

// Phase 4.1: reload lists when login/logout happens
onAuthChanged(() => { try { loadEmployeesProjects && loadEmployeesProjects(); } catch (e) {} });

  })();
}


function backendProfileIsComplete(me){
  if(!me) return false;
  const p = me.profile || me.row || me.data || me;
  const trade = String(p.trade_code || p.trade || "").trim();
  const rank = String(p.rank_code || p.rank || "").trim();
  const phone = String(p.phone || "").trim();
  const street = String(p.home_address || p.street || p.address || "").trim();
  const city = String(p.city || "").trim();
  const postal = String(p.postal_code || p.postal || "").trim();
  const emgName = String(p.emergency_contact_name || p.emg_name || "").trim();
  const emgPhone = String(p.emergency_contact_phone || p.emg_phone || "").trim();
  return !!(trade && rank && phone && street && city && postal && emgName && emgPhone);
}
// ---------------------------------



function _pick(obj, keys){
  if(!obj) return "";
  for(const k of keys){
    const v = obj[k];
    if(v === undefined || v === null) continue;
    const s = String(v).trim();
    if(s) return s;
  }
  return "";
}
function isProfileCompleteFromMe(me){
  if(!me) return false;
  const p = me.profile || me.data || me;
  // Required fields (accept multiple key variants)
  const req = [
    ["trade","trade_code","trade_name"],
    ["rank","rank_code","rank_name"],
    ["phone","phone_number","mobile","mobile_phone"],
    ["home_address","home_address_street","home_street","street","address_street"],
    ["home_address_city","home_city","city"],
    ["home_address_postal_code","home_postal_code","postal_code","zip"],
    ["emergency_contact_name","emergency_name","emergency_full_name"],
    ["emergency_contact_relationship","emergency_relationship","relationship"],
    ["emergency_contact_phone","emergency_phone","emergency_mobile"]
  ];
  for(const keys of req){
    if(!_pick(p, keys)) return false;
  }
  return true;
}

function getMissingFieldsFromMe(me){
  const p = me?.profile || me?.data || me || {};
  const req = [
    { label:"Trade", keys:["trade","trade_code","trade_name"] },
    { label:"Rank", keys:["rank","rank_code","rank_name"] },
    { label:"Phone", keys:["phone","phone_number","mobile","mobile_phone"] },
    { label:"Home Address (Street)", keys:["home_address","home_address_street","home_street","street","address_street"] },
    { label:"City", keys:["home_address_city","home_city","city"] },
    { label:"Postal Code", keys:["home_address_postal_code","home_postal_code","postal_code","zip"] },
    { label:"Emergency Contact Name", keys:["emergency_contact_name","emergency_name","emergency_full_name"] },
    { label:"Emergency Contact Relationship", keys:["emergency_contact_relationship","emergency_relationship","relationship"] },
    { label:"Emergency Contact Phone", keys:["emergency_contact_phone","emergency_phone","emergency_mobile"] },
  ];
  const missing = [];
  for(const r of req){
    if(!_pick(p, r.keys)) missing.push(r.label);
  }
  return missing;
}

function renderProfileCompleteness(me){
  const hint = qs("#pfHint");
  const box = qs("#pfChecklist");
  const list = qs("#pfMissingList");
  const missing = getMissingFieldsFromMe(me);

  const isComplete = missing.length === 0;

  if(hint){
    hint.style.display = "";
    hint.textContent = isComplete ? "Profile: COMPLETE ✅" : `Profile: INCOMPLETE (${missing.length})`;
  }

  if(box && list){
    list.innerHTML = "";
    if(isComplete){
      box.style.display = "none";
    }else{
      box.style.display = "";
      for(const item of missing){
        const li = document.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
    }
  }
  return { isComplete, missing };
}

async function ensureProfileMeLoadedAndRendered(){
  // Avoid overwriting user input while editing
  if(window.__pfIsEditing) return;

  const me = await fetchJson(Endpoints.profileMe);
  if(!me) return;

  // Populate form fields if profile exists
  const p = me.profile || me.data || null;
  if(p){
    try{
      setVal("#pfTrade", _pick(p, ["trade_code","trade","trade_name"]) || "");
      setVal("#pfRank", _pick(p, ["rank_code","rank","rank_name"]) || "");
      setVal("#pfPhone", _pick(p, ["phone","phone_number","mobile","mobile_phone"]) || "");
      setVal("#pfStreet", _pick(p, ["home_address","street","home_address_street","home_street","address_street"]) || "");
      setVal("#pfCity", _pick(p, ["city","home_address_city","home_city"]) || "");
      setVal("#pfPostal", _pick(p, ["postal_code","home_address_postal_code","home_postal_code","zip"]) || "");
      setVal("#pfUnit", _pick(p, ["home_unit","unit"]) || "");
      setVal("#pfEmgName", _pick(p, ["emergency_contact_name","emergency_name","emergency_full_name"]) || "");
      setVal("#pfEmgPhone", _pick(p, ["emergency_contact_phone","emergency_phone","emergency_mobile"]) || "");
      setVal("#pfEmgRelation", _pick(p, ["emergency_contact_relationship","emergency_relationship","relationship"]) || "");
    }catch(e){}
  }

  // Render completeness UI
  renderProfileCompleteness(me);

  // If profile is complete, ensure gate is off
  const complete = isProfileCompleteFromMe(me);
  if(complete){
    setProfileCompletedLocal(true);
    if(PROFILE_GATED){
      applyProfileGate(false);
      PROFILE_GATED = false;
    }
  }
}

function setVal(sel, v){
  const el = qs(sel);
  if(el == null) return;
  el.value = (v ?? "");
}
// ---------------- Assignments List UI polish (SORT ONLY) ----------------
function safeText(v){
  return (v ?? "").toString().trim();
}

function parseDateToTs(v){
  if(!v) return Number.POSITIVE_INFINITY;

  const ts = Date.parse(v);
  if(!Number.isNaN(ts)) return ts;

  const m = safeText(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){
    const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    return new Date(y, mo, d).getTime();
  }
  return Number.POSITIVE_INFINITY;
}

function compareAssignments(a, b){
  const projA = safeText(a.project_name || a.project || a.project_code);
  const projB = safeText(b.project_name || b.project || b.project_code);
  const projCmp = projA.localeCompare(projB, undefined, { sensitivity:"base" });
  if(projCmp !== 0) return projCmp;

  const fromA = parseDateToTs(a.from || a.from_date || a.start_date);
  const fromB = parseDateToTs(b.from || b.from_date || b.start_date);
  if(fromA !== fromB) return fromA - fromB;

  const empA = safeText(a.employee_name || a.employee || a.full_name || a.employee_code);
  const empB = safeText(b.employee_name || b.employee || b.full_name || b.employee_code);
  return empA.localeCompare(empB, undefined, { sensitivity:"base" });
}

// Wrap external renderer (if defined elsewhere) to sort rows before rendering.
// No backend impact. Safe no-op if function doesn't exist.
function patchAssignmentsListSorting(){
  try{
    const fn = window.renderAssignmentsList;
    if(typeof fn !== "function") return;
    if(fn._sortedWrapped) return;

    window.renderAssignmentsList = function(rows, ...rest){
      try{
        if(Array.isArray(rows)) rows = [...rows].sort(compareAssignments);
      }catch(e){}
      return fn.call(this, rows, ...rest);
    };
    window.renderAssignmentsList._sortedWrapped = true;
  }catch(e){}
}

// ---------------- Tabs ----------------
function setView(viewName){
  // Assignments are hosted inside this page (no iframe). Map both tabs to one view.
  const isAssignments = (viewName === "assignments" || viewName === "assignments_list" || viewName === "assignments_create");
  const effectiveView = isAssignments ? "assignments" : viewName;




  // D1: Role-based view gating (UI-only)
  if(CURRENT_USER && !isViewAllowedForRole(effectiveView, CURRENT_USER.role)){
    toast("Not authorized");
    if(viewName !== "profile") return setView("profile");
  }


  qsa(".tab").forEach(b=>b.classList.toggle("active", b.dataset.view===viewName));
  qsa(".view").forEach(v=>v.classList.add("hidden"));
  const el=qs(`#view-${effectiveView}`);
  if(el) el.classList.remove("hidden");

  if(isAssignments){
    // Assignments V2 is embedded directly in app.html (no iframe).
    try{
      document.body.classList.toggle("assignments-wide", true);
      initAssignmentsV2Once();
    }catch(e){}
  }else{
    document.body.classList.toggle("assignments-wide", false);
  }

  if(viewName==="materials"){
    renderWorkerDraft();
    applyMaterialsLockUI();
    ensureForemanOption1UI();
    foremanInitAndLoad().catch(()=>{});
  }
  if(viewName==="parking") ensureParkingDefaults();
  if(viewName==="profile"){
    ensureProfileMeLoadedAndRendered().catch(()=>{});
  }
}
window.setView = setView; // used by html scripts
 // used by html scripts


function applyProfileGate(isGated){
  PROFILE_GATED = !!isGated;
  qsa(".tab").forEach(btn=>{
    const view = btn.dataset.view;
    if(view === "profile") return;
    if(PROFILE_GATED){
      btn.classList.add("tab-disabled");
      btn.setAttribute("aria-disabled","true");
    }else{
      btn.classList.remove("tab-disabled");
      btn.removeAttribute("aria-disabled");
    }
  });
}

function wireTabs(){
  const tabs=qs("#tabs");
  if(!tabs) return;
  tabs.addEventListener("click",(e)=>{
    const btn=e.target.closest(".tab");
    if(!btn) return;

    const view = btn.dataset.view;

    // Step 2: Profile completion gate (UI-only)
    if(PROFILE_GATED && view !== "profile"){
      toast("Complete your profile to continue");
      setView("profile");
      return;
    }


// D1: Block unauthorized tabs even if visible (defense-in-depth)
if(CURRENT_USER && !isViewAllowedForRole(view, CURRENT_USER.role)){
  toast("Not authorized");
  setView("profile");
  return;
}

    if(btn.disabled || btn.classList.contains("tab-disabled")) return;

    setView(view);
  });
}
// ---------------- Login UI ----------------
function ensureLoginUI(){
  const pill=qs("#whoami");
  if(!pill) return;
  if(qs("#btnLogin")) return;

  const wrap=document.createElement("span");
  wrap.style.display="inline-flex";
  wrap.style.gap="8px";
  wrap.style.alignItems="center";
  wrap.style.marginLeft="10px";
  wrap.innerHTML=`
    <input id="loginUser" class="input" placeholder="username" style="width:110px;" />
    <input id="loginPin" class="input" placeholder="pin" style="width:85px;" />
    <button type="button" id="btnLogin" class="btn">Login</button>
    <button type="button" id="btnLogout" class="btn" style="display:none;">Logout</button>
  `;
  pill.insertAdjacentElement("afterend", wrap);
  qs("#loginPin").type="password";

  qs("#btnLogin").addEventListener("click", async ()=>{
    try{
      const u=qs("#loginUser").value.trim();
      const p=qs("#loginPin").value.trim();
      if(!u||!p) return toast("Enter username & pin");
      const r=await fetchJson(Endpoints.login,{method:"POST", body: JSON.stringify({username:u,pin:p})});
      setToken(r.token);
      toast("Logged in");
      await refreshAuth();
      await enforceOnboardingGate();
      await loadProjects();
      toast("Ready âœ…");
    }catch(e){ toast(e.message); }
  });

  qs("#btnLogout").addEventListener("click", async ()=>{
    clearToken();
    toast("Logged out");
    CURRENT_USER=null;
    IS_FOREMAN_CAP=false;
    FOREMAN_PROJECTS=[];
    WORKSPACE_CACHE=null;
    hideOnboardingOverlay();
    await refreshAuth();
  });
}

async function refreshAuth(){
  ensureLoginUI();
  const token=getToken();
  if(!token){
    CURRENT_USER=null;
    qs("#whoami").textContent="Not signed";

    // Not signed: hide privileged tabs
    const adminTab = qs('.tab[data-view="admin"]');
    if (adminTab) adminTab.style.display = "none";
    const reportsTab = qs('.tab[data-view="reports"]');
    if (reportsTab) reportsTab.style.display = "none";
    const assignmentsTab = qs('.tab[data-view="assignments"]');
    if (assignmentsTab) assignmentsTab.style.display = "none";
    qs("#btnLogin").style.display="inline-block";
    qs("#btnLogout").style.display="none";
    return;
  }
  try{
    const r=await fetchJson(Endpoints.whoami);
    CURRENT_USER=r.user;
    registerServiceWorkerForAttendance().catch(()=>{});
    ensureNotificationPermission().catch(()=>{});
    qs("#whoami").textContent=`${CURRENT_USER.username} (${CURRENT_USER.role})`;
    qs("#btnLogin").style.display="none";
    qs("#btnLogout").style.display="inline-block";

    const adminTab = qs('.tab[data-view="admin"]');
    if (adminTab) adminTab.style.display = (String(CURRENT_USER.role || "").toUpperCase() === "ADMIN") ? "" : "none";
    // Role-based tab visibility
    const role = String(CURRENT_USER.role || "").toUpperCase();
    ensureAssignmentsIframeForRole(role);
    const reportsTab = qs('.tab[data-view="reports"]');
    if (reportsTab) reportsTab.style.display = (role === "ADMIN" || role === "FOREMAN") ? "" : "none";

    const assignmentsTab = qs('.tab[data-view="assignments"]');
    if (assignmentsTab) assignmentsTab.style.display = (role === "ADMIN" || role === "FOREMAN") ? "" : "none";

    // Optional: hide materials admin controls later; base tabs remain visible for workers.

    applyRoleTabVisibility();

  }catch{
    clearToken();
    CURRENT_USER=null;
    qs("#whoami").textContent="Not signed";
    qs("#btnLogin").style.display="inline-block";
    qs("#btnLogout").style.display="none";
  }
}

// ---------------- Onboarding Gate (FULL ADDRESS) ----------------
function hideOnboardingOverlay(){
  const el = document.getElementById("onboardingOverlay");
  if(el) el.remove();
}

function showOnboardingOverlay(html){
  hideOnboardingOverlay();
  const overlay = document.createElement("div");
  overlay.id="onboardingOverlay";
  overlay.style.position="fixed";
  overlay.style.inset="0";
  overlay.style.background="rgba(0,0,0,.55)";
  overlay.style.display="flex";
  overlay.style.alignItems="center";
  overlay.style.justifyContent="center";
  overlay.style.zIndex="99999";
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}

async function enforceOnboardingGate(){
  if(!getToken()){
    applyProfileGate(false);
    PROFILE_GATED = false;
    return;
  }

  // Step 4: Prefer DB truth from whoami (profile_status)
  const ps = String(CURRENT_USER?.profile_status || "").toUpperCase();
  if(ps === "COMPLETED"){
    setProfileCompletedLocal(true);
    applyProfileGate(false);
    PROFILE_GATED = false;
    return;
  }
  if(ps === "NEW" || ps === "INCOMPLETE"){
    setProfileCompletedLocal(false);
    applyProfileGate(true);
    setView("profile");
    const hint = qs("#pfHint");
    mustCompleteNow = true;
    if(hint){
      hint.style.display = "";
      hint.textContent = "Complete required fields to unlock tabs";
    }
    try{ wireProfileUI(); }catch(e){}
    return;
  }


  // Try to detect existing profile from backend (if available) and auto-unlock.
  try{
    const me = await fetchJson(Endpoints.profileMe);
    // Unlock ONLY if profile is truly complete (not just "exists")
    if(me?.exists && isProfileCompleteFromMe(me)){
      setProfileCompletedLocal(true);
      applyProfileGate(false);
      PROFILE_GATED = false;
      return;
    }
    // If profile exists but is incomplete, keep gate ON and clear any stale local "done" flag
    if(me?.exists && !isProfileCompleteFromMe(me)){
      setProfileCompletedLocal(false);
    }
  }catch(e){
    // If profile API fails, we still keep UI gate until user fills required fields in Profile tab (UI-only).
    console.warn("profileMe check failed (UI gate stays):", e?.message || e);
  }

  // Gate enabled: force user to Profile tab until minimum fields are filled (UI-only in this step).
  applyProfileGate(true);
  setView("profile");
  const hint = qs("#pfHint");

  mustCompleteNow = true;
  if(hint){
    hint.style.display = "";
    hint.textContent = "Complete required fields to unlock tabs";
  }
  // Refresh Profile UI state now that mustCompleteNow may have changed
  try{ wireProfileUI(); }catch(e){}
}

// ---------------- Projects cache (for UI labels) ----------------
async function loadProjects(){
  window.PROJECTS_CACHE = [];
  const token=getToken();
  if(!token) return;

  try{
    const r=await fetchJson(Endpoints.projects);
    const arr = Array.isArray(r) ? r : (r.projects || r.rows || []);
    window.PROJECTS_CACHE = arr.map(p=>({
      id: Number(p.id ?? p.project_id),
      project_code: p.project_code ?? p.code ?? "",
      project_name: p.project_name ?? p.name ?? ""
    })).filter(p=>Number.isFinite(p.id));
  }catch(e){}
}

// ---------------- Materials (Worker Draft minimal) ----------------
function suffix(){
  return CURRENT_USER?.user_id
    ? `${todayISODate()}_${CURRENT_USER.user_id}`
    : `${todayISODate()}_anon`;
}
function workerKey(){ return LS_MAT_DRAFT_PREFIX+suffix(); }
function workerSubmittedKey(){ return LS_MAT_SUBMITTED_PREFIX+suffix(); }

function loadJson(key, fallback){
  try{ const raw=localStorage.getItem(key); return raw?JSON.parse(raw):fallback; }catch{ return fallback; }
}
function saveJson(key,val){ localStorage.setItem(key, JSON.stringify(val)); }

function workerDraft(){ return CURRENT_USER?.user_id ? loadJson(workerKey(),[]) : []; }
function setWorkerDraft(a){ if(CURRENT_USER?.user_id) saveJson(workerKey(),a); }

function isWorkerSubmitted(){
  if(!CURRENT_USER?.user_id) return false;
  return localStorage.getItem(workerSubmittedKey())==="1";
}

function lineKey(item_text, unit, note){
  const t = String(item_text||"").trim().toLowerCase();
  const u = String(unit||"").trim().toLowerCase();
  const n = String(note||"").trim().toLowerCase();
  return `${t}|${u}|${n}`;
}

function addWorkerLine(){
  if(!CURRENT_USER?.user_id) return showAlert("Login required","Please login first.");

  const item=(qs("#matItemText")?.value||"").trim();
  const qty=Number((qs("#matQty")?.value||"1").trim());
  const unit=(qs("#matUnit")?.value||"pcs").trim();
  const note=(qs("#matNote")?.value||"").trim();

  if(!item) return toast("Enter item");
  if(!Number.isFinite(qty)||qty<=0) return toast("Enter valid qty");

  const draft=workerDraft();
  const k=lineKey(item,unit,note);
  const idx=draft.findIndex(x=>x.key===k);
  if(idx>=0) draft[idx].qty += qty;
  else draft.push({key:k,item_text:item,qty,unit,note:note||null});
  setWorkerDraft(draft);

  qs("#matItemText").value="";
  qs("#matQty").value="1";
  qs("#matNote").value="";
  renderWorkerDraft();
}

async function submitWorkerDraft(){
  if(!CURRENT_USER?.user_id) return showAlert("Login required","Please login first.");
  const draft=workerDraft();
  if(!draft.length) return;

  if(isAfterCutoff()) return showAlert("Closed","Past cutoff.");

  try{
    const payload={items:draft.map(x=>({item_text:x.item_text,qty:x.qty,unit:x.unit,note:x.note}))};
    const r=await fetchJson(Endpoints.materialsSubmit,{method:"POST", body: JSON.stringify(payload)});
    localStorage.setItem(workerSubmittedKey(),"1");
    toast(`Submitted âœ… (Req #${r.request_id})`);
    renderWorkerDraft();
  }catch(e){
    showAlert("Submit failed", e.message);
  }
}

function renderWorkerDraft(){
  const list=qs("#matDraftList");
  const btn=qs("#matSubmitDraft");
  if(!list) return;

  const draft=workerDraft();
  list.innerHTML="";

  if(!CURRENT_USER?.user_id){
    list.innerHTML=`<div class="muted">Login required.</div>`;
    if(btn) btn.disabled=true;
    return;
  }
  if(!draft.length){
    list.innerHTML=`<div class="muted">No draft items yet.</div>`;
    if(btn) btn.disabled=true;
    return;
  }

  draft.forEach(x=>{
    const row=document.createElement("div");
    row.className="item";
    row.style.display="flex";
    row.style.justifyContent="space-between";
    row.style.gap="10px";
    row.innerHTML=`
      <div>
        <div class="k">${x.item_text}</div>
        <div class="muted">${x.qty} ${x.unit}${x.note?" â€” "+x.note:""}</div>
      </div>
      <button class="btn" data-wdel="${x.key}">Remove</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll("button[data-wdel]").forEach(b=>{
    b.addEventListener("click",()=>{
      if(isWorkerSubmitted()||isAfterCutoff()) return;
      setWorkerDraft(workerDraft().filter(x=>x.key!==b.getAttribute("data-wdel")));
      renderWorkerDraft();
    });
  });

  if(btn) btn.disabled = isWorkerSubmitted() || isAfterCutoff();
}

function applyMaterialsLockUI(){
  const btn=qs("#matSubmitDraft");
  if(!btn) return;
  btn.disabled = !CURRENT_USER?.user_id || isWorkerSubmitted() || isAfterCutoff();
}

function wireMaterials(){
  document.addEventListener("click",(e)=>{
    const t=e.target;
    if(!t) return;
    if(t.id==="matSubmit") addWorkerLine();
    if(t.id==="matSubmitDraft") submitWorkerDraft();
  });
}

// ---------------- Foreman Option-1 (kept minimal) ----------------
// TEMP: Foreman endpoint not implemented yet -> avoid 404 spam
async function foremanDetectCap(){
  IS_FOREMAN_CAP = false;
  FOREMAN_PROJECTS = [];
  return;
}

function ensureForemanOption1UI(){
  // Keep your existing Option-1 UI injection if you already have it elsewhere.
  // In this simplified app.js, we do not rebuild the full foreman UI here.
}

function foremanInitAndLoad(){
  return Promise.resolve();
}

function ensureParkingDefaults(){
  const dateEl=qs("#parkingDate");
  if(dateEl && !dateEl.value) dateEl.value=todayISODate();
}


// ---------------- Admin: Create Employee ----------------
function wireAdminEmployees(){
  const btn = qs("#btnAdminCreateEmployee");
  if(!btn) return; // UI not present

  const elCode = qs("#adminEmpCode");
  const elFirst = qs("#adminEmpFirst");
  const elLast = qs("#adminEmpLast");
  const elEmail = qs("#adminEmpEmail");
  const elActive = qs("#adminEmpActive");
  const elRole = qs("#adminEmpRole");
  const wrap = qs("#adminEmpResultWrap");
  const out = qs("#adminEmpResult");
  const err = qs("#adminEmpError");

  const inviteWrap = qs("#adminInviteResultWrap");
  const inviteOut = qs("#adminActivationLinkOut");
  const inviteMeta = qs("#adminInviteMeta");
  const inviteErr = qs("#adminInviteError");
  const btnCopyInvite = qs("#btnCopyAdminActivationLink");

  if(btnCopyInvite){
    btnCopyInvite.addEventListener("click", async ()=>{
      try{
        await navigator.clipboard.writeText(inviteOut?.value || "");
        btnCopyInvite.textContent = "Copied";
        setTimeout(()=>btnCopyInvite.textContent="Copy", 900);
      }catch(e){
        if(inviteErr){
          inviteErr.style.display = "";
          inviteErr.textContent = "Copy failed. Select the link and copy manually.";
        }
      }
    });
  }


  function showError(msg){
    if(err){
      err.style.display = "";
      err.textContent = msg || "FAILED";
    }
    if(inviteErr){
      inviteErr.style.display = "";
      inviteErr.textContent = msg || "FAILED";
    }
  }
  function clearError(){
    if(err){
      err.style.display = "none";
      err.textContent = "";
    }
    if(inviteErr){
      inviteErr.style.display = "none";
      inviteErr.textContent = "";
    }
  }
  function showResult(emp){
    if(wrap) wrap.style.display = "";
    if(out){
      const id = emp?.id ?? "";
      const code = emp?.employee_code ?? "";
      const name = `${emp?.first_name ?? ""} ${emp?.last_name ?? ""}`.trim();
      const email = emp?.email ?? "";
      out.textContent = `employee_id: ${id}  |  code: ${code}  |  name: ${name}  |  email: ${email}`;
    }

    // Convenience: prefill invite employee id if admin invite UI exists
    const inviteEmp = qs("#inviteEmployeeId");
    if(inviteEmp && emp?.id){
      inviteEmp.value = String(emp.id);
    }
  }

  btn.addEventListener("click", async ()=>{
    clearError();
    if(!getToken()){
      showError("You must be logged in as ADMIN.");
      return;
    }

    const employee_code = String(elCode?.value || "").trim();
    const first_name = String(elFirst?.value || "").trim();
    const last_name = String(elLast?.value || "").trim();
    const email = String(elEmail?.value || "").trim();
    const is_active = String(elActive?.value || "true") === "true";
    const role = String(elRole?.value || "WORKER").trim();

    if(!employee_code) return showError("Employee Code is required.");
    if(!first_name) return showError("First Name is required.");
    if(!last_name) return showError("Last Name is required.");
    if(!email) return showError("Email is required.");

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Creating + Sending...";
    try{
      const data = await fetchJson("/api/employees", {
        method:"POST",
        body: JSON.stringify({ employee_code, first_name, last_name, email, is_active })
      });
      if(!data?.ok) throw new Error(data?.error || "CREATE_EMPLOYEE_FAILED");
      showResult(data.employee);

      const empId = data?.employee?.id;
      const fullName = `${first_name} ${last_name}`.trim();
      const invite = await fetchJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email, role, employee_id: empId, full_name: fullName, note: "created_via_admin_add_employee" })
      });
      if(!invite?.ok) throw new Error(invite?.error || "CREATE_USER_INVITE_FAILED");

      if(inviteWrap) inviteWrap.style.display = "";
      if(inviteOut) inviteOut.value = invite.activation_link || "";
      if(inviteMeta) inviteMeta.textContent = `user_id=${invite.user?.id ?? ""} | username=${invite.user?.username ?? ""} | role=${invite.user?.role ?? ""} | expires_at=${invite.invite?.expires_at ?? ""}`;

      toast("Employee + Invite sent ✅");
    }catch(e){
      const msg = String(e?.data?.error || e?.message || e || "CREATE_EMPLOYEE_FAILED");
      showError(msg);
      toast("Create employee failed");
      console.warn("create employee failed", e);
    }finally{
      btn.disabled = false;
      btn.textContent = oldText;
    }
  });
}


// ---------------- Admin: Employee Invites ----------------
function wireAdminInvites(){
  const btnGen = qs("#btnGenerateInvite");
  if(!btnGen) return; // UI not present

  const elEmp = qs("#inviteEmployeeId");
  const elNote = qs("#inviteNote");
  const wrap = qs("#inviteResultWrap");
  const out = qs("#inviteCodeOut");
  const meta = qs("#inviteMeta");
  const err = qs("#inviteError");
  const btnCopy = qs("#btnCopyInvite");
  const recent = qs("#inviteRecent");

  function showError(msg){
    if(err){
      err.style.display = "";
      err.textContent = msg || "FAILED";
    }
    if(inviteErr){
      inviteErr.style.display = "";
      inviteErr.textContent = msg || "FAILED";
    }
  }
  function clearError(){
    if(err){
      err.style.display = "none";
      err.textContent = "";
    }
    if(inviteErr){
      inviteErr.style.display = "none";
      inviteErr.textContent = "";
    }
  }
  function showResult(invite){
    if(!wrap) return;
    wrap.style.display = "";
    out.value = invite.invite_code || "";
    const exp = invite.expires_at ? new Date(invite.expires_at).toLocaleString() : "";
    meta.textContent = `Status: ${invite.status || ""}  |  Expires: ${exp}`;
  }

  async function refreshRecent(){
    if(!recent) return;
    // Optional endpoint (if supported by server)
    try{
      const data = await fetchJson("/api/employee-invites/recent");
      if(!data || !data.ok) throw new Error(data?.error || "RECENT_FAILED");
      const items = data.invites || [];
      recent.innerHTML = "";
      if(items.length===0){
        recent.textContent = "No recent invites.";
        return;
      }
      items.slice(0,10).forEach(i=>{
        const div = document.createElement("div");
        div.className = "hint muted";
        div.style.margin = "6px 0";
        const exp = i.expires_at ? new Date(i.expires_at).toLocaleString() : "";
        const status = i.used_at ? "USED" : (i.status || "");
        div.textContent = `${i.invite_code} — employee_id: ${i.employee_id} — ${status} — exp: ${exp}`;
        recent.appendChild(div);
      });
    }catch(e){
      // silently ignore if endpoint not implemented
      recent.textContent = "";
    }
  }

  btnGen.addEventListener("click", async ()=>{
    clearError();
    if(!getToken()){
      showError("You must be logged in as ADMIN.");
      return;
    }
    const employeeId = Number(elEmp?.value || 0);
    const note = String(elNote?.value || "").trim();

    if(!employeeId || employeeId < 1){
      showError("Please enter a valid Employee ID.");
      return;
    }

    btnGen.disabled = true;
    btnGen.textContent = "Generating...";
    try{
      const data = await fetchJson("/api/employee-invites/generate", {
        method:"POST",
        body: JSON.stringify({ employee_id: employeeId, note })
      });

      if(!data?.ok){
        const code = data?.error || "FAILED";
        if(code === "NOTE_REQUIRED"){
          showError("Note is required when generating a new invite for the same employee.");
        }else if(code === "EMPLOYEE_NOT_FOUND"){
          showError("Employee ID not found.");
        }else{
          showError(code);
        }
        return;
      }
      showResult(data.invite);
      await refreshRecent();
    }catch(e){
      showError(e.message || "FAILED");
    }finally{
      btnGen.disabled = false;
      btnGen.textContent = "Generate";
    }
  });

  btnCopy?.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(out.value || "");
      btnCopy.textContent = "Copied";
      setTimeout(()=>btnCopy.textContent="Copy", 900);
    }catch(e){
      showError("Copy failed. Select the code and copy manually.");
    }
  });

  // initial
  refreshRecent();
}


// ---------------- Admin: Create User + Send Email Invite ----------------
function wireAdminCreateUserInvite(){
  // Inject UI inside Admin card, above the existing "Employee Invite Codes" section.
  const adminView = qs("#view-admin");
  if(!adminView) return;

  const card = adminView.querySelector(".card");
  if(!card) return;

  // If already injected, just wire handlers once
  if(qs("#btnCreateUserInvite")) return;

  const wrap = document.createElement("div");
  wrap.id = "adminCreateUserInviteWrap";
  wrap.innerHTML = `
    <div class="card-title" style="margin-top:2px">Create User + Email Invite</div>
    <div class="hint muted" style="margin-top:6px">
      Create an app user and send an activation email. The employee will set a PIN during activation, then login with username + PIN.
    </div>

    <div style="display:grid;grid-template-columns: 1fr 180px 180px;gap:10px;margin-top:14px;align-items:end">
      <div>
        <label class="label">Email</label>
        <input class="input" id="createUserEmail" type="email" placeholder="e.g., hedar.hallak+worker10@gmail.com" />
      </div>

      <div>
        <label class="label">Role</label>
        <select class="input" id="createUserRole">
          <option value="WORKER">WORKER</option>
          <option value="PURCHASING">PURCHASING</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </div>

      <div>
        <button class="btn primary" id="btnCreateUserInvite" style="width:100%">Create + Send</button>
      </div>
    </div>

    <div id="createUserResultWrap" style="margin-top:14px;display:none">
      <div class="hint muted">Activation Link</div>
      <div style="display:flex;gap:10px;align-items:center;margin-top:6px">
        <input class="input" id="activationLinkOut" readonly />
        <button class="btn" id="btnCopyActivationLink">Copy</button>
      </div>
      <div class="hint muted" id="createUserMeta" style="margin-top:8px"></div>
    </div>

    <div class="hint" id="createUserError" style="margin-top:12px;color:#ffb4b4;display:none"></div>

    <hr style="margin:16px 0;border:none;border-top:1px solid rgba(255,255,255,.10)"/>
  `;

  // Insert before the existing first card-title (Employee Invite Codes)
  const firstTitle = card.querySelector(".card-title");
  if(firstTitle){
    card.insertBefore(wrap, firstTitle);
  }else{
    card.prepend(wrap);
  }

  const btn = qs("#btnCreateUserInvite");
  const emailEl = qs("#createUserEmail");
  const roleEl = qs("#createUserRole");
  const resultWrap = qs("#createUserResultWrap");
  const linkOut = qs("#activationLinkOut");
  const meta = qs("#createUserMeta");
  const err = qs("#createUserError");
  const btnCopy = qs("#btnCopyActivationLink");

  function showError(msg){
    err.style.display = "";
    err.textContent = msg || "FAILED";
  }
  function clearError(){
    err.style.display = "none";
    err.textContent = "";
  }
  function showResult(data){
    resultWrap.style.display = "";
    linkOut.value = data?.activation_link || "";
    const u = data?.user || {};
    const exp = data?.expires_at ? new Date(data.expires_at).toLocaleString() : "";
    meta.textContent = `Username: ${u.username || ""}  |  Role: ${u.role || ""}  |  Expires: ${exp}`;
  }

  btn.addEventListener("click", async ()=>{
    clearError();
    resultWrap.style.display = "none";

    if(!getToken()){
      showError("You must be logged in.");
      return;
    }

    const email = String(emailEl?.value || "").trim();
    const role = String(roleEl?.value || "WORKER").trim();

    if(!email){
      showError("Please enter an email.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Sending...";
    try{
      const payload = { email, role };
      const data = await fetchJson("/api/admin/users", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if(!data?.ok){
        const code = data?.error || "FAILED";
        if(code === "ROLE_REQUIRED"){
          showError("Admin role required for this action.");
        }else if(code === "USER_EMAIL_EXISTS"){
          showError("Email already exists. Use a different email.");
        }else{
          showError(code);
        }
        return;
      }

      showResult(data);
    }catch(e){
      showError(e.message || "FAILED");
    }finally{
      btn.disabled = false;
      btn.textContent = "Create + Send";
    }
  });

  btnCopy?.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(linkOut.value || "");
      btnCopy.textContent = "Copied";
      setTimeout(()=>btnCopy.textContent="Copy", 900);
    }catch(e){
      showError("Copy failed. Select the link and copy manually.");
    }
  });
}





// --- Profile UX patch (Step 1): hide lat/lng inputs + add Home Unit (Apt/Unit) ---
function patchProfileFormForUnitAndNoCoords(){
  try{
    // Hide any lat/lng inputs if present in HTML
    const latEl = document.getElementById("pfLat");
    const lngEl = document.getElementById("pfLng");
    [latEl, lngEl].forEach(el=>{
      if(!el) return;
      // hide closest field wrapper
      const wrap = el.closest(".field") || el.closest("div") || el.parentElement;
      if(wrap) wrap.style.display = "none";
      el.value = "";
      el.disabled = true;
    });

    // If unit field doesn't exist, inject it after Street
    if(!document.getElementById("pfUnit")){
      const streetEl = document.getElementById("pfStreet");
      if(streetEl){
        const field = document.createElement("div");
        field.className = "field";
        field.innerHTML = `
          <label class="label">Home Unit (Apt/Unit)</label>
          <input id="pfUnit" class="input" placeholder="e.g., Apt 305" />
          <div class="hint muted"></div>
        `;
        // Insert after street field wrapper
        const streetWrap = streetEl.closest(".field") || streetEl.parentElement;
        if(streetWrap && streetWrap.parentElement){
          streetWrap.parentElement.insertBefore(field, streetWrap.nextSibling);
        }
      }
    }
  }catch(e){}
}



function formatUsCaPhone(raw){
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 10);
  if(digits.length === 0) return "";
  if(digits.length < 4) return "(" + digits;
  if(digits.length < 7) return "(" + digits.slice(0,3) + ") " + digits.slice(3);
  return "(" + digits.slice(0,3) + ") " + digits.slice(3,6) + "-" + digits.slice(6);
}

function isValidUsCaPhone(raw){
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.length === 10;
}

function formatCanadianPostal(raw){
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const six = s.slice(0, 6);
  if(six.length <= 3) return six;
  return six.slice(0,3) + " " + six.slice(3);
}

function isValidCanadianPostal(raw){
  const v = formatCanadianPostal(raw);
  return /^[A-Z]\d[A-Z] \d[A-Z]\d$/.test(v);
}

// ---------------- Profile (UI only) ----------------
function wireProfileUI(){
  try{ patchProfileFormForUnitAndNoCoords(); }catch(e){}
  const editBtn = qs("#pfEditBtn");
  if(!editBtn) return;

  // If already wired once, just re-apply current state (e.g., after onboarding gate updates mustCompleteNow)
  if(window.__pfApplyState){
    try{ window.__pfApplyState(); }catch(e){}
    return;
  }

  const saveBtn = qs("#pfSaveBtn");
  const cancelBtn = qs("#pfCancelBtn");
  const hint = qs("#pfHint");

  const fields = [
    qs("#pfTrade"),
    qs("#pfRank"),
    qs("#pfPhone"),
    qs("#pfStreet"),
    qs("#pfCity"),
    qs("#pfPostal"),
    qs("#pfUnit"),
    qs("#pfEmgName"),
    qs("#pfEmgPhone"),
    qs("#pfEmgRelation"),
  ].filter(Boolean);

  let snapshot = null;

  // Phone UX: (111) 999-9999
  const phoneEl = qs("#pfPhone");
  phoneEl?.addEventListener("input", ()=>{
    const v = formatUsCaPhone(phoneEl.value);
    phoneEl.value = v;
  });

  // Emergency Contact Phone UX: (111) 999-9999
  const emgPhoneEl = qs("#pfEmgPhone");
  emgPhoneEl?.addEventListener("input", ()=>{
    const v = formatUsCaPhone(emgPhoneEl.value);
    emgPhoneEl.value = v;
  });

  // Postal code UX (Canada): A1A 1A1
  const postalEl = qs("#pfPostal");
  postalEl?.addEventListener("input", ()=>{
    const v = formatCanadianPostal(postalEl.value);
    postalEl.value = v;
  });

  function setDisabled(disabled){
    fields.forEach(el=>{ el.disabled = disabled; });
  }

  function setEditingUI(isEditing){
    if(saveBtn) saveBtn.style.display = isEditing ? "" : "none";
    if(cancelBtn) cancelBtn.style.display = isEditing ? "" : "none";
    editBtn.style.display = "";
    if(hint){
      hint.style.display = isEditing ? "" : "none";
      hint.textContent = mustCompleteNow ? "Profile completion required" : (isEditing ? "Edit mode" : "");
    }
  }

  function takeSnapshot(){
    snapshot = fields.map(el=>({ id: el.id, value: el.value }));
  }

  function restoreSnapshot(){
    if(!snapshot) return;
    snapshot.forEach(s=>{
      const el = document.getElementById(s.id);
      if(el) el.value = s.value;
    });
  }

  // Apply current edit/read-only state (and expose it so we can refresh after gate changes)
  window.__pfApplyState = ()=>{
    if(mustCompleteNow){
      setDisabled(false);
      setEditingUI(true);
    }else{
      setDisabled(true);
      setEditingUI(false);
    }
    if(saveBtn) saveBtn.textContent = mustCompleteNow ? "Submit Profile" : "Save";
  };

  // default
  window.__pfApplyState();


  editBtn.addEventListener("click", ()=>{
    if(mustCompleteNow) return;
    takeSnapshot();
    setDisabled(false);
    setEditingUI(true);
  });

  cancelBtn?.addEventListener("click", ()=>{
    restoreSnapshot();
    setDisabled(true);
    setEditingUI(false);
  });

    saveBtn?.addEventListener("click", async ()=>{
    const trade = String(qs("#pfTrade")?.value || "").trim();
    const rank = String(qs("#pfRank")?.value || "").trim();
    const phoneRaw = String(qs("#pfPhone")?.value || "").trim();
    const phone = formatUsCaPhone(phoneRaw);
    const street = String(qs("#pfStreet")?.value || "").trim();
    const city = String(qs("#pfCity")?.value || "").trim();
    const postalRaw = String(qs("#pfPostal")?.value || "").trim();
    const postal = formatCanadianPostal(postalRaw);
    const unit = String(qs("#pfUnit")?.value || "").trim();

    const emgName = String(qs("#pfEmgName")?.value || "").trim();
    const emgPhoneRaw = String(qs("#pfEmgPhone")?.value || "").trim();
    const emgPhone = formatUsCaPhone(emgPhoneRaw);
    const emgRelation = String(qs("#pfEmgRelation")?.value || "").trim();

    if(postal && !isValidCanadianPostal(postal)){
      toast("Postal code format must be A1A 1A1");
      if(mustCompleteNow){ return; }
      return;
    }

    if(phone && !isValidUsCaPhone(phone)){
      toast("Phone must have 10 digits: (111) 999-9999");
      if(mustCompleteNow){ return; }
      return;
    }

    if(emgPhone && !isValidUsCaPhone(emgPhone)){
      toast("Emergency contact phone must have 10 digits: (111) 999-9999");
      if(mustCompleteNow){ return; }
      return;
    }

    const isComplete = !!(trade && rank && phone && street && city && postal && emgName && emgPhone);

    if(!isComplete){
      toast("Please complete: Trade, Rank, Phone, Street, City, Postal, Emergency contact");
      if(mustCompleteNow){
        // Keep user in edit mode until profile is complete
        return;
      }
      if(PROFILE_GATED){
        applyProfileGate(true);
        setView("profile");
      }
      return;
    }

    // Step-2: Persist to backend (employee_id based)
    const roleCode = (String(rank).toUpperCase() === "FOREMAN") ? "FOREMAN" : "WORKER";

    try{
      const r = await fetchJson(Endpoints.profileCreate, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: String(CURRENT_USER?.username || "").trim(), // backend will derive a better name if available
          phone,
          trade_code: trade,
          role_code: roleCode,
          rank_code: rank,
          street,
          city,
          province: "QC",
          postal_code: postal,
          emergency_contact_name: emgName,
          emergency_contact_phone: emgPhone,
          emergency_contact_relationship: emgRelation,
          home_unit: unit || null
        })
      });

      if(r?.ok){
        setProfileCompletedLocal(true);
        applyProfileGate(false);
        toast("Profile completed ✅");
        ensureProfileMeLoadedAndRendered().catch(()=>{});
        const hintEl = qs("#pfHint");
        if(hintEl){ hintEl.style.display = "none"; hintEl.textContent = ""; }
        setDisabled(true);
        setEditingUI(false);
        return;
      }

      toast("Profile save failed");
      console.warn("profile save response:", r);
    
}catch(e){
      const msg = String(e?.message || e || "");
      const apiErr = String(e?.data?.error || e?.data?.eor || e?.data?.code || "").trim();
      const apiMsg = String(e?.data?.message || "").trim();

      // ERP-grade UX: show backend error/message for duplicate phone (unique phone_digits)
      if(apiErr === "PHONE_ALREADY_IN_USE"){
        const pretty = apiMsg || "Phone number is already used by another employee. Please enter a different phone.";
        showAlert("Phone already in use", pretty);
        toast(pretty);
        if(mustCompleteNow){
          // Keep user in edit mode
          return;
        }
        return;
      }

      // If already exists, treat as completed (user might have completed previously)
      if(msg.includes("409") || msg.toUpperCase().includes("PROFILE_ALREADY_EXISTS")){
        setProfileCompletedLocal(true);
        applyProfileGate(false);
        toast("Profile already completed ✅");
        const hintEl = qs("#pfHint");
        if(hintEl){ hintEl.style.display = "none"; hintEl.textContent = ""; }
        setDisabled(true);
        setEditingUI(false);
        return;
      }

      toast("Profile save failed (check DB/migrations)");
      console.warn("profile save failed:", e);
      if(mustCompleteNow){
        // Keep user in edit mode
        return;
      }
    }
  });
}


// ---------------- Boot ----------------
async function boot(){
  wireTabs();
  ensureLoginUI();
  wireMaterials();
  wireAdminEmployees();
  wireAdminInvites();
  wireProfileUI();

  await refreshAuth();
  if(getToken()){
    await enforceOnboardingGate();
  }

  await loadProjects();
  
  // Patch assignments list renderer sorting (UI only)
  patchAssignmentsListSorting();
  // Some pages define renderAssignmentsList after this file loads; re-try briefly.
  setTimeout(patchAssignmentsListSorting, 250);
  setTimeout(patchAssignmentsListSorting, 900);
  setTimeout(patchAssignmentsListSorting, 1800);

  qs("#btnReload")?.addEventListener("click",()=>window.location.reload());

  // Default view (D1):
  // - If profile is gated OR profile not marked complete locally -> Profile
  // - Non-admin always lands on Profile first after activation until complete
  const role = normalizeRole(CURRENT_USER?.role);
  const shouldProfile = PROFILE_GATED || !isProfileCompletedLocal() || (role && role !== "ADMIN" && role !== "FOREMAN" && !isProfileCompletedLocal());
  setView(shouldProfile ? "profile" : "daily_attendance");

}

document.addEventListener("DOMContentLoaded", boot);



/* Step 5.2: delegated profile buttons (robust binding) */
(function(){
  function qs(sel){ return document.querySelector(sel); }
  function safeCall(fn){ try{ fn && fn(); }catch(e){} }

  // Toggle editing state + apply UI if helpers exist
  function setEditing(on){
    window.__pfEditing = !!on;
    safeCall(window.__pfApplyState);
    // Fallback: try enable/disable fields directly if setDisabled exists
    if(typeof window.__pfSetDisabled === "function"){
      safeCall(()=>window.__pfSetDisabled(!on));
    }
  }

  document.addEventListener("click", (ev)=>{
    const t = ev.target && (ev.target.closest ? ev.target.closest("#pfEditBtn, #pfSaveBtn, #pfCancelBtn") : null);
    if(!t) return;

    if(t.id === "pfEditBtn"){
      ev.preventDefault();
      setEditing(true);
      return;
    }
    if(t.id === "pfCancelBtn"){
      ev.preventDefault();
      // restore snapshot if available
      if(typeof window.__pfRestoreSnapshot === "function"){ safeCall(window.__pfRestoreSnapshot); }
      setEditing(false);
      return;
    }
    if(t.id === "pfSaveBtn"){
      // leave existing save handler to run if it is bound
      // but ensure we are in editing mode
      window.__pfEditing = true;
      safeCall(window.__pfApplyState);
      return;
    }
  }, true);
})();


/* Step 6.1: format phone fields on display (safety) */
(function(){
  function fmt(){
    try{
      const phoneEl = document.querySelector("#pfPhone");
      if(phoneEl) phoneEl.value = formatUsCaPhone(phoneEl.value);
      const emgEl = document.querySelector("#pfEmgPhone");
      if(emgEl) emgEl.value = formatUsCaPhone(emgEl.value);
    }catch(e){}
  }
  // run now + after load
  try{ fmt(); }catch(e){}
  window.addEventListener("load", ()=>{ try{ fmt(); }catch(e){} });
})();
