# C Through

> **See through your C/C++ codebase.** Source Insight-style relational function trees, call graphs, CodeLens inline metrics, and cross-file reference analysis — all inside VS Code.
> 
> Current Version: **1.3.0**

---

## Features

### 🌳 Sidebar Tree View
A live, structured breakdown of every C/C++ file — organized into collapsible sections:

- **Includes** — all `#include` dependencies with system vs local distinction
- **Structs / Types** — every `struct` and `typedef` with field listings
- **Macros** — function-like and value macros with their expansions
- **Global Variables** — file-scope variable declarations
- **Functions** — every function with its callers, callees, return type, and line number

Click any item to jump directly to its definition in the source file.

---

### 🔍 Interactive Call Graph
A fully interactive visual graph of function call relationships.

- **Pan** — click and drag the canvas
- **Zoom** — scroll wheel or +/− buttons
- **Click node** — jump to source + inspect details in sidebar
- **Double-click node** — collapse or expand that node's children independently
- **Click +N badge** — toggle a single node without affecting siblings
- **⬇ Top→Down / ➡ Left→Right** — toggle layout direction
- **Drill down** — re-root the tree on any node

**Node colors:**

| Color | Meaning |
|---|---|
| 🔵 Blue | Root function (current focus) |
| 🟢 Green | Internal project function |
| 🟠 Orange | External / unknown function |
| 🔴 Red | Recursive call detected |

---

### 💡 CodeLens Inline Metrics
Clickable annotations appear directly above every function definition — no panel switching required.

```c
  ↑ 4 callers  ↓ 7 calls  🟡 complexity: 11  📄 main.c, driver.c
  int process_packet(PacketHeader *hdr, uint8_t *buf, int len) {
```

| Lens | Click Action |
|---|---|
| `↑ N callers` | Open callers tree |
| `↓ N calls` | Open callees tree |
| `🟢/🟡/🔴 complexity: N` | Open relational tree |
| `📄 file1.c, file2.c` | Open callers tree (cross-file) |
| `⚠ dead code — no callers found` | Trigger workspace scan |

**Complexity thresholds:**
- 🟢 1–9 — Simple, easy to test
- 🟡 10–19 — High, consider refactoring
- 🔴 20+ — Very high, hard to maintain

---

### 📂 Flexible Scan Scope

| Scope | How |
|---|---|
| Single file | Auto-analyzed on open |
| Specific directory | Right-click any folder → **C Through: Analyze This Directory** |
| Entire workspace | **C Through: Analyze Entire Workspace** |
| Re-scan | **Re-scan Last Scope** button in sidebar toolbar |

Cross-file caller/callee relationships are fully resolved after any multi-file scan.

---

## Installation

### From VS Code Marketplace
1. Press `Ctrl+Shift+X`
2. Search **"C Through"**
3. Click **Install**

### From VSIX
```bash
code --install-extension c-through-1.3.0.vsix
```

---

## Usage

### Quick Start
1. Open any `.c` or `.h` file — auto-analyzed, **C Through** panel appears in Explorer sidebar
2. Place cursor on any function name → right-click → **C Through: Show Relational Tree**

### Commands (`Ctrl+Shift+P`)

| Command | Description |
|---|---|
| `C Through: Analyze Current File` | Parse the active C/C++ file |
| `C Through: Analyze Entire Workspace` | Scan all C/C++ files in workspace |
| `C Through: Analyze This Directory` | Pick a folder to scan |
| `C Through: Re-scan Last Scope` | Repeat the previous scan |
| `C Through: Show Relational Tree` | Open call graph for symbol at cursor |
| `C Through: Show Functions Called By This` | Open callees tree |
| `C Through: Show Functions Calling This` | Open callers tree |
| `C Through: Toggle CodeLens` | Show/hide inline CodeLens |

### Context Menus
- **Editor** — right-click inside any C/C++ file for tree commands
- **Explorer** — right-click any folder for **Analyze This Directory**

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `cThrough.maxDepth` | `5` | Maximum call tree traversal depth |
| `cThrough.showStdLib` | `false` | Include stdlib calls in tree |
| `cThrough.autoRefresh` | `true` | Re-parse file on save |
| `cThrough.enableCodeLens` | `true` | Show inline CodeLens |
| `cThrough.includeGlob` | `**/*.{c,h,cpp,hpp}` | File pattern for scan |
| `cThrough.excludeGlob` | `**/node_modules/**` | Paths to exclude from scan |

**Example — scan only `src/`, skip `build/` and `vendor/`:**
```json
{
  "cThrough.includeGlob": "src/**/*.{c,h}",
  "cThrough.excludeGlob": "{**/build/**,**/vendor/**,**/third_party/**}"
}
```

---

## How It Works

C Through uses **regex-based static analysis** — no compiler, no language server, no build system required. Works on any C/C++ file that can be opened in VS Code.

The parser:
1. Strips comments and string literals
2. Extracts `#include`, `#define`, `struct`/`typedef` definitions
3. Identifies function definitions by signature pattern matching
4. Extracts all call sites inside each function body
5. Calculates cyclomatic complexity per function
6. Builds a cross-file caller/callee index across all scanned files

---

## Known Limitations

- Function pointers are detected but cannot be statically resolved to targets
- Heavily macro-expanded signatures may not be fully parsed
- Very large files (10,000+ lines) may have partial symbol extraction
- C++ template specializations may be missed

---

## Changelog

### v1.3.0
- Added **Dark / Light mode toggle** button in the call graph toolbar
- All UI elements switch theme instantly — background, sidebar, legend, links
- Node colors and function name labels are fully theme-aware
- Fixed function name labels becoming invisible in light mode

### v1.2.2
- Added **CodeLens** inline annotations (callers, callees, complexity, dead code warning)
- Added **cyclomatic complexity** calculation per function
- Added **Toggle CodeLens** command and sidebar button

### v1.1.0
- Added **Analyze This Directory** — right-click any folder in Explorer
- Removed 200-file scan cap — workspace scan now unlimited
- Added **Re-scan Last Scope** button
- Added `includeGlob` / `excludeGlob` settings
- Scope-aware auto-refresh on save

### v1.0.0
- Initial release
- Sidebar tree: includes, structs, macros, globals, functions
- Interactive call graph with pan/zoom
- Cross-file caller/callee analysis
- Auto-analyze on file open

---

## License

MIT © 2025