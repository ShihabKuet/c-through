## Changelog

All notable changes to the "C Through" extension are documented here.

### v2.3.1
- **Embedded Search & Filter panel** — added a "C Through: Search & Filter" panel above the sidebar tree with a live search box (replacing the old pop-up input) that filters Includes, Structs, Macros, Globals, and Functions by name
- **Category filter checkboxes** — toggle visibility of Includes / Structs / Macros / Globals / Functions sections directly from the panel, with Select all / Clear all shortcuts
- The sidebar Search toolbar icon now reveals and focuses the embedded search box instead of opening a pop-up

### v2.3.0
- **Global (variable) writes through library functions** are now tracked — a global passed as the destination of `strcpy`, `strncpy`, `strcat`, `memcpy`, `memmove`, `memset`, `sprintf`, `snprintf`, `fgets`, `fread` and similar is counted as a **write** instead of a read; source arguments remain reads
- **Indirect function references** are now detected — functions registered in command/dispatch tables, handed to task/thread-creation APIs, or used as callbacks (referenced by pointer, not called directly) no longer show as "Called by 0" or get flagged as dead code
- New **Referenced (N)** section in the function sidebar lists each reference site (command table, `sys_task_create` call, etc.), and the CodeLens shows `⊙ referenced N×` instead of `💀 0 callers`
- Reference detection is scope-aware: parameter/prototype names and local variables that shadow a same-named function are not miscounted as references

### v2.2.11
- Fixed function names truncated to a single letter when the return type has no plain base token — `static unsigned long show_redirect(...)` now shows as `show_redirect` instead of `t`
- Applies to return types built entirely from qualifier keywords (`unsigned long`, `long`, `short`) and to uppercase `typedef`/macro types (`ULONG`, `INT32`, `BOOL`), including pointer returns (`ULONG *foo(...)`) and multi-line signatures

### v2.2.10
- Multi-variable and array declarations on a single line are now fully parsed — `STUDENT new_students[10], old_students[10];` and `uint8_t old_student_n, new_student_n;` now list every variable instead of only the first
- **Global refs** now track reads/compares, not just writes — globals used in conditions, expressions, or as right-hand values (e.g. `if (new_student_n <= old_student_n)`) now appear in the sidebar and CodeLens
- Subscripted and struct-member writes are correctly classified as writes — `arr[i] = x`, `new_students[6].age = 20`, and `p->next->val = ...` now count the base global as written rather than read
- Single-line `struct`/`union`/`enum` definitions no longer leak their fields as bogus globals

### v2.2.9
- Fixed crash when rendering function-like macros with empty parameters — `#define FOO()` no longer causes `.join()` on null crash in the sidebar
- Fixed function detection for signatures prefixed with uppercase macros — `PAM_EXTERN`, `EXPORT`, `API_FUNC` and similar patterns are now correctly parsed
- Call graph toolbar buttons now wrap responsively when the panel is narrow — no more hidden or overflowing buttons


### v2.2.6
- Official Icon Change

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