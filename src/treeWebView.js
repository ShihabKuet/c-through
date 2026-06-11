'use strict';
const vscode = require('vscode');
const path = require('path');

class TreeWebView {
  constructor(context, db) {
    this._context = context;
    this._db = db;
    this._panel = null;
  }

  show(funcName, mode) {
    if (this._panel) {
      this._panel.reveal();
    } else {
      this._panel = vscode.window.createWebviewPanel(
        'cThrough',
        'C Through',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      this._panel.onDidDispose(() => { this._panel = null; });
      this._panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
    }

    const tree = mode === 'callers'
      ? this._db.buildCallersTree(funcName)
      : this._db.buildCallTree(funcName);

    const stats = this._db.getStats();
    this._panel.title = `Tree: ${funcName}`;

    // Convert local icon path to webview-safe URI
    const iconUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this._context.extensionUri, 'images', 'icon.png')
    );

    this._panel.webview.html = this._buildHtml(tree, funcName, mode, stats, iconUri);
  }

  _handleMessage(msg) {
    if (msg.type === 'jumpTo') {
      const { file, line } = msg;
      if (!file) return;
      vscode.workspace.openTextDocument(file).then(doc => {
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One).then(editor => {
          const pos = new vscode.Position(Math.max(0, line - 1), 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        });
      });
    }
    if (msg.type === 'showCallees') {
      this.show(msg.funcName, 'callees');
    }
    if (msg.type === 'showCallers') {
      this.show(msg.funcName, 'callers');
    }
  }

  _buildHtml(tree, rootFunc, mode, stats, iconUri) {
    const treeJson = JSON.stringify(tree);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>C Through</title>
<style>
  :root {
    --bg: #0d1117;
    --bg2: #161b22;
    --bg3: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --text2: #8b949e;
    --accent: #58a6ff;
    --green: #3fb950;
    --orange: #d29922;
    --red: #f85149;
    --purple: #bc8cff;
    --cyan: #76e3ea;
    --node-r: 28px;
    --line: #30363d;
  }
  :root.light {
    --bg: #ffffff;
    --bg2: #f3f3f3;
    --bg3: #e8e8e8;
    --border: #cccccc;
    --text: #1a1a1a;
    --text2: #666666;
    --accent: #0066cc;
    --green: #1a7a1a;
    --orange: #b85c00;
    --red: #cc2200;
    --purple: #7b44cc;
    --cyan: #007a8a;
    --node-r: 28px;
    --line: #bbbbbb;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #header {
    background: var(--bg2);
    border-bottom: 1px solid var(--border);
    padding: 10px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }
  #header h1 { font-size: 14px; color: var(--accent); }
  #header .badge {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    color: var(--text2);
  }
  .header-branding {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .header-branding img {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    object-fit: contain;
  }
  .header-branding .dev-credit {
    font-size: 10px;
    color: var(--text2);
    letter-spacing: 0.02em;
  }  
  #toolbar {
    display: flex;
    gap: 6px;
    margin-left: auto;
    flex-wrap: wrap;
  }
  .toolbar-sep {
    width: 1px;
    background: var(--border);
    align-self: stretch;
    margin: 0 2px;
  }
  button {
    background: var(--bg3);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-family: inherit;
    transition: all 0.15s;
  }
  button:hover { background: var(--accent); color: #000; border-color: var(--accent); }
  button.active { background: var(--accent); color: #000; border-color: var(--accent); }
  #main { display: flex; flex: 1; overflow: hidden; }
  #canvas-container {
    flex: 1;
    overflow: hidden;
    position: relative;
    cursor: grab;
  }
  #canvas-container.grabbing { cursor: grabbing; }
  svg#tree-svg {
    width: 100%;
    height: 100%;
  }
  #sidebar {
    width: 280px;
    background: var(--bg2);
    border-left: 1px solid var(--border);
    overflow-y: auto;
    flex-shrink: 0;
  }
  #sidebar-content { padding: 12px; }
  .sidebar-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text2);
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--border);
  }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: var(--text2); }
  .info-value { color: var(--text); font-weight: 600; }
  .info-value.func { color: var(--accent); }
  .info-value.file { color: var(--green); font-size: 11px; }
  .section { margin-bottom: 16px; }
  .call-item {
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: background 0.1s;
    font-size: 12px;
  }
  .call-item:hover { background: var(--bg3); }
  .call-item .dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .dot-callee { background: var(--orange); }
  .dot-caller { background: var(--purple); }
  .dot-std { background: var(--text2); }
  .node { cursor: pointer; }
  .node circle {
    stroke-width: 2;
    transition: r 0.15s, filter 0.15s;
  }
  .node:hover circle { filter: brightness(1.3); }
  .node text { pointer-events: none; font-size: 11px; font-family: 'Cascadia Code', monospace; }
  .link { fill: none; stroke: var(--line); stroke-width: 1.5; }
  .link.highlight { stroke: var(--accent); stroke-width: 2; }
  #zoom-controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .zoom-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    padding: 0;
  }
  #legend {
    position: absolute;
    bottom: 12px;
    left: 12px;
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 11px;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
  #statusbar {
    background: var(--bg2);
    border-top: 1px solid var(--border);
    padding: 4px 16px;
    font-size: 11px;
    color: var(--text2);
    flex-shrink: 0;
  }
