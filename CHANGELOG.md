## Changelog

All notable changes to the "C Through" extension are documented here.

### v2.2.4
- Added **Dead Code Report** panel — detects unused functions, globals, macros, and unresolved externs
- Summary dashboard with counts by category and severity
- Tabbed view: All / Functions / Globals / Macros / Unresolved Externs
- Click any row jumps to exact source line
- Filter bar to search findings by name or file
- Re-analyze Workspace button inside the report panel
- Dark / Light theme toggle in report panel
- Severity and confidence ratings per finding

### v2.1.0
- Added **Sidebar Search** — filter functions and globals by name via toolbar button or command
- Added **Call Graph Search** — highlight matching nodes and dim others inside the visual graph
- Search term persists across call graph panel re-opens
- Changed Analyze Entire Workspace icon to `$(globe)` to differentiate from search

### v2.0.0
- Added **Global Variable Reference Tracker** — expand any global in the sidebar to see where it is defined, written, read, passed as argument, or address-taken, across all files
- Global variables now show `isExtern`, `isStatic`, and type info in the sidebar
- CodeLens above global declarations shows full reference summary (writes, reads, files, functions)
- Functions now show a **Global refs** sub-section listing which globals they access
- Functions CodeLens gets a `🌐 globals:` lens showing accessed globals with write/read counts

### v1.3.3
- Added **Sidebar toggle** button (`☰`) — hide/show the right panel
- Theme and sidebar state now **persist** across panel re-opens via VS Code state
- Clicking **Globals, Macros, and Includes** in the sidebar now jumps to their exact source line
- Expanded global variable detection to support struct, typedef, and custom types
- Toolbar buttons are now icon-only for a cleaner, less crowded layout

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