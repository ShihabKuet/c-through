# C Through

> **See your C/C++ codebase, completely visible.**

C Through brings **Source Insight-style code intelligence** into VS Code — built specifically for C and C++ developers who need more than what a standard editor provides.

Large C codebases are hard to navigate. Functions call other functions across dozens of files. Global variables get written in one place and read in five others. You spend more time *chasing references* than writing code. Source Insight solved this for decades with its Relational Window — but it's a separate, aging tool that lives outside your modern workflow.

**C Through closes that gap.** It runs entirely inside VS Code, requires zero configuration, no compiler, no build system — just open a file and your code structure appears instantly.

> Current Version: **2.3.2**

---

![C Through Representaion Image](https://res.cloudinary.com/dhslusvuk/image/upload/v1779184861/c_through_representaion_uhvfps.png)

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

### 🔍 Search & Filter

**Sidebar Search & Filter:**
The **C Through: Search & Filter** panel sits above the sidebar tree with an embedded search box and category checkboxes.

- Type any part of a name in the search box — Includes, Structs, Macros, Globals, and Functions filter to matches instantly (no pop-up)
- Toggle the **Includes / Structs / Macros / Globals / Functions** checkboxes to show or hide whole sections, with **Select all / Clear all** shortcuts
- Click **✕** to clear the search
- The 🔍 toolbar icon (or `Ctrl+Shift+P` → `C Through: Search Sidebar`) reveals and focuses the search box

**Call Graph Search:**
Search inside the visual call graph to find nodes quickly.

- Type in the **Search nodes…** input box in the call graph toolbar
- Matching nodes are highlighted at full opacity with a glow effect
- Non-matching nodes are dimmed to 20% opacity
- Click **✕** to clear the search
- Search term persists across panel re-opens

**Cursor Sync:**
Keep the sidebar in step with where you are in the code.

- Move the editor cursor to a function or global variable — the C Through tree selects and reveals that symbol
- Placing the cursor on a call site reveals the called function's definition; elsewhere it selects the enclosing function
- Highlights without stealing focus from the editor
- Toggle off with the `cThrough.syncCursor` setting

---

### ☠ Dead Code Report
A dedicated report panel showing all dead and unused code across your entire workspace.

Open via `Ctrl+Shift+P` → `C Through: Show Dead Code Report` or the ⚠ button in the sidebar toolbar.

**Detects:**
- **Unused Functions** — zero callers, with severity and confidence rating
- **Unused Globals** — declared but never referenced, or written but never read
- **Unused Macros** — defined but never referenced in any function body
- **Unresolved Externs** — extern declarations with no definition found in scanned files

**Panel features:**
- Summary dashboard with counts by category and severity
- Tabs: All / Functions / Globals / Macros / Unresolved Externs
- Filter bar to search findings by name or file
- Click any row to jump directly to that source line
- ⟳ Analyze Workspace button to re-scan and refresh the report
- Dark / Light theme toggle

**Severity levels:**

| Level | Meaning |
|---|---|
| 🔴 High | Static function with no callers, or global never referenced |
| 🟡 Medium | Non-static function with no callers, or write-only global |
| 🟢 Low | Unused macro |
| ⚪ Info | Unresolved extern declaration |

> **Note:** Always run **Analyze Entire Workspace** before opening the report for accurate cross-file results.

---

### ⚡ Auto-Refresh on Save

---

### 🔎 Global Variable Reference Tracker
Expand any global variable in the sidebar to see its complete usage across all files:

- **Defined / Extern declared** — where it lives and where it is imported
- **Written** — every function that assigns to it, with file and line
- **Read** — every function that reads it, with file and line
- **Passed as argument** — every call site where it is passed
- **Address taken** — every `&var` usage

Every entry is clickable and jumps to the exact source line.

CodeLens above every global declaration shows:

```c
    🌐 global  int    ✏️ 3 writes  👁 7 reads  · 4 functions  · 2 files
    int g_counter = 0;
```

---

## Installation

### From VS Code Marketplace
1. Press `Ctrl+Shift+X`
2. Search **"C Through"**
3. Click **Install**

### From VSIX
```bash
code --install-extension c-through-2.3.2.vsix
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
| `C Through: Search Sidebar` | Filter sidebar functions and globals by name |
| `C Through: Show Dead Code Report` | Open the dead code analysis report panel |

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

## License

MIT © 2026