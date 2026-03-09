// public/assignments_v2.js
"use strict";

/*
  Assignments V2 (Phase 1)
  - Views: Create / List / Requests
  - Uses existing app.css (no extra CSS)
  - Login is handled by main app (token in localStorage)
  - RBAC (minimal):
      ADMIN, PROJECTS_ADMIN: full CRUD + approve/reject requests
      PM, FOREMAN: can create requests (Request Modify)
      WORKER: read-only
*/

(() => {
  // ---------------- Helpers ----------------
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => [...document.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const LS_AUTH_TOKEN = "mep_auth_token";

  function getToken() {
    // Keep compatibility with previous token names
    return (
      localStorage.getItem(LS_AUTH_TOKEN) ||
      localStorage.getItem("token") ||
      localStorage.getItem("mep_token") ||
      localStorage.getItem("mep_auth_token") ||
      ""
    ).trim();
  }

  async function fetchJson(path, opts = {}) {
    const token = getToken();
    const res = await fetch(path, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: "Bearer " + token } : {}),
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error || res.statusText || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function isoToday() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function isoTomorrow() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  function parseDateOnly(s) {
    if (!s) return null;
    const d = new Date(String(s).slice(0, 10) + "T00:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
  }

  // ---------------- RBAC ----------------
  let CURRENT_USER = null;

  function roleName() {
    return String(CURRENT_USER?.role || "").trim().toUpperCase();
  }

  function hasRole(...roles) {
    const r = roleName();
    return roles.map((x) => String(x).toUpperCase()).includes(r);
  }

  function canCrudAssignments() {
    return hasRole("ADMIN", "PROJECTS_ADMIN");
  }

  function canCreateRequests() {
    return hasRole("ADMIN", "PROJECTS_ADMIN", "PM", "FOREMAN");
  }

  function canApproveRequests() {
    // Conservative default (can be relaxed later)
    return hasRole("ADMIN", "PROJECTS_ADMIN");
  }

  // ---------------- State ----------------
  let projects = [];
  let projectsById = new Map();
  let employees = [];
  let employeesById = new Map();
  let assignments = [];
  let requests = [];

  let editingId = null;

  function projectLabel(projectId) {
    const p = projectsById.get(String(projectId));
    if (!p) return String(projectId ?? "");
    const code = p.project_code || p.code || "";
    const name = p.project_name || p.name || "";
    return `${code} - ${name}`.trim().replace(/^\s*-\s*/, "");
  }

  function employeeLabel(empId) {
    const e = employeesById.get(String(empId));
    if (!e) return String(empId ?? "");
    const code = e.employee_code ? `${e.employee_code} - ` : "";
    const name = e.full_name || `${e.first_name || ""} ${e.last_name || ""}`.trim();
    return `${code}${name}`.trim();
  }

  // ---------------- UI: Tabs ----------------
  const views = {
    create: null,
    list: null,
    requests: null,
  };

  function setTab(name) {
    qsa(".subtab").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    Object.entries(views).forEach(([k, el]) => el && el.classList.toggle("hidden", k !== name));
    if (name === "list") renderList();
    if (name === "requests") renderRequests();
    if (name === "create") applyCreateRBAC();
  }

  // ---------------- UI: Build Create ----------------
  function buildCreateUI() {
    const root = views.create;
    if (!root) return;

    root.innerHTML = `
      <h3>Create Assignment</h3>
      <div class="miniHint" id="caHint">Create / update an assignment (overlap-aware).</div>

      <div class="card" style="margin-top:12px;">
        <div class="row" style="gap:12px; align-items:end; flex-wrap:wrap;">
          <div style="min-width:180px;">
            <div class="miniHint">From</div>
            <input id="caFrom" type="date" class="input" />
          </div>
          <div style="min-width:180px;">
            <div class="miniHint">To</div>
            <input id="caTo" type="date" class="input" />
          </div>
          <div style="min-width:280px; flex:1 1 320px;">
            <div class="miniHint">Project</div>
            <select id="caProject" class="select"></select>
          </div>
          <div style="min-width:180px;">
            <div class="miniHint">Role</div>
            <select id="caRole" class="select">
              <option value="WORKER">WORKER</option>
              <option value="FOREMAN">FOREMAN</option>
            </select>
          </div>
          <div style="min-width:140px;">
            <div class="miniHint">Shift Start</div>
            <select id="caShiftStart" class="select"></select>
          </div>
          <div style="min-width:140px;">
            <div class="miniHint">Shift End</div>
            <select id="caShiftEnd" class="select"></select>
          </div>
          <div style="min-width:320px; flex:1 1 360px;">
            <div class="miniHint">Employee</div>
            <select id="caEmployee" class="select"></select>
          </div>

          <div style="min-width:160px;">
            <button class="btn primary" id="caSubmit" type="button" style="width:100%;">Create</button>
          </div>
          <div style="min-width:160px;">
            <button class="btn" id="caCancelEdit" type="button" style="width:100%; display:none;">Cancel Edit</button>
          </div>
        </div>

        <div class="hint" id="caMsg" style="margin-top:10px;"></div>
      </div>
    `;

    // Defaults
    qs("#caFrom").value = isoTomorrow();
    qs("#caTo").value = isoTomorrow();
    buildTimeOptions(qs("#caShiftStart"), 30);
    buildTimeOptions(qs("#caShiftEnd"), 30);
    ensureOption(qs("#caShiftEnd"), "14:30");
    qs("#caShiftStart").value = "06:00";
    qs("#caShiftEnd").value = "14:30";

    // Events
    qs("#caFrom").addEventListener("change", () => {
      const f = qs("#caFrom").value;
      if (qs("#caTo").value < f) qs("#caTo").value = f;
      if (editingId) qs("#caMsg").textContent = "";
    });
    qs("#caTo").addEventListener("change", () => {
      if (editingId) qs("#caMsg").textContent = "";
    });

    qs("#caSubmit").addEventListener("click", onCreateOrUpdate);
    qs("#caCancelEdit").addEventListener("click", cancelEdit);

    refreshCreateDropdowns();
    applyCreateRBAC();
  }

  function applyCreateRBAC() {
    const can = canCrudAssignments();
    const btn = qs("#caSubmit");
    const cancel = qs("#caCancelEdit");
    if (!btn) return;

    btn.disabled = !can;
    if (!can) {
      qs("#caMsg").textContent = "Not allowed (RBAC). Only ADMIN / PROJECTS_ADMIN can create or edit assignments.";
    } else {
      if (!editingId) qs("#caMsg").textContent = "";
    }
    if (cancel) cancel.disabled = !can;
  }

  function refreshCreateDropdowns() {
    const pSel = qs("#caProject");
    const eSel = qs("#caEmployee");
    if (!pSel || !eSel) return;

    const pPrev = pSel.value;
    pSel.innerHTML = projects
      .map((p) => `<option value="${esc(p.id)}">${esc(projectLabel(p.id))}</option>`)
      .join("");
    if (pPrev) pSel.value = pPrev;

    const ePrev = eSel.value;
    eSel.innerHTML = employees
      .map((e) => `<option value="${esc(e.id)}">${esc(employeeLabel(e.id))}</option>`)
      .join("");
    if (ePrev) eSel.value = ePrev;
  }

  // ---------------- Create / Update logic ----------------
  function localOverlapConflict(empId, fromISO, toISO) {
    const selFrom = parseDateOnly(fromISO);
    const selTo = parseDateOnly(toISO);
    if (!selFrom || !selTo) return null;

    for (const a of assignments) {
      if (String(a.employee_id) !== String(empId)) continue;
      if (editingId && String(a.id ?? a.assignment_id) === String(editingId)) continue;

      const aFrom = parseDateOnly(a.assigned_from);
      const aTo = parseDateOnly(a.assigned_to || a.assigned_from);
      if (!aFrom || !aTo) continue;

      if (rangesOverlap(selFrom, selTo, aFrom, aTo)) {
        return {
          project: projectLabel(a.project_id),
          from: String(a.assigned_from || "").slice(0, 10),
          to: String(a.assigned_to || a.assigned_from || "").slice(0, 10),
        };
      }
    }
    return null;
  }

  async function onCreateOrUpdate() {
    if (!canCrudAssignments()) {
      qs("#caMsg").textContent = "Not allowed (RBAC).";
      return;
    }

    const msg = qs("#caMsg");
    msg.textContent = editingId ? "Updating..." : "Creating...";

    const project_id = Number(qs("#caProject").value || 0);
    const employee_id = Number(qs("#caEmployee").value || 0);
    const assigned_from = qs("#caFrom").value;
    const assigned_to = qs("#caTo").value;
    const assignment_role = qs("#caRole").value;
    const shift_start_time = qs("#caShiftStart").value || null;
    const shift_end_time = qs("#caShiftEnd").value || null;

    if (!project_id) return (msg.textContent = "Select a project.");
    if (!employee_id) return (msg.textContent = "Select an employee.");
    if (!assigned_from || !assigned_to) return (msg.textContent = "Set From and To dates.");
    if (assigned_to < assigned_from) return (msg.textContent = "To must be >= From.");

    const conflict = localOverlapConflict(employee_id, assigned_from, assigned_to);
    if (conflict) {
      msg.textContent = `Overlap: ${conflict.project} (${conflict.from} → ${conflict.to})`;
      return;
    }

    const body = {
      project_id,
      employee_id,
      assignment_role,
      assigned_from,
      assigned_to,
      shift_start_time,
      shift_end_time,
    };

    try {
      if (!editingId) {
        await fetchJson("/api/assignments_v2/direct", {
          method: "POST",
          body: JSON.stringify({
            employee_ids: [employee_id],
            project_id,
            start_date: assigned_from,
            end_date: assigned_to,
            shift: `${shift_start_time || ""}-${shift_end_time || ""}`,
          }),
        });
        msg.textContent = "Created ✓";
      } else {
        await fetchJson(`/api/assignments_v2/${encodeURIComponent(String(editingId))}`, {
          method: "PUT",
          body: JSON.stringify({
            employee_id,
            project_id,
            start_date: assigned_from,
            end_date: assigned_to,
            shift: `${shift_start_time || ""}-${shift_end_time || ""}`,
          }),
        });
        msg.textContent = "Updated ✓";
      }
      editingId = null;
      qs("#caSubmit").textContent = "Create";
      qs("#caCancelEdit").style.display = "none";
      await refreshData();
      setTab("list");
    } catch (e) {
      msg.textContent = `Failed: ${e.message}`;
      // If backend uses 409 for overlaps, refresh data to re-sync
      if (e.status === 409) {
        await refreshAssignments();
      }
    }
  }

  function cancelEdit() {
    editingId = null;
    qs("#caSubmit").textContent = "Create";
    qs("#caCancelEdit").style.display = "none";
    qs("#caMsg").textContent = "";
  }

  // ---------------- UI: List ----------------
  function buildListUI() {
    const root = views.list;
    if (!root) return;

    root.innerHTML = `
      <h3>Assignments List</h3>
      <div class="miniHint">Truth table (Search • Edit • Delete • Request Modify)</div>

      <div class="card" style="margin-top:12px;">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <div class="miniHint" id="listMeta">0 row(s)</div>
          <div class="row" style="gap:10px;">
            <input id="listSearch" class="input" style="min-width:280px;" placeholder="Search..." />
            <button class="btn" id="btnListRefresh" type="button">Refresh</button>
            <button class="btn" id="btnListExport" type="button">Export CSV</button>
          </div>
        </div>

        <div class="tableWrap" style="margin-top:12px;">
          <div id="listBody"></div>
        </div>
      </div>
    `;

    qs("#listSearch").addEventListener("input", renderList);
    qs("#btnListRefresh").addEventListener("click", async () => {
      await refreshAssignments();
      renderList();
    });
    qs("#btnListExport").addEventListener("click", exportAssignmentsCsv);
  }

  function getFilteredListRows() {
    const q = String(qs("#listSearch")?.value || "").trim().toLowerCase();
    const rows = Array.isArray(assignments) ? [...assignments] : [];
    rows.sort(compareListRows);

    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        employeeLabel(r.employee_id),
        projectLabel(r.project_id),
        r.assignment_role,
        String(r.assigned_from || ""),
        String(r.assigned_to || ""),
        String(r.shift_start_time || ""),
        String(r.shift_end_time || ""),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  function parseDateTs(v) {
    const s = String(v ?? "").slice(0, 10);
    if (!s) return Number.POSITIVE_INFINITY;
    const t = Date.parse(s + "T00:00:00");
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }

  function compareListRows(a, b) {
    const projA = projectLabel(a.project_id);
    const projB = projectLabel(b.project_id);
    const p = projA.localeCompare(projB, undefined, { sensitivity: "base" });
    if (p !== 0) return p;
    const da = parseDateTs(a.assigned_from);
    const db = parseDateTs(b.assigned_from);
    if (da !== db) return da - db;
    const empA = employeeLabel(a.employee_id);
    const empB = employeeLabel(b.employee_id);
    return empA.localeCompare(empB, undefined, { sensitivity: "base" });
  }

  function renderList() {
    const meta = qs("#listMeta");
    const body = qs("#listBody");
    if (!meta || !body) return;

    const rows = getFilteredListRows();
    meta.textContent = `${rows.length} row(s)`;

    const canCrud = canCrudAssignments();
    const canReq = canCreateRequests();

    body.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Project</th>
            <th>Role</th>
            <th>From</th>
            <th>To</th>
            <th>Shift</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r) => {
              const id = esc(String(r.id ?? r.assignment_id ?? ""));
              const from = esc(String(r.assigned_from || "").slice(0, 10));
              const to = esc(String(r.assigned_to || r.assigned_from || "").slice(0, 10));
              const shift = esc(`${String(r.shift_start_time || "")} - ${String(r.shift_end_time || "")}`.trim());
              return `
                <tr data-id="${id}">
                  <td>${esc(employeeLabel(r.employee_id))}</td>
                  <td>${esc(projectLabel(r.project_id))}</td>
                  <td>${esc(r.assignment_role || "")}</td>
                  <td>${from}</td>
                  <td>${to}</td>
                  <td>${shift}</td>
                  <td>
                    ${canCrud ? `<button class="btn small" data-edit="${id}">Edit</button>` : ``}
                    ${canCrud ? `<button class="btn small danger" data-del="${id}">Delete</button>` : ``}
                    ${canReq ? `<button class="btn small" data-reqmod="${id}">Request Modify</button>` : ``}
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    // Actions
    body.querySelectorAll("button[data-edit]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-edit");
        const row = assignments.find((x) => String(x.assignment_id) === String(id));
        if (!row) return;
        startEdit(row);
      });
    });

    body.querySelectorAll("button[data-del]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-del");
        if (!id) return;
        const ok = confirm(`Delete assignment ${id}?`);
        if (!ok) return;
        try {
          await fetchJson(`/api/assignments_v2/cancel/${encodeURIComponent(id)}`, { method: "POST" });
          await refreshAssignments();
          renderList();
        } catch (e) {
          alert("Delete failed: " + e.message);
        }
      });
    });

    body.querySelectorAll("button[data-reqmod]").forEach((b) => {
      b.addEventListener("click", () => {
        const id = b.getAttribute("data-reqmod");
        const row = assignments.find((x) => String(x.assignment_id) === String(id));
        if (!row) return;
        requestModify(row);
      });
    });
  }

  function startEdit(row) {
    if (!canCrudAssignments()) {
      alert("Not allowed (RBAC).");
      return;
    }
    editingId = row.id ?? row.assignment_id;

    qs("#caFrom").value = String(row.assigned_from || "").slice(0, 10);
    qs("#caTo").value = String(row.assigned_to || row.assigned_from || "").slice(0, 10);
    qs("#caProject").value = String(row.project_id);
    qs("#caEmployee").value = String(row.employee_id);
    qs("#caRole").value = String(row.assignment_role || "WORKER");

    const ss = String(row.shift_start_time || "").slice(0, 5);
    const se = String(row.shift_end_time || "").slice(0, 5);
    if (ss) qs("#caShiftStart").value = ss;
    if (se) qs("#caShiftEnd").value = se;

    qs("#caSubmit").textContent = "Update";
    qs("#caCancelEdit").style.display = "";
    qs("#caMsg").textContent = "Editing…";
    setTab("create");
  }

  // ---------------- Requests: submit modify ----------------
  async function requestModify(row) {
    if (!canCreateRequests()) {
      alert("Not allowed (RBAC).");
      return;
    }

    const from = String(row.assigned_from || "").slice(0, 10);
    const to = String(row.assigned_to || row.assigned_from || "").slice(0, 10);
    const dayDefault = from || isoToday();

    const day = prompt(
      `Request Modify\nEmployee: ${employeeLabel(row.employee_id)}\nFrom Project: ${projectLabel(row.project_id)}\nAssignment range: ${from} → ${to}\n\nEnter day (YYYY-MM-DD):`,
      dayDefault
    );
    if (day === null) return;
    const d = String(day || "").trim().slice(0, 10);
    if (!d || (from && d < from) || (to && d > to)) {
      alert("Invalid day. Choose a day within the assignment range.");
      return;
    }

    const options = projects
      .slice(0, 20)
      .map((p) => `${p.id}: ${projectLabel(p.id)}`)
      .join("\n");
    const toPid = prompt(`Enter To Project ID (must be different):\n\n${options}`, "");
    if (toPid === null) return;
    const toId = Number(String(toPid || "").trim());
    if (!Number.isFinite(toId) || !toId) return alert("Invalid To Project ID.");
    if (String(toId) === String(row.project_id)) return alert("To Project cannot be the same as From Project.");

    const note = prompt("Optional note:", `Modify request for ${d}`) ?? "";
    const noteText = String(note || "").trim() || null;

    // Duplicate pending guard (client-side)
    await refreshRequestsData();
    const hasDup = requests.some((x) => {
      const st = String(x.status || "").toUpperCase();
      if (st !== "PENDING") return false;
      return (
        String(x.employee_id) === String(row.employee_id) &&
        String(x.from_project_id) === String(row.project_id) &&
        String(x.to_project_id) === String(toId) &&
        String(x.requested_from || "").slice(0, 10) === d &&
        String(x.requested_to || "").slice(0, 10) === d
      );
    });
    if (hasDup) return alert("A pending request already exists for this employee/day/to-project.");

    try {
      await fetchJson("/api/borrow_requests", {
        method: "POST",
        body: JSON.stringify({
          employee_id: Number(row.employee_id),
          from_project_id: Number(row.project_id),
          to_project_id: Number(toId),
          requested_from: d,
          requested_to: d,
          note: noteText,
        }),
      });
      await refreshRequestsData();
      setTab("requests");
      alert("Request submitted ✓");
    } catch (e) {
      alert("Request failed: " + e.message);
    }
  }

  // ---------------- UI: Requests ----------------
  function buildRequestsUI() {
    const root = views.requests;
    if (!root) return;

    root.innerHTML = `
      <h3>Requests</h3>
      <div class="miniHint">Inbox for all assignment change requests.</div>

      <div class="card" style="margin-top:12px;">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <div class="miniHint" id="reqMeta">0 request(s)</div>
          <div class="row" style="gap:10px;">
            <button class="btn" id="btnReqRefresh" type="button">Refresh</button>
          </div>
        </div>

        <div class="tableWrap" style="margin-top:12px;">
          <div id="reqBody"></div>
        </div>
      </div>
    `;

    qs("#btnReqRefresh").addEventListener("click", async () => {
      await refreshRequestsData();
      renderRequests();
    });
  }

  async function refreshRequestsData() {
    const r = await fetchJson("/api/borrow_requests", { method: "GET" });
    requests = r.rows || [];
  }

  function renderRequests() {
    const meta = qs("#reqMeta");
    const body = qs("#reqBody");
    if (!meta || !body) return;

    meta.textContent = `${requests.length} request(s)`;
    const canApprove = canApproveRequests();

    body.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Status</th>
            <th>Employee</th>
            <th>From Project</th>
            <th>To Project</th>
            <th>Day</th>
            <th>Note</th>
            ${canApprove ? "<th>Actions</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${requests
            .map((x) => {
              const id = esc(x.id);
              const st = esc(String(x.status || ""));
              const isPending = String(x.status || "").toUpperCase() === "PENDING";
              const day = esc(String(x.requested_from || "").slice(0, 10));
              const note = esc(x.note || "");
              return `
                <tr>
                  <td>${id}</td>
                  <td>${st}</td>
                  <td>${esc(employeeLabel(x.employee_id))}</td>
                  <td>${esc(projectLabel(x.from_project_id))}</td>
                  <td>${esc(projectLabel(x.to_project_id))}</td>
                  <td>${day}</td>
                  <td>${note}</td>
                  ${
                    canApprove
                      ? `<td>
                           <button class="btn small" data-appr="${id}" ${isPending ? "" : "disabled"}>Approve</button>
                           <button class="btn small danger" data-rej="${id}" ${isPending ? "" : "disabled"}>Reject</button>
                         </td>`
                      : ""
                  }
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;

    if (!canApprove) return;

    body.querySelectorAll("button[data-appr]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-appr");
        b.disabled = true;
        try {
          await fetchJson(`/api/borrow_requests/${encodeURIComponent(id)}/approve`, {
            method: "PUT",
            body: JSON.stringify({ decision_note: null }),
          });
          await refreshRequestsData();
          renderRequests();
        } catch (e) {
          alert("Approve failed: " + e.message);
        }
      });
    });

    body.querySelectorAll("button[data-rej]").forEach((b) => {
      b.addEventListener("click", async () => {
        const id = b.getAttribute("data-rej");
        b.disabled = true;
        try {
          await fetchJson(`/api/borrow_requests/${encodeURIComponent(id)}/reject`, {
            method: "PUT",
            body: JSON.stringify({ decision_note: null }),
          });
          await refreshRequestsData();
          renderRequests();
        } catch (e) {
          alert("Reject failed: " + e.message);
        }
      });
    });
  }

  // ---------------- CSV Export ----------------
  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportAssignmentsCsv() {
    const rows = getFilteredListRows();
    const headers = ["Employee", "Project", "Role", "From", "To", "Shift Start", "Shift End"];
    const lines = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of rows) {
      lines.push(
        [
          employeeLabel(r.employee_id),
          projectLabel(r.project_id),
          r.assignment_role ?? "",
          String(r.assigned_from ?? "").slice(0, 10),
          String(r.assigned_to ?? r.assigned_from ?? "").slice(0, 10),
          r.shift_start_time ?? "",
          r.shift_end_time ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const ts = new Date();
    const filename = `assignments_${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(
      ts.getDate()
    ).padStart(2, "0")}.csv`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  // ---------------- Build time options ----------------
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function buildTimeOptions(selectEl, stepMinutes) {
    if (!selectEl) return;
    selectEl.innerHTML = "";
    for (let mins = 0; mins < 24 * 60; mins += stepMinutes) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      const val = `${pad2(h)}:${pad2(m)}`;
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      selectEl.appendChild(opt);
    }
  }
  function ensureOption(selectEl, val) {
    if (!selectEl) return;
    const has = [...selectEl.options].some((o) => o.value === val);
    if (!has) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      selectEl.appendChild(opt);
    }
  }

  // ---------------- Data loads ----------------
  async function refreshWhoami() {
    try {
      const r = await fetchJson("/api/auth/whoami", { method: "GET" });
      CURRENT_USER = r.user || null;
      return true;
    } catch {
      CURRENT_USER = null;
      return false;
    }
  }

  async function refreshProjects() {
    const r = await fetchJson("/api/projects", { method: "GET" });
    projects = Array.isArray(r) ? r : (r.rows || r.projects || []);
    projectsById = new Map(projects.map((p) => [String(p.id), p]));
  }

  async function refreshEmployees() {
    const r = await fetchJson("/api/employees?active_only=1", { method: "GET" });
    employees = r.rows || r.employees || [];
    employeesById = new Map(employees.map((e) => [String(e.id), e]));
  }

  async function refreshAssignments() {
    const r = await fetchJson("/api/assignments_v2", { method: "GET" });
    const raw = r.rows || r.assignments || [];
    assignments = raw.map((x) => {
      const shift = String(x.shift || "").trim();
      let shift_start_time = x.shift_start_time || "";
      let shift_end_time = x.shift_end_time || "";
      if (shift && (!shift_start_time || !shift_end_time) && shift.includes("-")) {
        const parts = shift.split("-");
        shift_start_time = String(parts[0] || "").trim();
        shift_end_time = String(parts[1] || "").trim();
      }
      return {
        ...x,
        assignment_id: x.assignment_id ?? x.id,
        assigned_from: x.assigned_from ?? x.start_date,
        assigned_to: x.assigned_to ?? x.end_date,
        assignment_role: x.assignment_role ?? x.role ?? "WORKER",
        shift_start_time,
        shift_end_time,
      };
    });
  }

  async function refreshData() {
    await refreshWhoami();
    await Promise.all([refreshProjects(), refreshEmployees(), refreshAssignments(), refreshRequestsData()]);
    refreshCreateDropdowns();
    applyCreateRBAC();
  }

  // ---------------- Boot ----------------
  async function boot() {
    // Map views
    views.create = qs("#view-create");
    views.list = qs("#view-list");
    views.requests = qs("#view-requests");

    // Build UIs
    buildCreateUI();
    buildListUI();
    buildRequestsUI();

    // Load data
    try {
      await refreshData();
      // Default view
      setTab("create");
    } catch (e) {
      // If token missing, show simple hint
      const msg = qs("#caMsg");
      if (msg) {
        msg.textContent = `Cannot load data: ${e.message}. (Login is handled by main app)`;
      }
    }

    // Tabs
    qsa(".subtab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