</style>
</head>
<body>
<div id="header">
  <h1>⬡ C Through</h1>
  <span class="badge" id="root-label"></span>
  <span class="badge" id="mode-label"></span>
  <div id="toolbar">
    <button id="btn-callees" onclick="switchMode('callees')" title="▼ Callees">▼</button>
    <button id="btn-callers" onclick="switchMode('callers')" title="▲ Callers">▲</button>
    <div class="toolbar-sep"></div>
    <button id="btn-layout-td" onclick="setLayout('topdown')" class="active" title="Top→Down: Tree grows top to bottom">⬇</button>
    <button id="btn-layout-lr" onclick="setLayout('leftright')" title="Left→Right: Tree grows left to right">➡</button>
    <div class="toolbar-sep"></div>
    <button id="btn-theme" onclick="toggleTheme()" title="Mode: Toggle light/dark mode">☀</button>
    <div class="toolbar-sep"></div>
    <button onclick="resetView()" title="Reset View">⟳</button>
    <button onclick="expandAll()" title="Expand All">➕</button>
    <button onclick="collapseAll()" title="Collapse All">➖</button>
    <button id="btn-sidebar" onclick="toggleSidebar()" title="Expand/Collapse Sidebar">☰</button>
    <div class="toolbar-sep"></div>
    <input id="search-input" type="text" placeholder="Search nodes…" oninput="onSearch(this.value)" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:3px 8px;border-radius:4px;font-size:11px;font-family:inherit;width:130px;outline:none;" title="Search and highlight matching nodes"/>
    <button onclick="clearSearch()" title="Clear search">✕</button>
  </div>
  <div class="header-branding">
    <img src="${iconUri}" alt="C Through" title="C Through"/>
    <span class="dev-credit">Developed by SHANJID</span>
  </div>
</div>
<div id="main">
  <div id="canvas-container">
    <svg id="tree-svg"></svg>
    <div id="zoom-controls">
      <button class="zoom-btn" onclick="zoomIn()">+</button>
      <button class="zoom-btn" onclick="zoomOut()">−</button>
      <button class="zoom-btn" onclick="resetView()" title="Fit">⊡</button>
    </div>
    <div id="legend">
      <div class="legend-item"><div class="legend-dot" style="background:#58a6ff"></div>Root</div>
      <div class="legend-item"><div class="legend-dot" style="background:#3fb950"></div>Internal</div>
      <div class="legend-item"><div class="legend-dot" style="background:#d29922"></div>External / Unknown</div>
      <div class="legend-item"><div class="legend-dot" style="background:#8b949e"></div>Stdlib</div>
      <div class="legend-item"><div class="legend-dot" style="background:#f85149"></div>Recursive</div>
    </div>
  </div>
  <div id="sidebar">
    <div id="sidebar-content">
      <div class="section">
        <div class="sidebar-title">Selected Function</div>
        <div id="fn-details"><div style="color:var(--text2);font-size:12px">Click a node to inspect it</div></div>
      </div>
      <div class="section">
        <div class="sidebar-title">Workspace Stats</div>
        <div id="stats-panel"></div>
      </div>
    </div>
  </div>
</div>
<div id="statusbar" id="statusbar">Ready · Click nodes to navigate · Drag to pan · Scroll to zoom</div>

