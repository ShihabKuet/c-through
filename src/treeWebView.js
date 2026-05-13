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
    this._panel.webview.html = this._buildHtml(tree, funcName, mode, stats);
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

  _buildHtml(tree, rootFunc, mode, stats) {
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
  #toolbar {
    display: flex;
    gap: 6px;
    margin-left: auto;
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
    <button id="btn-callees" onclick="switchMode('callees')">▼ Callees</button>
    <button id="btn-callers" onclick="switchMode('callers')">▲ Callers</button>
    <button onclick="resetView()">⟳ Reset View</button>
    <button onclick="expandAll()">Expand All</button>
    <button onclick="collapseAll()">Collapse All</button>
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
let allNodes = [], allLinks = [];
let transform = { x: 0, y: 0, scale: 1 };
let isDragging = false, dragStart = { x: 0, y: 0 };
let collapsedNodes = new Set();

const stats = ${JSON.stringify(stats)};

document.getElementById('root-label').textContent = rootFunc;
document.getElementById('mode-label').textContent = currentMode === 'callers' ? '▲ Callers' : '▼ Callees';
document.getElementById('btn-' + currentMode).classList.add('active');

// Stats panel
const statsEl = document.getElementById('stats-panel');
statsEl.innerHTML = [
  ['Files', stats.files],
  ['Functions', stats.functions],
  ['Calls', stats.calls],
  ['Structs', stats.structs]
].map(([k,v]) => \`<div class="info-row"><span class="info-label">\${k}</span><span class="info-value">\${v}</span></div>\`).join('');

function switchMode(mode) {
  vscode.postMessage({ type: mode === 'callers' ? 'showCallers' : 'showCallees', funcName: rootFunc });
}

// ─── Layout ──────────────────────────────────────────────────────────────────
function flattenTree(node, parent = null, depth = 0, x = 0, counter = { v: 0 }) {
  const id = counter.v++;
  const n = { id, name: node.name, file: node.file, line: node.line, depth,
    returnType: node.returnType, params: node.params,
    truncated: node.truncated, external: node.external,
    parentId: parent ? parent.id : null, children: [] };
  allNodes.push(n);
  if (parent) allLinks.push({ source: parent.id, target: n.id });
  if (node.children && node.children.length && !collapsedNodes.has(id)) {
    for (const child of node.children) {
      n.children.push(flattenTree(child, n, depth + 1, 0, counter));
    }
  }
  return n;
}

function computeLayout() {
  allNodes = []; allLinks = [];
  const root = flattenTree(rawTree);

  // Assign y based on depth, x based on subtree
  const nodesByDepth = {};
  for (const n of allNodes) {
    if (!nodesByDepth[n.depth]) nodesByDepth[n.depth] = [];
    nodesByDepth[n.depth].push(n);
  }

  const nodeH = 72, nodeW = 180;
  // Bottom-up x assignment
  function assignX(node) {
    if (node.children.length === 0) return;
    for (const c of node.children) assignX(c);
    node.x = (node.children[0].x + node.children[node.children.length-1].x) / 2;
  }

  // Assign leaf x positions
  let leafX = 0;
  function assignLeafX(node) {
    if (node.children.length === 0) { node.x = leafX; leafX += nodeW; return; }
    for (const c of node.children) assignLeafX(c);
    node.x = (node.children[0].x + node.children[node.children.length-1].x) / 2;
  }
  assignLeafX(allNodes[0]);

  for (const n of allNodes) n.y = n.depth * nodeH + 50;

  return allNodes[0];
}

// ─── Render ───────────────────────────────────────────────────────────────
const svg = document.getElementById('tree-svg');
let g; // main group for pan/zoom

function render() {
  svg.innerHTML = '';
  const root = computeLayout();

  // Defs
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  defs.innerHTML = \`
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#30363d"/>
    </marker>
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  \`;
  svg.appendChild(defs);

  g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id','main-g');
  svg.appendChild(g);

  // Links
  for (const link of allLinks) {
    const s = allNodes.find(n => n.id === link.source);
    const t = allNodes.find(n => n.id === link.target);
    if (!s || !t) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
    path.setAttribute('d', \`M\${s.x},\${s.y+22} C\${s.x},\${my} \${t.x},\${my} \${t.x},\${t.y-22}\`);
    path.setAttribute('class','link');
    path.setAttribute('marker-end','url(#arrow)');
    g.appendChild(path);
  }

  // Nodes
  for (const n of allNodes) {
    const grp = document.createElementNS('http://www.w3.org/2000/svg','g');
    grp.setAttribute('class','node');
    grp.setAttribute('transform',\`translate(\${n.x},\${n.y})\`);

    const color = n.id === 0 ? '#58a6ff' :
      n.truncated ? '#f85149' :
      n.external ? '#d29922' :
      '#3fb950';

    const circle = document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('r','20');
    circle.setAttribute('fill', color + '22');
    circle.setAttribute('stroke', color);
    if (n.id === 0) circle.setAttribute('filter','url(#glow)');
    grp.appendChild(circle);

    // Icon letter
    const letter = document.createElementNS('http://www.w3.org/2000/svg','text');
    letter.setAttribute('text-anchor','middle');
    letter.setAttribute('dominant-baseline','central');
    letter.setAttribute('fill', color);
    letter.setAttribute('font-size','12');
    letter.setAttribute('font-weight','bold');
    letter.textContent = n.name[0].toUpperCase();
    grp.appendChild(letter);

    // Label
    const label = document.createElementNS('http://www.w3.org/2000/svg','text');
    label.setAttribute('text-anchor','middle');
    label.setAttribute('y','32');
    label.setAttribute('fill','#e6edf3');
    label.setAttribute('font-size','11');
    const maxLen = 18;
    label.textContent = n.name.length > maxLen ? n.name.slice(0,maxLen)+'…' : n.name;
    grp.appendChild(label);

    // Child count badge
    if (n.children.length > 0 || collapsedNodes.has(n.id)) {
      const badge = document.createElementNS('http://www.w3.org/2000/svg','g');
      badge.setAttribute('transform','translate(14,-14)');
      const br = document.createElementNS('http://www.w3.org/2000/svg','circle');
      br.setAttribute('r','8'); br.setAttribute('fill','#21262d'); br.setAttribute('stroke',color);
      badge.appendChild(br);
      const bt = document.createElementNS('http://www.w3.org/2000/svg','text');
      bt.setAttribute('text-anchor','middle'); bt.setAttribute('dominant-baseline','central');
      bt.setAttribute('fill',color); bt.setAttribute('font-size','8');
      bt.textContent = collapsedNodes.has(n.id) ? '+' : n.children.length;
      badge.appendChild(bt);
      grp.appendChild(badge);
    }

    // Depth indicator line
    const depthLine = document.createElementNS('http://www.w3.org/2000/svg','text');
    depthLine.setAttribute('text-anchor','middle');
    depthLine.setAttribute('y','-30');
    depthLine.setAttribute('fill','#8b949e');
    depthLine.setAttribute('font-size','9');
    if (n.depth === 0) depthLine.textContent = 'ROOT';
    grp.appendChild(depthLine);

    grp.addEventListener('click', (e) => {
      e.stopPropagation();
      onNodeClick(n);
    });
    grp.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleCollapse(n.id);
    });

    g.appendChild(grp);
  }

  applyTransform();
  fitView();
}

function onNodeClick(n) {
  // Highlight
  document.querySelectorAll('.node circle').forEach(c => c.style.strokeWidth = '2');
  const nodes = document.querySelectorAll('.node');
  // Update sidebar
  const detailEl = document.getElementById('fn-details');
  detailEl.innerHTML = \`
    <div class="info-row"><span class="info-label">Name</span><span class="info-value func">\${n.name}</span></div>
    \${n.file ? \`<div class="info-row"><span class="info-label">File</span><span class="info-value file">\${n.file.split(/[\\\\/]/).pop()}</span></div>\` : ''}
    \${n.line ? \`<div class="info-row"><span class="info-label">Line</span><span class="info-value">\${n.line}</span></div>\` : ''}
    \${n.returnType ? \`<div class="info-row"><span class="info-label">Returns</span><span class="info-value">\${n.returnType}</span></div>\` : ''}
    <div class="info-row"><span class="info-label">Depth</span><span class="info-value">\${n.depth}</span></div>
    <div class="info-row"><span class="info-label">Children</span><span class="info-value">\${n.children.length}</span></div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      \${n.file && n.line ? \`<button onclick="jumpTo('\${n.file}', \${n.line})" style="font-size:11px">Go to Source</button>\` : ''}
      <button onclick="drillCallees('\${n.name}')" style="font-size:11px">▼ Callees</button>
      <button onclick="drillCallers('\${n.name}')" style="font-size:11px">▲ Callers</button>
    </div>
  \`;
  document.getElementById('statusbar').textContent =
    \`\${n.name} · \${n.file ? n.file.split(/[\\\\/]/).pop() : 'external'} · Double-click to collapse/expand subtree\`;
  if (n.file && n.line) vscode.postMessage({ type: 'jumpTo', file: n.file, line: n.line });
}

function jumpTo(file, line) {
  vscode.postMessage({ type: 'jumpTo', file, line });
}
function drillCallees(name) {
  vscode.postMessage({ type: 'showCallees', funcName: name });
}
function drillCallers(name) {
  vscode.postMessage({ type: 'showCallers', funcName: name });
}
function toggleCollapse(id) {
  if (collapsedNodes.has(id)) collapsedNodes.delete(id);
  else collapsedNodes.add(id);
  render();
}
function expandAll() { collapsedNodes.clear(); render(); }
function collapseAll() {
  for (const n of allNodes) if (n.children.length) collapsedNodes.add(n.id);
  render();
}

// ─── Pan & Zoom ───────────────────────────────────────────────────────────
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
function zoomIn() { transform.scale = Math.min(transform.scale * 1.2, 4); applyTransform(); }
function zoomOut() { transform.scale = Math.max(transform.scale / 1.2, 0.2); applyTransform(); }

const cc = document.getElementById('canvas-container');
cc.addEventListener('mousedown', e => {
  isDragging = true;
  dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
  cc.classList.add('grabbing');
});
cc.addEventListener('mousemove', e => {
  if (!isDragging) return;
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
window.addEventListener('resize', fitView);
</script>
</body>
</html>`;
  }
}

module.exports = TreeWebView;
