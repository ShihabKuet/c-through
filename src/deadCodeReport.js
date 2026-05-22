'use strict';
const vscode = require('vscode');

class DeadCodeReport {
  constructor(context, db) {
    this._context = context;
    this._db = db;
    this._panel = null;
  }

  show() {
    if (this._panel) {
      this._panel.reveal();
      return;
    }
    this._panel = vscode.window.createWebviewPanel(
      'cThroughDeadCode',
      'C Through — Dead Code Report',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this._panel.onDidDispose(() => { this._panel = null; });
    this._panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    this._panel.webview.html = this._buildHtml();
  }

  refresh() {
    if (this._panel) {
      this._panel.webview.html = this._buildHtml();
    }
  }

  _handleMessage(msg) {
    if (msg.type === 'jumpTo') {
      const { file, line } = msg;
      if (!file) return;
      vscode.workspace.openTextDocument(file).then(doc => {
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One).then(editor => {
          const pos = new vscode.Position(Math.max(0, line - 1), 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenter
          );
        });
      });
    }
  }

  _buildHtml() {
    let report;
    try {
      report = this._db.generateDeadCodeReport();
    } catch(e) {
      report = { findings: [], scannedFiles: 0, scannedFunctions: 0, scannedGlobals: 0 };
    }
    const dataJson    = JSON.stringify(report.findings);
    const scopeText   = report.scannedFiles + ' files · ' + report.scannedFunctions + ' functions · ' + report.scannedGlobals + ' globals';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>C Through - Dead Code Report</title>
<style>
:root {
  --bg:#0d1117; --bg2:#161b22; --bg3:#21262d; --border:#30363d;
  --text:#e6edf3; --text2:#8b949e; --accent:#58a6ff;
  --green:#3fb950; --purple:#bc8cff;
  --sev-high:#f85149; --sev-med:#d29922; --sev-low:#3fb950; --sev-info:#8b949e;
}
:root.light {
  --bg:#ffffff; --bg2:#f3f3f3; --bg3:#e8e8e8; --border:#cccccc;
  --text:#1a1a1a; --text2:#666666; --accent:#0066cc;
  --green:#1a7a1a; --purple:#7b44cc;
  --sev-high:#cc2200; --sev-med:#b85c00; --sev-low:#1a7a1a; --sev-info:#666666;
}
* { box-sizing:border-box; margin:0; padding:0; }
body { background:var(--bg); color:var(--text); font-family:'Cascadia Code','Fira Code',Consolas,monospace; font-size:13px; height:100vh; display:flex; flex-direction:column; overflow:hidden; }
#header { background:var(--bg2); border-bottom:1px solid var(--border); padding:10px 16px; display:flex; align-items:center; gap:10px; flex-shrink:0; }
#header h1 { font-size:14px; color:var(--accent); }
#scan-scope { font-size:11px; color:var(--text2); background:var(--bg3); border:1px solid var(--border); border-radius:4px; padding:2px 8px; }
#toolbar { display:flex; gap:6px; margin-left:auto; align-items:center; }
button { background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-family:inherit; transition:all 0.15s; }
button:hover { background:var(--accent); color:#000; border-color:var(--accent); }
button.active { background:var(--accent); color:#000; border-color:var(--accent); }
input[type=text] { background:var(--bg3); border:1px solid var(--border); color:var(--text); padding:3px 8px; border-radius:4px; font-size:11px; font-family:inherit; outline:none; width:160px; }
#summary { background:var(--bg2); border-bottom:1px solid var(--border); padding:12px 16px; flex-shrink:0; }
#summary-title { font-size:11px; color:var(--text2); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:10px; }
.summary-grid { display:flex; gap:10px; flex-wrap:wrap; }
.summary-card { background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:8px 14px; min-width:120px; }
.summary-card .count { font-size:22px; font-weight:bold; }
.summary-card .label { font-size:11px; color:var(--text2); margin-top:2px; }
.card-high   { border-left:3px solid var(--sev-high); }
.card-med    { border-left:3px solid var(--sev-med); }
.card-low    { border-left:3px solid var(--sev-low); }
.card-info   { border-left:3px solid var(--sev-info); }
.card-total  { border-left:3px solid var(--accent); }
#tabs { background:var(--bg2); border-bottom:1px solid var(--border); padding:0 16px; display:flex; flex-shrink:0; }
.tab { padding:8px 14px; font-size:12px; cursor:pointer; border-bottom:2px solid transparent; color:var(--text2); transition:all 0.15s; user-select:none; }
.tab:hover { color:var(--text); }
.tab.active { color:var(--accent); border-bottom-color:var(--accent); }
.tab-badge { background:var(--bg3); border-radius:10px; padding:1px 6px; font-size:10px; margin-left:4px; }
#content { flex:1; overflow-y:auto; }
table { width:100%; border-collapse:collapse; }
thead th { background:var(--bg2); padding:8px 12px; font-size:11px; color:var(--text2); text-align:left; border-bottom:1px solid var(--border); position:sticky; top:0; z-index:1; font-weight:600; }
tbody tr { border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.1s; }
tbody tr:hover { background:var(--bg3); }
tbody td { padding:7px 12px; font-size:12px; vertical-align:middle; }
.sev-badge { display:inline-block; padding:1px 7px; border-radius:10px; font-size:10px; font-weight:bold; }
.sev-high { background:#f8514922; color:var(--sev-high); border:1px solid #f8514944; }
.sev-med  { background:#d2992222; color:var(--sev-med);  border:1px solid #d2992244; }
.sev-low  { background:#3fb95022; color:var(--sev-low);  border:1px solid #3fb95044; }
.sev-info { background:#8b949e22; color:var(--sev-info); border:1px solid #8b949e44; }
.conf-badge { display:inline-block; padding:1px 6px; border-radius:10px; font-size:10px; color:var(--text2); border:1px solid var(--border); }
.name-cell { color:var(--accent); font-weight:bold; }
.file-cell { color:var(--green); font-size:11px; }
.type-cell { color:var(--purple); font-size:11px; }
.reason-cell { color:var(--text2); font-size:11px; }
.empty-state { padding:48px; text-align:center; color:var(--text2); }
.empty-icon { font-size:28px; margin-bottom:12px; }
#statusbar { background:var(--bg2); border-top:1px solid var(--border); padding:4px 16px; font-size:11px; color:var(--text2); flex-shrink:0; }
</style>
</head>
<body>

<div id="header">
  <h1>&#9888; C Through &#8212; Dead Code Report</h1>
  <span id="scan-scope"></span>
  <div id="toolbar">
    <input type="text" id="filter-input" placeholder="Filter by name..." oninput="applyFilter(this.value)"/>
    <button id="btn-theme" onclick="toggleTheme()">&#9728;</button>
  </div>
</div>

<div id="summary">
  <div id="summary-title">Summary</div>
  <div class="summary-grid" id="summary-grid"></div>
</div>

<div id="tabs">
  <div class="tab active" id="tab-all"       onclick="switchTab('all')">All <span class="tab-badge" id="badge-all">0</span></div>
  <div class="tab"        id="tab-functions" onclick="switchTab('functions')">Functions <span class="tab-badge" id="badge-functions">0</span></div>
  <div class="tab"        id="tab-globals"   onclick="switchTab('globals')">Globals <span class="tab-badge" id="badge-globals">0</span></div>
  <div class="tab"        id="tab-macros"    onclick="switchTab('macros')">Macros <span class="tab-badge" id="badge-macros">0</span></div>
  <div class="tab"        id="tab-externs"   onclick="switchTab('externs')">Unresolved Externs <span class="tab-badge" id="badge-externs">0</span></div>
</div>

<div id="content"></div>
<div id="statusbar" id="sb">Click any row to jump to source</div>

<script>
var vscode      = acquireVsCodeApi();
var allFindings = ${dataJson};
var currentTab  = 'all';
var filterText  = '';

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sevColor(sev) {
  if (sev === 'high')   return 'var(--sev-high)';
  if (sev === 'medium') return 'var(--sev-med)';
  if (sev === 'low')    return 'var(--sev-low)';
  return 'var(--sev-info)';
}

// ── Summary ──────────────────────────────────────────────────────────────────
function renderSummary() {
  var counts = { total:0, functions:0, globals:0, macros:0, externs:0 };
  var sev    = { high:0, medium:0, low:0, info:0 };
  for (var i = 0; i < allFindings.length; i++) {
    var f = allFindings[i];
    counts.total++;
    if (counts[f.category] !== undefined) counts[f.category]++;
    if (sev[f.severity]    !== undefined) sev[f.severity]++;
  }
  var grid = document.getElementById('summary-grid');
  grid.innerHTML =
    makeCard(counts.total,     'Total Findings',    'card-total',  'var(--accent)') +
    makeCard(counts.functions, 'Unused Functions',  'card-high',   'var(--sev-high)') +
    makeCard(counts.globals,   'Unused Globals',    'card-med',    'var(--sev-med)') +
    makeCard(counts.macros,    'Unused Macros',     'card-low',    'var(--sev-low)') +
    makeCard(counts.externs,   'Unresolved Externs','card-info',   'var(--sev-info)') +
    makeCard(sev.high,         'High Severity',     'card-high',   'var(--sev-high)') +
    makeCard(sev.medium,       'Medium Severity',   'card-med',    'var(--sev-med)') +
    makeCard(sev.low,          'Low Severity',      'card-low',    'var(--sev-low)');
}

function makeCard(count, label, cls, color) {
  return '<div class="summary-card ' + cls + '">' +
    '<div class="count" style="color:' + color + '">' + count + '</div>' +
    '<div class="label">' + label + '</div>' +
    '</div>';
}

// ── Tab badges ────────────────────────────────────────────────────────────────
function renderBadges() {
  var counts = { all:0, functions:0, globals:0, macros:0, externs:0 };
  for (var i = 0; i < allFindings.length; i++) {
    counts.all++;
    var cat = allFindings[i].category;
    if (counts[cat] !== undefined) counts[cat]++;
  }
  var keys = ['all','functions','globals','macros','externs'];
  for (var k = 0; k < keys.length; k++) {
    var el = document.getElementById('badge-' + keys[k]);
    if (el) el.textContent = counts[keys[k]];
  }
}

// ── Table ─────────────────────────────────────────────────────────────────────
function renderTable() {
  var filtered = [];
  for (var i = 0; i < allFindings.length; i++) {
    var f = allFindings[i];
    var catOk  = (currentTab === 'all' || f.category === currentTab);
    var textOk = (!filterText ||
      (f.name && f.name.toLowerCase().indexOf(filterText) !== -1) ||
      (f.file && f.file.toLowerCase().indexOf(filterText) !== -1));
    if (catOk && textOk) filtered.push(f);
  }

  var content = document.getElementById('content');

  if (filtered.length === 0) {
    content.innerHTML =
      '<div class="empty-state">' +
      '<div class="empty-icon">&#10003;</div>' +
      '<div>' + (filterText ? 'No findings match your filter.' : 'No findings in this category.') + '</div>' +
      '</div>';
    document.getElementById('sb').textContent = '0 findings';
    return;
  }

  var html =
    '<table><thead><tr>' +
    '<th style="width:200px">Name</th>' +
    '<th style="width:90px">Severity</th>' +
    '<th style="width:90px">Confidence</th>' +
    '<th style="width:100px">Type</th>' +
    '<th style="width:160px">File</th>' +
    '<th style="width:55px">Line</th>' +
    '<th>Reason</th>' +
    '</tr></thead><tbody>';

  for (var i = 0; i < filtered.length; i++) {
    var f = filtered[i];
    var sev  = f.severity  || 'info';
    var conf = f.confidence || 'medium';
    var fileName = (f.file || '').replace(/\\\\/g, '/').split('/').pop() || '—';
    html +=
      '<tr onclick="jumpTo(' + JSON.stringify(f.file || '') + ',' + (f.line || 0) + ')">' +
      '<td><span class="name-cell">' + escHtml(f.name)     + '</span></td>' +
      '<td><span class="sev-badge sev-' + sev + '">' + sev.charAt(0).toUpperCase() + sev.slice(1) + '</span></td>' +
      '<td><span class="conf-badge">' + conf.charAt(0).toUpperCase() + conf.slice(1) + '</span></td>' +
      '<td><span class="type-cell">' + escHtml(f.type || '') + '</span></td>' +
      '<td><span class="file-cell">' + escHtml(fileName)   + '</span></td>' +
      '<td>' + (f.line || '—') + '</td>' +
      '<td class="reason-cell">' + escHtml(f.reason || '') + '</td>' +
      '</tr>';
  }

  html += '</tbody></table>';
  content.innerHTML = html;
  document.getElementById('sb').textContent =
    'Showing ' + filtered.length + ' of ' + allFindings.length + ' findings  |  Click any row to jump to source';
}

// ── Interactions ──────────────────────────────────────────────────────────────
function switchTab(tab) {
  currentTab = tab;
  var tabs = document.querySelectorAll('.tab');
  for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
  var activeTab = document.getElementById('tab-' + tab);
  if (activeTab) activeTab.classList.add('active');
  renderTable();
}

function applyFilter(val) {
  filterText = val.toLowerCase().trim();
  renderTable();
}

function jumpTo(file, line) {
  if (!file) return;
  vscode.postMessage({ type: 'jumpTo', file: file, line: line });
}

function toggleTheme() {
  var isLight = document.documentElement.classList.toggle('light');
  var btn = document.getElementById('btn-theme');
  btn.innerHTML = isLight ? '&#127769;' : '&#9728;';
  btn.classList.toggle('active', isLight);
}

// ── Boot ──────────────────────────────────────────────────────────────────────
renderSummary();
renderBadges();
renderTable();
var scopeEl = document.getElementById('scan-scope');
if (scopeEl) scopeEl.textContent = '${scopeText}';
if (${report.scannedFiles} < 2) {
  document.getElementById('sb').textContent =
    'WARNING: Only ' + ${report.scannedFiles} + ' file(s) scanned. Run Analyze Entire Workspace for accurate cross-file results.';
}
</script>
</body>
</html>`;
  }
}

module.exports = DeadCodeReport;