<script>
const vscode = acquireVsCodeApi();
const rawTree = ${treeJson};
const rootFunc = ${JSON.stringify(rootFunc)};
let currentMode = ${JSON.stringify(mode)};
let layoutDir = 'topdown'; // 'topdown' | 'leftright'
let transform = { x: 0, y: 0, scale: 1 };
let isDragging = false, dragStart = { x: 0, y: 0 };
let didDrag = false;
let searchTerm = '';

// ─── Collapse state ───────────────────────────────────────────────────────────
// Key: stable string = "depth:parentName:name"
// true  = node is collapsed (children hidden)
// false / absent = node is expanded
const collapseState = new Map();

// rawChildCount: number of direct children in the ORIGINAL tree, by key.
// Kept so collapsed nodes can show "+N" even when children aren't in allNodes.
const rawChildCount = new Map();

const stats = ${JSON.stringify(stats)};

document.getElementById('root-label').textContent = rootFunc;
document.getElementById('mode-label').textContent = currentMode === 'callers' ? '▲ Callers' : '▼ Callees';
document.getElementById('btn-' + currentMode).classList.add('active');

const statsEl = document.getElementById('stats-panel');
statsEl.innerHTML = [
  ['Files', stats.files], ['Functions', stats.functions],
  ['Calls', stats.calls], ['Structs', stats.structs]
].map(([k,v]) => \`<div class="info-row"><span class="info-label">\${k}</span><span class="info-value">\${v}</span></div>\`).join('');

const savedState = vscode.getState() || {};
if (savedState.theme === 'light') {
  document.documentElement.classList.add('light');
  document.getElementById('btn-theme').textContent = '🌙';
  document.getElementById('btn-theme').classList.add('active');
}

function switchMode(m) {
  vscode.postMessage({ type: m === 'callers' ? 'showCallers' : 'showCallees', funcName: rootFunc });
}

// ─── Layout direction toggle ──────────────────────────────────────────────────
function setLayout(dir) {
  layoutDir = dir;
  document.getElementById('btn-layout-td').classList.toggle('active', dir === 'topdown');
  document.getElementById('btn-layout-lr').classList.toggle('active', dir === 'leftright');
  render();
  fitView();
}

function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  const btn = document.getElementById('btn-theme');
  btn.textContent = isLight ? '🌙' : '☀';
  btn.classList.toggle('active', isLight);

  // ← Save to webview state
  vscode.setState({ ...(vscode.getState() || {}), theme: isLight ? 'light' : 'dark' });  

  render(); // re-render nodes with updated colors
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('btn-sidebar');
  const isHidden = sidebar.style.display === 'none';
  sidebar.style.display = isHidden ? 'block' : 'none';
  btn.classList.toggle('active', isHidden);
  vscode.setState({ ...(vscode.getState() || {}), sidebar: isHidden ? 'open' : 'closed' });
}

function onSearch(val) {
  searchTerm = val.toLowerCase().trim();
  vscode.setState({ ...(vscode.getState() || {}), search: val });
  render();
}

function clearSearch() {
  searchTerm = '';
  document.getElementById('search-input').value = '';
  render();
}

if (savedState.sidebar === 'closed') {
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('btn-sidebar').classList.remove('active');
}

// ─── Stable node key ──────────────────────────────────────────────────────────
function nodeKey(name, depth, parentName) {
  return depth + ':' + (parentName || '') + ':' + name;
}

// ─── Pre-scan raw tree once to fill rawChildCount ─────────────────────────────
function prescan(node, depth, parentName) {
  const key = nodeKey(node.name, depth, parentName);
  rawChildCount.set(key, node.children ? node.children.length : 0);
  if (node.children) {
    for (const child of node.children) prescan(child, depth + 1, node.name);
  }
}
prescan(rawTree, 0, null);

// ─── Flatten tree ─────────────────────────────────────────────────────────────
// Respects collapseState per node key independently.
let allNodes = [], allLinks = [];

function flattenTree(node, parent, depth, parentName, counter) {
  const key = nodeKey(node.name, depth, parentName);
  const id  = counter.v++;
  const n   = {
    id, key,
    name: node.name, file: node.file, line: node.line, depth,
    returnType: node.returnType, params: node.params,
    truncated: node.truncated, external: node.external,
    parentId: parent ? parent.id : null,
    children: [],
    rawChildCount: rawChildCount.get(key) || 0
  };
  allNodes.push(n);
  if (parent) allLinks.push({ source: parent.id, target: n.id });

  // Only descend if THIS node is not collapsed
  const collapsed = collapseState.get(key) === true;
  if (!collapsed && node.children && node.children.length) {
    for (const child of node.children) {
      n.children.push(flattenTree(child, n, depth + 1, node.name, counter));
    }
  }
  return n;
}

function computeLayout() {
  allNodes = []; allLinks = [];
  flattenTree(rawTree, null, 0, null, { v: 0 });

  if (layoutDir === 'topdown') {
    // ── Top → Down ────────────────────────────────────────────────────────────
    const nodeW = 180, nodeH = 72;
    let leafX = 0;
    function assignX(node) {
      if (node.children.length === 0) { node.x = leafX; leafX += nodeW; return; }
      for (const c of node.children) assignX(c);
      node.x = (node.children[0].x + node.children[node.children.length - 1].x) / 2;
    }
    assignX(allNodes[0]);
    for (const n of allNodes) n.y = n.depth * nodeH + 50;
  } else {
    // ── Left → Right ──────────────────────────────────────────────────────────
    const nodeW = 210, nodeH = 68;
    let leafY = 0;
    function assignY(node) {
      if (node.children.length === 0) { node.y = leafY; leafY += nodeH; return; }
      for (const c of node.children) assignY(c);
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
    }
    assignY(allNodes[0]);
    for (const n of allNodes) n.x = n.depth * nodeW + 50;
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
const svg = document.getElementById('tree-svg');
let g;

function render() {
  computeLayout();
  svg.innerHTML = '';

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = \`
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#30363d"/>
    </marker>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>\`;
  svg.appendChild(defs);

  g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('id', 'main-g');
  svg.appendChild(g);

  // Links
  for (const lnk of allLinks) {
    const s = allNodes.find(n => n.id === lnk.source);
    const t = allNodes.find(n => n.id === lnk.target);
    if (!s || !t) continue;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d;
    if (layoutDir === 'topdown') {
      const my = (s.y + t.y) / 2;
      d = \`M\${s.x},\${s.y+22} C\${s.x},\${my} \${t.x},\${my} \${t.x},\${t.y-22}\`;
    } else {
      const mx = (s.x + t.x) / 2;
      d = \`M\${s.x+22},\${s.y} C\${mx},\${s.y} \${mx},\${t.y} \${t.x-22},\${t.y}\`;
    }
    el.setAttribute('d', d);
    el.setAttribute('class', 'link');
    el.setAttribute('marker-end', 'url(#arrow)');
    g.appendChild(el);
  }

  // Nodes
  for (const n of allNodes) {
    const isDark = !document.documentElement.classList.contains('light');
    const color = n.id === 0
      ? (isDark ? '#58a6ff' : '#0066cc')
      : n.truncated
        ? (isDark ? '#f85149' : '#cc2200')
        : n.external
          ? (isDark ? '#d29922' : '#b85c00')
          : (isDark ? '#3fb950' : '#1a7a1a');
    const isCollapsed = collapseState.get(n.key) === true;

    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grp.setAttribute('class', 'node');
    grp.setAttribute('transform', \`translate(\${n.x},\${n.y})\`);

    // Circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '20');
    circle.setAttribute('fill', color + '22');
    circle.setAttribute('stroke', color);
    if (n.id === 0) circle.setAttribute('filter', 'url(#glow)');
    grp.appendChild(circle);

    // Initial letter
    const letter = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    letter.setAttribute('text-anchor', 'middle');
    letter.setAttribute('dominant-baseline', 'central');
    letter.setAttribute('fill', color);
    letter.setAttribute('font-size', '12');
    letter.setAttribute('font-weight', 'bold');
    letter.textContent = n.name[0].toUpperCase();
    grp.appendChild(letter);

    // Name label — below circle for TopDown, right of circle for LeftRight
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    if (layoutDir === 'topdown') {
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('x', '0');
      label.setAttribute('y', '32');
    } else {
      label.setAttribute('text-anchor', 'start');
      label.setAttribute('x', '24');
      label.setAttribute('y', '4');
    }
    label.setAttribute('fill', isDark ? '#e6edf3' : '#1a1a1a');
    label.setAttribute('font-size', '11');
    label.textContent = n.name.length > 18 ? n.name.slice(0, 18) + '…' : n.name;
    grp.appendChild(label);

    // ROOT label — above circle for TopDown, left of circle for LeftRight
    if (n.depth === 0) {
      const rootLbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      rootLbl.setAttribute('fill', isDark ? '#8b949e' : '#666666');
      rootLbl.setAttribute('font-size', '9');
      rootLbl.textContent = 'ROOT';
      if (layoutDir === 'topdown') {
        rootLbl.setAttribute('text-anchor', 'middle');
        rootLbl.setAttribute('x', '0');
        rootLbl.setAttribute('y', '-30');
      } else {
        rootLbl.setAttribute('text-anchor', 'end');
        rootLbl.setAttribute('x', '-24');
        rootLbl.setAttribute('y', '4');
      }
      grp.appendChild(rootLbl);
    }

    // Badge — shown whenever this node has children (collapsed or expanded).
    // Filled background when collapsed so it's visually obvious.
    // Click on badge = toggle THIS node only.
    if (n.rawChildCount > 0) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      badge.setAttribute('transform', 'translate(14,-14)');
      badge.style.cursor = 'pointer';

      const br = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      br.setAttribute('r', '9');
      br.setAttribute('fill', isCollapsed ? color : '#21262d');
      br.setAttribute('stroke', color);
      badge.appendChild(br);

      const bt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      bt.setAttribute('text-anchor', 'middle');
      bt.setAttribute('dominant-baseline', 'central');
      bt.setAttribute('fill', isCollapsed ? '#000' : color);
      bt.setAttribute('font-size', '8');
      bt.setAttribute('font-weight', 'bold');
      // Collapsed: show "+N" (how many hidden children). Expanded: show current child count.
      bt.textContent = isCollapsed ? ('+' + n.rawChildCount) : n.children.length;
      badge.appendChild(bt);

      // Badge click: toggle only this node's children
      badge.addEventListener('click', e => { e.stopPropagation(); toggleNode(n.key); });
      grp.appendChild(badge);
    }

    // Single-click: select node + jump to source
    grp.addEventListener('click', e => {
      if (didDrag) return;
      e.stopPropagation();
      onNodeClick(n);
    });

    // Double-click: toggle only THIS node's direct children (not whole subtree)
    grp.addEventListener('dblclick', e => {
      e.stopPropagation();
      toggleNode(n.key);
    });

    // Search highlight / dim
    if (searchTerm) {
      const matches = n.name.toLowerCase().includes(searchTerm);
      grp.style.opacity = matches ? '1' : '0.2';
      if (matches) {
        circle.setAttribute('stroke-width', '3');
        circle.setAttribute('filter', 'url(#glow)');
      }
    } else {
      grp.style.opacity = '1';
    }

    g.appendChild(grp);
  }

  applyTransform();
}

// ─── Toggle a single node ─────────────────────────────────────────────────────
// ONLY flips the collapse state of the node with this key.
// Siblings, children of children — all unaffected.
function toggleNode(key) {
  collapseState.set(key, !(collapseState.get(key) === true));
  render();
  // Intentionally do NOT call fitView() — user keeps their current pan/zoom position.
}

// ─── Expand All ───────────────────────────────────────────────────────────────
// Clears every collapse flag so the full tree is visible.
function expandAll() {
  collapseState.clear();
  render();
  fitView();
}

// ─── Collapse All ─────────────────────────────────────────────────────────────
// Marks every node that has children as collapsed.
// Each node is still independently toggleable afterward.
function collapseAll() {
  function markAll(node, depth, parentName) {
    const key = nodeKey(node.name, depth, parentName);
    if (node.children && node.children.length > 0) {
      collapseState.set(key, true);
      for (const child of node.children) markAll(child, depth + 1, node.name);
    }
  }
  markAll(rawTree, 0, null);
  render();
  fitView();
}

// ─── Node click ───────────────────────────────────────────────────────────────
function onNodeClick(n) {
  document.querySelectorAll('.node circle').forEach(c => c.style.strokeWidth = '2');
  const detailEl = document.getElementById('fn-details');
  detailEl.innerHTML =
    \`<div class="info-row"><span class="info-label">Name</span><span class="info-value func">\${n.name}</span></div>\` +
    (n.file ? \`<div class="info-row"><span class="info-label">File</span><span class="info-value file">\${n.file.split(/[\\/]/).pop()}</span></div>\` : '') +
    (n.line ? \`<div class="info-row"><span class="info-label">Line</span><span class="info-value">\${n.line}</span></div>\` : '') +
    (n.returnType ? \`<div class="info-row"><span class="info-label">Returns</span><span class="info-value">\${n.returnType}</span></div>\` : '') +
    \`<div class="info-row"><span class="info-label">Depth</span><span class="info-value">\${n.depth}</span></div>\` +
    \`<div class="info-row"><span class="info-label">Children</span><span class="info-value">\${n.rawChildCount}</span></div>\` +
    \`<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">\` +
    (n.file && n.line ? \`<button onclick="jumpTo('\${n.file}',\${n.line})" style="font-size:11px">Go to Source</button>\` : '') +
    \`<button onclick="drillCallees('\${n.name}')" style="font-size:11px">▼ Callees</button>\` +
    \`<button onclick="drillCallers('\${n.name}')" style="font-size:11px">▲ Callers</button>\` +
    \`</div>\`;
  document.getElementById('statusbar').textContent =
    n.name + ' · ' + (n.file ? n.file.split(/[\\/]/).pop() : 'external') +
    ' · Double-click node or click +badge to expand/collapse that node only';
  if (n.file && n.line) vscode.postMessage({ type: 'jumpTo', file: n.file, line: n.line });
}

function jumpTo(file, line) { vscode.postMessage({ type: 'jumpTo', file, line }); }
function drillCallees(name) { vscode.postMessage({ type: 'showCallees', funcName: name }); }
function drillCallers(name) { vscode.postMessage({ type: 'showCallers', funcName: name }); }

// ─── Pan & Zoom ───────────────────────────────────────────────────────────────
function applyTransform() {
  if (!g) return;
  g.setAttribute('transform', \`translate(\${transform.x},\${transform.y}) scale(\${transform.scale})\`);
}
function fitView() {
  if (!allNodes.length) return;
  const xs = allNodes.map(n => n.x), ys = allNodes.map(n => n.y);
  const minX = Math.min(...xs) - 40, maxX = Math.max(...xs) + 40;
  const minY = Math.min(...ys) - 40, maxY = Math.max(...ys) + 80;
  const svgW = svg.clientWidth || 800, svgH = svg.clientHeight || 600;
  const scaleX = svgW / (maxX - minX), scaleY = svgH / (maxY - minY);
  transform.scale = Math.min(scaleX, scaleY, 2);
  transform.x = (svgW - (maxX + minX) * transform.scale) / 2;
  transform.y = (svgH - (maxY + minY) * transform.scale) / 2;
  applyTransform();
}
function resetView() { fitView(); }
function zoomIn()  { transform.scale = Math.min(transform.scale * 1.2, 4);   applyTransform(); }
function zoomOut() { transform.scale = Math.max(transform.scale / 1.2, 0.2); applyTransform(); }

const cc = document.getElementById('canvas-container');
cc.addEventListener('mousedown', e => {
  isDragging = true; didDrag = false;
  dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  cc.classList.add('grabbing');
});
cc.addEventListener('mousemove', e => {
  if (!isDragging) return;
  didDrag = true;
  transform.x = e.clientX - dragStart.x;
  transform.y = e.clientY - dragStart.y;
  applyTransform();
});
cc.addEventListener('mouseup', () => { isDragging = false; cc.classList.remove('grabbing'); });
cc.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  const rect = cc.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  transform.x = mx - (mx - transform.x) * factor;
  transform.y = my - (my - transform.y) * factor;
  transform.scale *= factor;
  applyTransform();
}, { passive: false });

render();
fitView();
window.addEventListener('resize', fitView);

// Restore search input if webview was re-created
const savedSearch = (vscode.getState() || {}).search || '';
if (savedSearch) {
  document.getElementById('search-input').value = savedSearch;
  searchTerm = savedSearch.toLowerCase().trim();
  render();
}
</script>
</body>
</html>`;
  }
}

module.exports = TreeWebView;
