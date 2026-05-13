# C Through

A VS Code extension that provides **Source Insight-style relational function trees** for C/C++ code. See through your entire codebase — function call hierarchies, callers, callees, global references, and cross-file relationships, all visualized interactively.

---

## Features

### 🌳 Sidebar Tree View (C Through panel)
- Full file breakdown: **Includes · Structs/Types · Macros · Globals · Functions**
- Each function shows callers, callees, return type, parameters, line number
- Click any item → jumps directly to source

### 🔍 Interactive Call Graph (WebView)
- Visual node-graph with pan (drag) and zoom (scroll)
- Color-coded: root (blue), internal (green), external (orange), recursive (red)
- Click node → jump to source · Double-click → collapse/expand subtree
- Switch between **▼ Callees** and **▲ Callers** view
- Drill into any node as a new root

### 📂 Flexible Scope — File, Directory, or Workspace
- **Analyze Current File** — single file only
- **Analyze This Directory** — right-click any folder in Explorer
- **Analyze Entire Workspace** — all C/C++ files, no file cap
- **Re-scan Last Scope** — one-click repeat of previous scan

### ⚡ Cross-file Analysis
- Full cross-file caller/callee index after any multi-file scan
- Incremental save refresh — only the saved file is re-parsed

---

## Installation

```bash
code --install-extension c-through-1.1.0.vsix
```

Or: Extensions panel (`Ctrl+Shift+X`) → `···` menu → **Install from VSIX...**

---

## Usage

| Action | How |
|---|---|
| Open a `.c` file | Tree auto-populates in sidebar |
| Scan a directory | Right-click folder → **C Through: Analyze This Directory** |
| Scan whole project | `Ctrl+Shift+P` → **C Through: Analyze Entire Workspace** |
| Visual call graph | Cursor on function name → right-click → **C Through: Show Relational Tree** |
| Show callers | Right-click → **C Through: Show Functions Calling This** |
| Show callees | Right-click → **C Through: Show Functions Called By This** |

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `cThrough.maxDepth` | `5` | Max call tree depth |
| `cThrough.showStdLib` | `false` | Show stdlib calls (printf, malloc…) |
| `cThrough.autoRefresh` | `true` | Re-parse on file save |
| `cThrough.includeGlob` | `**/*.{c,h,cpp,hpp}` | Files to include in scan |
| `cThrough.excludeGlob` | `**/node_modules/**` | Paths to exclude from scan |

**Example** — scan only `src/`, skip `build/` and `third_party/`:
```json
"cThrough.includeGlob": "src/**/*.{c,h}",
"cThrough.excludeGlob": "{**/build/**,**/third_party/**}"
```

---

## File Structure

```
c-through/
├── src/
│   ├── extension.js      — Activation, commands, auto-refresh
│   ├── parser.js         — C/C++ static parser (regex-based, no LSP)
│   ├── analysisDB.js     — Cross-file function/call index
│   ├── treeProvider.js   — VS Code sidebar TreeDataProvider
│   └── treeWebView.js    — Interactive SVG call graph panel
├── package.json
└── README.md
```
