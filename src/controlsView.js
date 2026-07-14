'use strict';
const vscode = require('vscode');

/**
 * Webview view that renders the "Search & Filter" controls above the C Through
 * tree: a live search box and category checkboxes (Includes / Structs / Macros /
 * Globals / Functions). It drives the tree provider's filter and category state.
 */
class ControlsViewProvider {
  constructor(treeProvider) {
    this._tree = treeProvider;
    this._view = null;
  }

  static get viewType() { return 'cThroughControls'; }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._html();

    webviewView.webview.onDidReceiveMessage(msg => {
      if (!msg) return;
      switch (msg.type) {
        case 'ready':
          this._postState();
          break;
        case 'search':
          this._tree.setFilter(msg.value || '');
          break;
        case 'filter':
          this._tree.setCategoryEnabled(msg.category, msg.enabled);
          break;
        case 'clear':
          this._tree.setFilter('');
          this._postState();
          break;
      }
    });
  }

  /** Focus the search input inside the webview (best effort). */
  focusInput() {
    if (this._view) {
      this._view.show?.(true);
      this._view.webview.postMessage({ type: 'focus' });
    }
  }

  /** Push current filter text and category states to the webview. */
  _postState() {
    if (!this._view) return;
    this._view.webview.postMessage({
      type: 'state',
      filter: this._tree.getFilter(),
      categories: this._tree.getCategories()
    });
  }

  _html() {
    const cats = [
      ['includes',  'Includes'],
      ['structs',   'Structs'],
      ['macros',    'Macros'],
      ['globals',   'Globals'],
      ['functions', 'Functions']
    ];
    const checkboxes = cats.map(([key, label]) =>
      `<label class="chk"><input type="checkbox" data-cat="${key}" checked /> ${label}</label>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { padding: 6px 8px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); }
  .search-row { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
  .search-row .icon { opacity: .7; flex: 0 0 auto; }
  #search {
    flex: 1 1 auto; min-width: 0;
    padding: 3px 6px;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    outline: none;
  }
  #search:focus { border-color: var(--vscode-focusBorder); }
  #clear {
    flex: 0 0 auto; cursor: pointer; border: none; background: transparent;
    color: var(--vscode-foreground); opacity: .7; padding: 2px 4px;
  }
  #clear:hover { opacity: 1; }
  .filters-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; opacity: .7; margin: 2px 0 4px; }
  .filters { display: flex; flex-wrap: wrap; gap: 4px 12px; }
  .chk { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; white-space: nowrap; }
  .chk input { margin: 0; cursor: pointer; accent-color: var(--vscode-checkbox-selectBackground, var(--vscode-focusBorder)); }
  .toggles { display: flex; gap: 10px; margin-top: 6px; }
  .toggles a { color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; text-decoration: none; }
  .toggles a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <div class="search-row">
    <span class="icon">🔍</span>
    <input id="search" type="text" placeholder="Search name…" spellcheck="false" />
    <button id="clear" title="Clear search">✕</button>
  </div>
  <div class="filters-label">Filter</div>
  <div class="filters">${checkboxes}</div>
  <div class="toggles">
    <a id="all">Select all</a>
    <a id="none">Clear all</a>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  const search = document.getElementById('search');
  const clearBtn = document.getElementById('clear');
  const boxes = Array.from(document.querySelectorAll('input[data-cat]'));

  // Live search with a short debounce
  let t;
  search.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => vscode.postMessage({ type: 'search', value: search.value }), 150);
  });
  clearBtn.addEventListener('click', () => {
    search.value = '';
    vscode.postMessage({ type: 'clear' });
    search.focus();
  });

  boxes.forEach(b => b.addEventListener('change', () =>
    vscode.postMessage({ type: 'filter', category: b.dataset.cat, enabled: b.checked })
  ));

  document.getElementById('all').addEventListener('click', () => setAll(true));
  document.getElementById('none').addEventListener('click', () => setAll(false));
  function setAll(on) {
    boxes.forEach(b => {
      if (b.checked !== on) {
        b.checked = on;
        vscode.postMessage({ type: 'filter', category: b.dataset.cat, enabled: on });
      }
    });
  }

  // Restore state pushed by the extension
  window.addEventListener('message', e => {
    const m = e.data;
    if (m && m.type === 'state') {
      search.value = m.filter || '';
      if (m.categories) boxes.forEach(b => { b.checked = m.categories[b.dataset.cat] !== false; });
    } else if (m && m.type === 'focus') {
      search.focus();
      search.select();
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = ControlsViewProvider;
