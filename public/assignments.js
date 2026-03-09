// public/assignments.js
"use strict";

(() => {
  const $ = (id) => document.getElementById(id);

  const IS_EMBEDDED = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  function esc(s){
    return String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  }

  function getToken(){
    return localStorage.getItem("token") || localStorage.getItem("mep_token") || "";
  }
  function setToken(t){
    localStorage.setItem("token", t || "");
    localStorage.setItem("mep_token", t || "");
  }

  function isoToday(){
    const d=new Date();
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const dd=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  function tomorrowISO(){
    const d=new Date(); d.setDate(d.getDate()+1);
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const dd=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${dd}`;
  }

  async function api(path, opts = {}) {
    const token = getToken();
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...opts, headers });
    const text = await res.text();
    let data=null; try{ data = text ? JSON.parse(text) : null; } catch { data = { raw:text }; }
    if (!res.ok) {
      const err = new Error(data?.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  const STEP_MINUTES = 30;
  function pad2(n){ return String(n).padStart(2,"0"); }
  function buildTimeOptions(selectEl, step){
    selectEl.innerHTML="";
    for(let mins=0; mins<24*60; mins+=step){
      const h=Math.floor(mins/60), m=mins%60;
      const val=`${pad2(h)}:${pad2(m)}`;
      const opt=document.createElement("option");
      opt.value=val; opt.textContent=val;
      selectEl.appendChild(opt);
    }
  }
  function ensureOption(selectEl, val){
    const has=[...selectEl.options].some(o=>o.value===val);
    if(!has){
      const opt=document.createElement("option");
      opt.value=val; opt.textContent=val;
      selectEl.appendChild(opt);
    }
  }

  let CURRENT_USER = null;

  // ---------------- RBAC (Phase 1 minimal) ----------------
  function roleName(){
    return String(CURRENT_USER?.role || "").trim().toUpperCase();
  }
  function hasRole(...roles){
    const r = roleName();
    return roles.map(x=>String(x).toUpperCase()).includes(r);
  }
  // Minimal policy (safe + conservative):
  // - ADMIN, PROJECTS_ADMIN: full CRUD on assignments + approve/reject requests
  // - PM, FOREMAN: can create requests; (direct CRUD can be enabled later with project-scope)
  // - WORKER: read-only
  function canAssignmentsCrud(){
    return hasRole("ADMIN","PROJECTS_ADMIN");
  }
  function canCreateRequests(){
    return hasRole("ADMIN","PROJECTS_ADMIN","PM","FOREMAN");
  }
  function canApproveRequests(){
    return hasRole("ADMIN","PROJECTS_ADMIN","PM");
  }


  let projects=[]; let projectsById=new Map();
  let employees=[]; let employeesById=new Map();
  let assignments=[];

  let EDITING_ID = null;

  // IMPORTANT: Borrow depends on explicit selection now (Select button)
  let SELECTED_ASSIGNMENT_ID = null;
  let SELECTED_ASSIGNMENT_ROW = null;

  let BORROW_ROWS = [];
  function projectLabel(projectId){
    const p = projectsById.get(String(projectId));
    if (!p) return String(projectId);
    return `${p.project_code} - ${p.project_name}`.trim();
  }
  function employeeLabel(empId){
    const e = employeesById.get(String(empId));
    if (!e) return String(empId);
    const code = e.employee_code ? `${e.employee_code} - ` : "";
    const name = e.full_name || `${e.first_name||""} ${e.last_name||""}`.trim() || `Employee ${e.id}`;
    return `${code}${name}`.trim();
  }

  function parseDateOnly(s){
    if(!s) return null;
    const d=new Date(String(s).slice(0,10)+"T00:00:00");
    return isNaN(d.getTime())?null:d;
  }
  function rangesOverlapDateOnly(aStart,aEnd,bStart,bEnd){ return aStart<=bEnd && bStart<=aEnd; }

  function validateBorrowForm(){
    const msg = $("borrowMsg");
    const btn = $("btnBorrowSubmit");
    if (!msg || !btn) return true;

    if (!SELECTED_ASSIGNMENT_ROW) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "Select an assignment first (use the Select button in the list).";
      return false;
    }

    const from_project_id = String(SELECTED_ASSIGNMENT_ROW.project_id);
    const to_project_id = String(($("borrowToProject") && $("borrowToProject").value) || "");

    const requested_from = ($("borrowFrom") && $("borrowFrom").value) || "";
    const requested_to = ($("borrowTo") && $("borrowTo").value) || "";

    if (!to_project_id) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "Select a To Project.";
      return false;
    }

    if (to_project_id === from_project_id) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "To Project cannot be the same as From Project.";
      return false;
    }

    if (!requested_from || !requested_to) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "Set requested From and To dates.";
      return false;
    }

    if (requested_to < requested_from) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "Requested To must be >= Requested From.";
      return false;
    }


    // Prevent duplicate pending requests for same employee/project/date
    const day = requested_from; // single-day enforced
    const emp = String(SELECTED_ASSIGNMENT_ROW.employee_id);
    const fp = String(SELECTED_ASSIGNMENT_ROW.project_id);
    const tp = to_project_id;

    const hasDup = (BORROW_ROWS || []).some(x=>{
      const st = String(x.status || "").toUpperCase();
      if (st !== "PENDING") return false;
      return String(x.employee_id) === emp
        && String(x.from_project_id) === fp
        && String(x.to_project_id) === tp
        && String(x.requested_from || "").slice(0,10) === day
        && String(x.requested_to || "").slice(0,10) === day;
    });

    if (hasDup) {
      btn.disabled = true;
      msg.className = "miniHint errText";
      msg.textContent = "A pending request for this employee and date already exists.";
      return false;
    }

    // Valid
    btn.disabled = false;
    // Clear only validation errors (do not overwrite success/submitting)
    if (msg.className.includes("errText") && (
      msg.textContent.includes("To Project") ||
      msg.textContent.includes("Requested") ||
      msg.textContent.includes("Select")
    )) {
      msg.className = "miniHint";
      msg.textContent = "";
    }
    return true;
  }

  function enforceBorrowSingleDaySelection(){
    const fromEl = $("borrowFrom");
    const toEl = $("borrowTo");
    const toProjectEl = $("borrowToProject");
    if (!fromEl || !toEl || !toProjectEl) return;

    // If no selection, unlock but keep validation message
    if (!SELECTED_ASSIGNMENT_ROW){
      fromEl.disabled = false;
      toEl.disabled = false;
      return;
    }

    const aFrom = String(SELECTED_ASSIGNMENT_ROW.assigned_from || "").slice(0,10);
    const aTo = String(SELECTED_ASSIGNMENT_ROW.assigned_to || SELECTED_ASSIGNMENT_ROW.assigned_from || "").slice(0,10);

    // Borrow requests are for ONE day. If assignment spans multiple days, user picks ONE day within range.
    if (aFrom) {
      fromEl.min = aFrom;
      toEl.min = aFrom;
    }
    if (aTo) {
      fromEl.max = aTo;
      toEl.max = aTo;
    }

    // Default: keep requested_from = requested_to (single day)
    if (!fromEl.value) fromEl.value = aFrom || isoToday();
    toEl.value = fromEl.value;

    // Lock "To" to enforce single-day request
    toEl.disabled = true;

    // When user changes day, keep both equal
    if (!fromEl.__borrowBound){
      fromEl.addEventListener("change", ()=>{
        toEl.value = fromEl.value;
        validateBorrowForm();
        // Duplicate check lives inside validateBorrowForm (via BORROW_ROWS)
      });
      fromEl.addEventListener("input", ()=>{
        toEl.value = fromEl.value;
        validateBorrowForm();
      });
      fromEl.__borrowBound = true;
    }
  }



  function getSelectedRange(){
    const from=parseDateOnly($("assigned_from").value);
    const to=parseDateOnly($("assigned_to").value);
    if(!from||!to) return null;
    return {from,to};
  }

  function normalizeAssignmentRange(a){
    const from=parseDateOnly(a.assigned_from);
    const to=parseDateOnly(a.assigned_to)||from;
    return (from&&to)?{from,to}:null;
  }

  function getEmployeeConflict(empIdStr){
    const sel=getSelectedRange(); if(!sel) return null;
    for(const a of assignments){
      if(String(a.employee_id)!==empIdStr) continue;
      if (EDITING_ID && String(a.assignment_id) === String(EDITING_ID)) continue;
      const ar=normalizeAssignmentRange(a); if(!ar) continue;
      if(rangesOverlapDateOnly(sel.from, sel.to, ar.from, ar.to)){
        return {
          project: projectLabel(a.project_id),
          from: String(a.assigned_from).slice(0,10),
          to: a.assigned_to ? String(a.assigned_to).slice(0,10) : String(a.assigned_from).slice(0,10),
        };
      }
    }
    return null;
  }

  function updateRangeLabels(){
    const text = `${$("assigned_from").value} -> ${$("assigned_to").value}`;
    $("rangeLabel").textContent = text;
    $("rangeLabel2").textContent = text;
  }

  function fillProjects(){
    $("project_id").innerHTML="";
    for(const p of projects){
      const opt=document.createElement("option");
      opt.value=String(p.id);
      opt.textContent=projectLabel(p.id);
      $("project_id").appendChild(opt);
    }
    if(projects.length && !$("project_id").value) $("project_id").value=String(projects[0].id);
  }

  function fillBorrowToProjects(){
    const sel = $("borrowToProject");
    if(!sel) return;
    sel.innerHTML = "";
    for (const p of projects){
      const opt = document.createElement("option");
      opt.value = String(p.id);
      opt.textContent = projectLabel(p.id);
      sel.appendChild(opt);
    }
  }

  function fillEmployeesDropdown(){
    const prev=$("employee_id").value;
    $("employee_id").innerHTML="";
    for(const e of employees){
      const conflict=getEmployeeConflict(String(e.id));
      const opt=document.createElement("option");
      opt.value=String(e.id);
      opt.textContent = conflict ? `${employeeLabel(e.id)} (assigned)` : `${employeeLabel(e.id)} (available)`;
      $("employee_id").appendChild(opt);
    }
    if(prev) $("employee_id").value=prev;
    if(!prev && employees.length) $("employee_id").value=String(employees[0].id);
  }

  function renderEmployeesSidebar(){
    const list=$("empList");
    const q=$("empSearch").value.trim().toLowerCase();
    const selected=$("employee_id").value;
    list.innerHTML="";

    const filtered = employees.filter(e => {
      if(!q) return true;
      const id = String(e.id);
      const code = (e.employee_code||"").toLowerCase();
      const name = (e.full_name || `${e.first_name||""} ${e.last_name||""}`.trim()).toLowerCase();
      return id.includes(q) || code.includes(q) || name.includes(q);
    });

    let availableCount = 0;
    let assignedCount = 0;
    for (const e of filtered) {
      const conflict = getEmployeeConflict(String(e.id));
      if (conflict) assignedCount++; else availableCount++;
    }
    const ca = $("cntAvailable");
    const cs = $("cntAssigned");
    if (ca) ca.textContent = `Available: ${availableCount}`;
    if (cs) cs.textContent = `Assigned: ${assignedCount}`;

    if(!filtered.length){
      const div=document.createElement("div");
      div.className="empItem";
      div.textContent="No matches";
      list.appendChild(div);
      return;
    }

    for(const e of filtered){
      const id = String(e.id);
      const conflict=getEmployeeConflict(id);
      const isSelected = id === String(selected);

      const div=document.createElement("div");
      div.className="empItem";

      const top=document.createElement("div");
      top.className="empTop";

      const left=document.createElement("div");
      left.textContent = employeeLabel(e.id);

      const badge=document.createElement("span");
      badge.className="badge " + (isSelected ? "sel" : (conflict ? "warn" : "ok"));
      badge.textContent = isSelected ? "SELECTED" : (conflict ? "ASSIGNED" : "AVAILABLE");

      top.appendChild(left);
      top.appendChild(badge);
      div.appendChild(top);

      if(conflict){
        const small=document.createElement("div");
        small.className="smallErr";
        small.textContent = `Assigned: ${conflict.project} (${conflict.from} -> ${conflict.to})`;
        div.appendChild(small);
      }

      div.addEventListener("click", ()=>{
        $("employee_id").value=id;
        $("createMsg").textContent = "";
        renderEmployeesSidebar();
      });

      list.appendChild(div);
    }
  }

  async function whoami(){
    try{
      const data=await api("/api/auth/whoami",{method:"GET"});
      CURRENT_USER = data.user || null;
      $("who").textContent = `${data.user.username || "user"} (${data.user.role || "ROLE"})`;
      return true;
    }catch{
      CURRENT_USER = null;
      $("who").textContent="Not signed";
      return false;
    }
  }

  async function loadProjects(){
    const res=await api("/api/projects",{method:"GET"});
    projects = Array.isArray(res) ? res : (res.rows||[]);
    projectsById = new Map(projects.map(p=>[String(p.id),p]));
    fillProjects();
    fillBorrowToProjects();
  }

  async function loadEmployees(){
    const res = await api("/api/employees?active_only=1",{method:"GET"});
    employees = res.rows || [];
    employeesById = new Map(employees.map(e=>[String(e.id), e]));
  }

  async function loadAssignments(){
    const res = await api("/api/assignments",{method:"GET"});
    assignments = res.rows || [];
  }

  function setCreateMsg(text, ok){
    const el = $("createMsg");
    el.className = ok ? "miniHint okText" : "miniHint errText";
    el.textContent = text || "";
  }

  async function refreshAll(){
    await loadProjects();
    await loadEmployees();
    await loadAssignments();
    fillEmployeesDropdown();
    renderEmployeesSidebar();
    $("dataMsg").className = "miniHint okText";
    $("dataMsg").textContent = "Loaded projects, employees, and assignments.";
    updateRangeLabels();
    renderList();
  }

  async function login(){
    $("authMsg").className = "miniHint";
    $("authMsg").textContent = "Logging in...";
    try{
      const data=await api("/api/auth/login",{
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ username:$("username").value.trim(), pin:$("pin").value.trim() })
      });
      setToken(data.token);
      $("authMsg").className = "miniHint okText";
      $("authMsg").textContent = "Login ok.";
      await whoami();
      await refreshAll();
      applyEmbedMode();
    }catch(e){
      $("authMsg").className = "miniHint errText";
      $("authMsg").textContent = `Login failed: ${e.data?JSON.stringify(e.data):e.message}`;
    }
  }

  async function createAssignment(){
    setCreateMsg("Creating...", true);

    const pid=$("project_id").value ? Number($("project_id").value) : null;
    const empId=$("employee_id").value ? Number($("employee_id").value) : null;

    if(!pid){ setCreateMsg("Select a project.", false); return; }
    if(!empId){ setCreateMsg("Select an employee.", false); return; }

    const from=$("assigned_from").value;
    const to=$("assigned_to").value;

    if(!from||!to){ setCreateMsg("Set Assigned From and Assigned To.", false); return; }
    if(to<from){ setCreateMsg("Assigned To must be >= Assigned From.", false); return; }

    const conflict=getEmployeeConflict(String(empId));
    if(conflict){ setCreateMsg(`Overlap: ${conflict.project} (${conflict.from} -> ${conflict.to})`, false); return; }

    try{
      const body={
        project_id: pid,
        employee_id: empId,
        assignment_role: $("assignment_role").value,
        assigned_from: from,
        assigned_to: to,
        shift_start_time: $("shift_start_time").value || null,
        shift_end_time: $("shift_end_time").value || null
      };
      const data=await api("/api/assignments",{method:"POST", body: JSON.stringify(body)});
      setCreateMsg(`Created assignment_id=${data.row.assignment_id}`, true);
      await refreshAll();
    }catch(e){
      setCreateMsg(`Create failed: ${e.data?JSON.stringify(e.data):e.message}`, false);
      if (e.status === 409) await refreshAll();
    }
  }

  async function updateAssignment(){
    if (!EDITING_ID) return;

    setCreateMsg("Updating...", true);

    const pid=$("project_id").value ? Number($("project_id").value) : null;
    const empId=$("employee_id").value ? Number($("employee_id").value) : null;

    if(!pid){ setCreateMsg("Select a project.", false); return; }
    if(!empId){ setCreateMsg("Select an employee.", false); return; }

    const from=$("assigned_from").value;
    const to=$("assigned_to").value;

    if(!from||!to){ setCreateMsg("Set Assigned From and Assigned To.", false); return; }
    if(to<from){ setCreateMsg("Assigned To must be >= Assigned From.", false); return; }

    const conflict=getEmployeeConflict(String(empId));
    if(conflict){ setCreateMsg(`Overlap: ${conflict.project} (${conflict.from} -> ${conflict.to})`, false); return; }

    try{
      const body={
        project_id: pid,
        employee_id: empId,
        assignment_role: $("assignment_role").value,
        assigned_from: from,
        assigned_to: to,
        shift_start_time: $("shift_start_time").value || null,
        shift_end_time: $("shift_end_time").value || null
      };

      const data = await api(`/api/assignments/${encodeURIComponent(String(EDITING_ID))}`, {
        method: "PUT",
        body: JSON.stringify(body)
      });
      setCreateMsg(`Updated assignment_id=${data.row.assignment_id}`, true);
      stopEditing();
      await refreshAll();
      setSubView("list");
    } catch(e){
      setCreateMsg(`Update failed: ${e.data?JSON.stringify(e.data):e.message}`, false);
      if (e.status === 409) await refreshAll();
    }
  }

  function startEditing(row){
    EDITING_ID = row.assignment_id;

    $("editBanner").style.display = "";
    $("btnCreateOrUpdate").textContent = "Update";
    $("btnCancelEdit").style.display = "";
    $("createMsg").textContent = "";

    $("project_id").value = String(row.project_id);
    $("employee_id").value = String(row.employee_id);
    $("assignment_role").value = String(row.assignment_role || "WORKER");

    $("assigned_from").value = String(row.assigned_from || "").slice(0,10);
    $("assigned_to").value = String(row.assigned_to || row.assigned_from || "").slice(0,10);

    const ss = String(row.shift_start_time || "").slice(0,8);
    const se = String(row.shift_end_time || "").slice(0,8);
    if (ss) $("shift_start_time").value = ss.slice(0,5);
    if (se) $("shift_end_time").value = se.slice(0,5);

    updateRangeLabels();
    fillEmployeesDropdown();
    renderEmployeesSidebar();

    setSubView("create");
  }

  function stopEditing(){
    EDITING_ID = null;
    $("editBanner").style.display = "none";
    $("btnCreateOrUpdate").textContent = "Create";
    $("btnCancelEdit").style.display = "none";
    $("createMsg").textContent = "";

    fillEmployeesDropdown();
    renderEmployeesSidebar();
  }

  function parseDateTs(v){
    const s = String(v ?? "").slice(0,10);
    if(!s) return Number.POSITIVE_INFINITY;
    const t = Date.parse(s + "T00:00:00");
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  }

  function compareListRows(a,b){
    const projA = projectLabel(a.project_id);
    const projB = projectLabel(b.project_id);
    const p = projA.localeCompare(projB, undefined, { sensitivity:"base" });
    if(p !== 0) return p;

    const da = parseDateTs(a.assigned_from);
    const db = parseDateTs(b.assigned_from);
    if(da !== db) return da - db;

    const empA = employeeLabel(a.employee_id);
    const empB = employeeLabel(b.employee_id);
    return empA.localeCompare(empB, undefined, { sensitivity:"base" });
  }

  function getListFilteredRows(){
    const q = String($("listSearch").value || "").trim().toLowerCase();
    let rows = Array.isArray(assignments) ? [...assignments] : [];
    rows.sort(compareListRows);
    if(!q) return rows;

    return rows.filter(r=>{
      const hay = [
        employeeLabel(r.employee_id),
        projectLabel(r.project_id),
        r.assignment_role,
        String(r.assigned_from||""),
        String(r.assigned_to||""),
        String(r.shift_start_time||""),
        String(r.shift_end_time||"")
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function setSelectedAssignment(row){
    SELECTED_ASSIGNMENT_ID = row ? row.assignment_id : null;
    SELECTED_ASSIGNMENT_ROW = row || null;

    const hint = $("listSelectedHint");
    if (hint) {
      hint.className = "miniHint";
      hint.textContent = SELECTED_ASSIGNMENT_ID
        ? `Selected assignment_id=${SELECTED_ASSIGNMENT_ID} (Employee ${employeeLabel(row.employee_id)} / ${projectLabel(row.project_id)})`
        : "Select an assignment using the Select button.";
    }

    // Refresh list UI to visually mark the selected row
    renderList();

    // Keep borrow form in sync
    enforceBorrowSingleDaySelection();

    // If modal is open, keep borrow validation in sync
    const bm = $("borrowModal");
    if (bm && bm.style && bm.style.display === "flex") {
      validateBorrowForm();
    }
  }

  function openBorrowModal(){
    if (!SELECTED_ASSIGNMENT_ROW) {
      const hint = $("listSelectedHint");
      if (hint) {
        hint.className = "miniHint errText";
        hint.textContent = "Select an assignment first (use the Select button in the list).";
      } else {
        alert("Select an assignment first.");
      }
      return;
    }

    const row = SELECTED_ASSIGNMENT_ROW;

    $("borrowContext").textContent =
      `Employee: ${employeeLabel(row.employee_id)} | From project: ${projectLabel(row.project_id)} | Assignment: ${String(row.assigned_from).slice(0,10)} → ${String(row.assigned_to||row.assigned_from).slice(0,10)}`;

    const from = String(row.assigned_from||"").slice(0,10) || isoToday();
    const to = String(row.assigned_to||row.assigned_from||"").slice(0,10) || from;
    $("borrowFrom").value = from;
    $("borrowTo").value = to;

    const fromPid = String(row.project_id);
    const toSel = $("borrowToProject");
    if (toSel && toSel.options.length) {
      const firstDifferent = [...toSel.options].find(o => o.value !== fromPid) || toSel.options[0];
      toSel.value = firstDifferent ? firstDifferent.value : toSel.options[0].value;
    }

    $("borrowNote").value = "";
    $("borrowMsg").textContent = "";

    $("borrowModal").style.display = "flex";
    enforceBorrowSingleDaySelection();
    validateBorrowForm();
    refreshBorrowList().catch(()=>{});
  }

  function closeBorrowModal(){
    $("borrowModal").style.display = "none";
  }

  async function submitBorrowRequest(){
    // UI guards
    if (!validateBorrowForm()) return;
    if (!SELECTED_ASSIGNMENT_ROW) return;

    const row = SELECTED_ASSIGNMENT_ROW;
    const employee_id = Number(row.employee_id);
    const from_project_id = Number(row.project_id);
    const to_project_id = Number($("borrowToProject").value);
    const requested_from = $("borrowFrom").value;
    const requested_to = $("borrowTo").value;
    const note = String($("borrowNote").value || "").trim() || null;

    const msg = $("borrowMsg");
    msg.className = "miniHint";
    msg.textContent = "Submitting...";

    try{
      await api("/api/borrow_requests", {
        method:"POST",
        body: JSON.stringify({ employee_id, from_project_id, to_project_id, requested_from, requested_to, note })
      });
      msg.className = "miniHint okText";
      msg.textContent = "Request submitted ✅";
      const btn = $("btnBorrowSubmit");
      if (btn) btn.disabled = true;
      await refreshBorrowList().catch(()=>{});
      await refreshBorrowList();
    }catch(e){
      msg.className = "miniHint errText";
      msg.textContent = `Submit failed: ${String(e.message || e)}`;
    }
  }

  function canDecideBorrow(){
    const role = (CURRENT_USER?.role || "").toUpperCase();
    return role === "ADMIN" || role === "PM";
  }

  async function refreshBorrowList(){
    const meta = $("borrowListMeta");
    const body = $("borrowListBody");
    meta.textContent = "Loading...";
    body.innerHTML = "";

    try{
      const r = await api("/api/borrow_requests", { method:"GET" });
      const rows = r.rows || [];
      BORROW_ROWS = rows;
      meta.textContent = `${rows.length} row(s)`;

      const showActions = canDecideBorrow();

      body.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Status</th>
              <th>Employee</th>
              <th>From Project</th>
              <th>To Project</th>
              <th>From</th>
              <th>To</th>
              <th>Note</th>
              ${showActions ? "<th>Actions</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows.map(x=>{
              const status = x.status || "";
              const isPending = status === "PENDING";
              return `
                <tr>
                  <td>${esc(x.id)}</td>
                  <td>${esc(status)}</td>
                  <td>${esc(employeeLabel(x.employee_id))}</td>
                  <td>${esc(projectLabel(x.from_project_id))}</td>
                  <td>${esc(projectLabel(x.to_project_id))}</td>
                  <td>${esc(String(x.requested_from||"").slice(0,10))}</td>
                  <td>${esc(String(x.requested_to||"").slice(0,10))}</td>
                  <td>${esc(x.note||"")}</td>
                  ${showActions ? `
                    <td>
                      <button class="btn small" data-br-approve="${esc(x.id)}" ${isPending ? "" : "disabled"}>Approve</button>
                      <button class="btn small danger" data-br-reject="${esc(x.id)}" ${isPending ? "" : "disabled"}>Reject</button>
                    </td>
                  ` : ""}
                </tr>
              `;

      // Re-validate borrow form (duplicate prevention)
      validateBorrowForm();
            }).join("")}
          </tbody>
        </table>
      `;

      if (showActions) {
        body.querySelectorAll("button[data-br-approve]").forEach(b=>{
          b.addEventListener("click", async ()=>{
            const id = b.getAttribute("data-br-approve");
            b.disabled = true;
            try{
              await api(`/api/borrow_requests/${encodeURIComponent(id)}/approve`, { method:"PUT", body: JSON.stringify({ decision_note: null }) });
              await refreshBorrowList();
            }catch(e){ alert("Approve failed: " + (e.message||e)); }
            b.disabled = false;
          });
        });

        body.querySelectorAll("button[data-br-reject]").forEach(b=>{
          b.addEventListener("click", async ()=>{
            const id = b.getAttribute("data-br-reject");
            b.disabled = true;
            try{
              await api(`/api/borrow_requests/${encodeURIComponent(id)}/reject`, { method:"PUT", body: JSON.stringify({ decision_note: null }) });
              await refreshBorrowList();
            }catch(e){ alert("Reject failed: " + (e.message||e)); }
            b.disabled = false;
          });
        });
      }
    }catch(e){
      meta.textContent = "Error";
      body.innerHTML = `<div class="errText">${esc(String(e.message||e))}</div>`;
    }
  }


  function requestModifyFromRow(row){
    if (!canCreateRequests()){
      alert("Not allowed (RBAC).");
      return;
    }
    const from = String(row.assigned_from||"").slice(0,10);
    const to = String(row.assigned_to||row.assigned_from||"").slice(0,10);
    const dayDefault = from || isoToday();

    const day = prompt(`Request Modify\nEmployee: ${employeeLabel(row.employee_id)}\nFrom Project: ${projectLabel(row.project_id)}\nAssignment range: ${from} → ${to}\n\nEnter day (YYYY-MM-DD):`, dayDefault);
    if (day === null) return;
    const d = String(day||"").trim().slice(0,10);
    if (!d || (from && d < from) || (to && d > to)){
      alert("Invalid day. Choose a day within the assignment range.");
      return;
    }

    const options = (projects||[]).slice(0, 20).map(p=>`${p.id}: ${projectLabel(p.id)}`).join("\n");
    const toPid = prompt(`Enter To Project ID (must be different):\n\n${options}`, "");
    if (toPid === null) return;
    const toId = Number(String(toPid||"").trim());
    if (!Number.isFinite(toId) || !toId){
      alert("Invalid To Project ID.");
      return;
    }
    if (String(toId) === String(row.project_id)){
      alert("To Project cannot be the same as From Project.");
      return;
    }

    const note = prompt("Optional note:", `Modify request for ${d}`) ?? "";
    submitModifyRequest(row, d, toId, String(note||"").trim()).catch(e=>{
      alert("Request failed: " + (e.message||e));
    });
  }

  async function submitModifyRequest(row, day, toProjectId, note){
    // Refresh for duplicate check
    const r = await api("/api/borrow_requests", { method:"GET" });
    const rows = r.rows || [];
    BORROW_ROWS = rows;

    const emp = String(row.employee_id);
    const fp = String(row.project_id);
    const tp = String(toProjectId);

    const hasDup = rows.some(x=>{
      const st = String(x.status || "").toUpperCase();
      if (st !== "PENDING") return false;
      return String(x.employee_id) === emp
        && String(x.from_project_id) === fp
        && String(x.to_project_id) === tp
        && String(x.requested_from || "").slice(0,10) === day
        && String(x.requested_to || "").slice(0,10) === day;
    });
    if (hasDup) {
      alert("A pending request already exists for this employee/day/to-project.");
      return;
    }

    await api("/api/borrow_requests", {
      method:"POST",
      body: JSON.stringify({
        employee_id: Number(row.employee_id),
        from_project_id: Number(row.project_id),
        to_project_id: Number(toProjectId),
        requested_from: day,
        requested_to: day,
        note: note || null
      })
    });

    alert("Request submitted ✅");
    // Refresh requests list if modal is open
    try{ await refreshBorrowList(); }catch(e){}
  }

  function renderList(){
    const body = $("listBody");
    const meta = $("listMeta");
    if(!body || !meta) return;

    const rows = getListFilteredRows();
    const canCrud = canAssignmentsCrud();
    const canReq = canCreateRequests();
    const tdy = isoToday();

    meta.textContent = `${rows.length} row(s)`;

    const html = `
      <table id="assignmentsListTable">
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
          ${rows.map(r => {
            const from = String(r.assigned_from||"").slice(0,10);
            const to = String(r.assigned_to||r.assigned_from||"").slice(0,10);
            const isToday = (from === tdy || to === tdy) ? "true" : "false";
            const idAttr = esc(String(r.assignment_id ?? ""));
            return `
              <tr data-is-today="${isToday}" data-assignment-id="${idAttr}" style="${String(SELECTED_ASSIGNMENT_ID)===String(r.assignment_id) ? 'outline:2px solid #333;' : ''}">
                <td>${esc(employeeLabel(r.employee_id))}</td>
                <td>${esc(projectLabel(r.project_id))}</td>
                <td>${esc(r.assignment_role)}</td>
                <td>${esc(from)}</td>
                <td>${esc(to)}</td>
                <td>${esc((r.shift_start_time||"") + " - " + (r.shift_end_time||""))}</td>
                <td>
                  <button class="btn small" data-select-assignment="${idAttr}" ${String(SELECTED_ASSIGNMENT_ID)===String(r.assignment_id) ? 'disabled' : ''}>${String(SELECTED_ASSIGNMENT_ID)===String(r.assignment_id) ? 'Selected' : 'Select'}</button>
                  ${canCrud ? `<button class="btn small" data-edit-assignment="${idAttr}">Edit</button>` : ``}
                  ${canCrud ? `<button class="btn small danger" data-del-assignment="${idAttr}">Delete</button>` : ``}
                  ${canReq ? `<button class="btn small" data-request-modify="${idAttr}">Request Modify</button>` : ``}
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
    body.innerHTML = html;

    // NEW: explicit Select button (no more row-click confusion)
    body.querySelectorAll("button[data-select-assignment]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-select-assignment");
        const row = assignments.find(x => String(x.assignment_id) === String(id));
        if (!row) return;
        setSelectedAssignment(row);
      });
    });

    body.querySelectorAll("button[data-edit-assignment]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-edit-assignment");
        const row = assignments.find(x => String(x.assignment_id) === String(id));
        if (!row) return;
        startEditing(row);
      });
    });
    body.querySelectorAll("button[data-request-modify]").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const id = btn.getAttribute("data-request-modify");
        const row = assignments.find(x => String(x.assignment_id) === String(id));
        if (!row) return;
        requestModifyFromRow(row);
      });
    });



    body.querySelectorAll("button[data-del-assignment]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const id = btn.getAttribute("data-del-assignment");
        if(!id) return;

        const ok = confirm(`Delete assignment ${id}?`);
        if(!ok) return;

        btn.disabled = true;
        try{
          await api(`/api/assignments/${encodeURIComponent(id)}`, { method: "DELETE" });
          meta.className = "miniHint okText";
          meta.textContent = `Deleted assignment ${id}`;
          if (String(SELECTED_ASSIGNMENT_ID) === String(id)) setSelectedAssignment(null);
          await refreshListOnly();
        }catch(e){
          meta.className = "miniHint errText";
          meta.textContent = `Delete failed: ${String(e.message || e)}`;
        }finally{
          btn.disabled = false;
        }
      });
    });
  }

  async function refreshListOnly(){
    await loadAssignments();
    renderList();
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function exportAssignmentsCsv() {
    const rows = getListFilteredRows();
    const canCrud = canAssignmentsCrud();
    const canReq = canCreateRequests();
    const headers = ["Employee","Project","Role","From","To","Shift Start","Shift End"];

    const lines = [];
    lines.push(headers.map(csvEscape).join(","));

    for (const r of rows) {
      const employee = employeeLabel(r.employee_id);
      const project = projectLabel(r.project_id);
      const role = r.assignment_role ?? "";
      const from = String(r.assigned_from ?? "").slice(0,10);
      const to = String(r.assigned_to ?? r.assigned_from ?? "").slice(0,10);
      const shiftStart = r.shift_start_time ?? "";
      const shiftEnd = r.shift_end_time ?? "";
      lines.push([employee, project, role, from, to, shiftStart, shiftEnd].map(csvEscape).join(","));
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth()+1).padStart(2,"0");
    const d = String(ts.getDate()).padStart(2,"0");
    const filename = `assignments_${y}-${m}-${d}.csv`;

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function setSubView(name){
    const vCreate = $("subview-create");
    const vList = $("subview-list");
    const vGeo = $("subview-geo");

    const btnCreate = $("tabCreate");
    const btnList = $("tabList");
    const btnGeo = $("tabGeo");

    const isCreate = (name === "create");
    const isList = (name === "list");
    const isGeo = (name === "geo");

    btnCreate.classList.toggle("active", isCreate);
    btnList.classList.toggle("active", isList);
    btnGeo.classList.toggle("active", isGeo);

    vCreate.classList.toggle("hidden", !isCreate);
    vList.classList.toggle("hidden", !isList);
    vGeo.classList.toggle("hidden", !isGeo);

    if(isList) renderList();
  }

  function applyEmbedMode(){
    if (!IS_EMBEDDED) return;

    document.documentElement.classList.add("embed");
    document.body.style.padding = "0";

    const hr = $("headerRow"); if (hr) hr.style.display = "none";
    const ac = $("authCard"); if (ac) ac.style.display = "none";
    const lo = $("btnLogout"); if (lo) lo.style.display = "none";
    const top = $("moduleTopTitleRow"); if (top) top.style.display = "none";

    const mc = $("mainCard");
    if (mc) { mc.style.marginTop = "0"; mc.style.borderRadius = "0"; }
  }

  function wireEvents(){
    $("btnLogin").addEventListener("click", login);
    $("btnLogout").addEventListener("click", () => { setToken(""); location.reload(); });

    const bcu = $("btnCreateOrUpdate");
    if (bcu) bcu.addEventListener("click", ()=>{
      if (!canAssignmentsCrud()) { setCreateMsg("Not allowed (RBAC).", false); return; }
      return EDITING_ID ? updateAssignment() : createAssignment();
    });
    const bce = $("btnCancelEdit");
    if (bce) bce.addEventListener("click", stopEditing);

    $("assigned_from").addEventListener("change", async () => {
      if($("assigned_to").value < $("assigned_from").value) $("assigned_to").value = $("assigned_from").value;
      updateRangeLabels();
      if (getToken()) { await loadAssignments(); fillEmployeesDropdown(); renderEmployeesSidebar(); renderList(); }
    });

    $("assigned_to").addEventListener("change", async () => {
      updateRangeLabels();
      if (getToken()) { await loadAssignments(); fillEmployeesDropdown(); renderEmployeesSidebar(); renderList(); }
    });

    $("empSearch").addEventListener("input", () => renderEmployeesSidebar());
    $("btnClearSearch").addEventListener("click", () => { $("empSearch").value=""; renderEmployeesSidebar(); });

    $("employee_id").addEventListener("change", () => { $("createMsg").textContent=""; renderEmployeesSidebar(); });

    $("listSearch").addEventListener("input", renderList);
    $("btnListClear").addEventListener("click", () => { $("listSearch").value=""; renderList(); });
    $("btnListRefresh").addEventListener("click", async ()=>{ await refreshListOnly(); });
    $("btnListExportCsv").addEventListener("click", exportAssignmentsCsv);

    const brBtn = $("btnBorrowRequest");
    if (brBtn) brBtn.addEventListener("click", ()=>{
      if (!canCreateRequests()) { alert("Not allowed (RBAC)."); return; }
      openBorrowModal();
    });
    $("btnBorrowClose").addEventListener("click", closeBorrowModal);
    $("borrowModal").addEventListener("click", (e)=>{ if (e.target && e.target.id === "borrowModal") closeBorrowModal(); });
    $("btnBorrowSubmit").addEventListener("click", submitBorrowRequest);

    const borrowToProject = $("borrowToProject");
    const borrowFrom = $("borrowFrom");
    const borrowTo = $("borrowTo");
    if (borrowToProject) {
      borrowToProject.addEventListener("change", validateBorrowForm);
      borrowToProject.addEventListener("input", validateBorrowForm);
    }
    if (borrowFrom) {
      borrowFrom.addEventListener("change", validateBorrowForm);
      borrowFrom.addEventListener("input", validateBorrowForm);
    }
    if (borrowTo) {
      borrowTo.addEventListener("change", validateBorrowForm);
      borrowTo.addEventListener("input", validateBorrowForm);
    }

    $("tabCreate").addEventListener("click", ()=>setSubView("create"));
    $("tabList").addEventListener("click", ()=>setSubView("list"));
    $("tabGeo").addEventListener("click", ()=>setSubView("geo"));
  }

  function applyInitialViewFromQuery(){
    // Allows cleaner UI linking: assignments.html?view=list or ?view=create
    try{
      const v = (new URLSearchParams(window.location.search).get("view") || "").toLowerCase();
      if (v === "list" || v === "create") {
        setSubView(v);
        return true;
      }
    } catch(_) {}
    return false;
  }

async function boot(){
    $("assigned_from").value = tomorrowISO();
    $("assigned_to").value = tomorrowISO();

    buildTimeOptions($("shift_start_time"), STEP_MINUTES);
    buildTimeOptions($("shift_end_time"), STEP_MINUTES);
    ensureOption($("shift_end_time"), "14:30");
    $("shift_start_time").value = "06:00";
    $("shift_end_time").value = "14:30";

    updateRangeLabels();

    wireEvents();

    const ok = await whoami();
    const hasToken = !!getToken();

    if (hasToken && ok) {
      $("authMsg").className = "miniHint okText";
      $("authMsg").textContent = "Token detected (auto).";
      $("loginRow").style.display = "none";
      await refreshAll();
    } else {
      $("authMsg").className = "miniHint";
      $("authMsg").textContent = IS_EMBEDDED ? "Login is handled by the main app." : "Login required.";
      $("loginRow").style.display = IS_EMBEDDED ? "none" : "flex";
    }

    applyEmbedMode();
    const used = applyInitialViewFromQuery();
    if (!used) setSubView("create");
    setSelectedAssignment(null);
  }

  document.addEventListener("DOMContentLoaded", boot);

  window.addEventListener("storage", async () => {
    const ok = await whoami();
    if (getToken() && ok) {
      $("loginRow").style.display = "none";
      $("authMsg").className = "miniHint okText";
      $("authMsg").textContent = "Token detected (auto).";
      await refreshAll();
      applyEmbedMode();
    }
  });
})();
