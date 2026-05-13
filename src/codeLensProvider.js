'use strict';
const vscode = require('vscode');
const path = require('path');

/**
 * CThroughCodeLensProvider
 *
 * Renders clickable lenses above every C/C++ function definition:
 *
 *   ↑ 3 callers  ↓ 5 calls  ⚡ complexity: 8  📄 main.c, utils.c
 *   int process_packet(PacketHeader *hdr, uint8_t *buf) {
 *
 * Each lens is independently clickable and triggers a C Through command.
 */
class CThroughCodeLensProvider {
  constructor(db) {
    this._db = db;
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeCodeLenses = this._onDidChange.event;
  }

  /** Called by VS Code when it needs to invalidate all lenses */
  refresh() {
    this._onDidChange.fire();
  }

  /**
   * provideCodeLenses — called once per document open/change.
   * Returns one CodeLens group per function found in the DB for this file.
   */
  provideCodeLenses(document) {
    const cfg = vscode.workspace.getConfiguration('cThrough');
    if (!cfg.get('enableCodeLens', true)) return [];

    const fileData = this._db.files.get(document.fileName);
    if (!fileData || !fileData.functions.length) return [];

    const lenses = [];

    for (const fn of fileData.functions) {
      // VS Code lines are 0-based; parser lines are 1-based
      const lineIndex = Math.max(0, fn.line - 1);
      const range = new vscode.Range(lineIndex, 0, lineIndex, 0);

      const callers  = this._db.getCallers(fn.name);
      const callees  = fn.calls.filter(c => !c.isStdLib);
      const allCallees = fn.calls; // including stdlib for complexity
      const complexity = fn.complexity || 1;
      const isDead   = callers.length === 0 && !fn.isEntryPoint;

      // ── Lens 1: Callers ──────────────────────────────────────────────────
      const callerLabel = callers.length === 0
        ? (isDead ? '💀 0 callers' : '⊙ root')
        : `↑ ${callers.length} caller${callers.length !== 1 ? 's' : ''}`;

      lenses.push(new vscode.CodeLens(range, {
        title: callerLabel,
        tooltip: callers.length
          ? `Called by: ${callers.slice(0, 5).map(c => c.caller).join(', ')}${callers.length > 5 ? ` +${callers.length - 5} more` : ''}`
          : isDead ? 'No callers found — possible dead code' : 'Root function (entry point)',
        command: callers.length ? 'cThrough.showCallers' : '',
        arguments: [fn.name]
      }));

      // ── Lens 2: Callees ──────────────────────────────────────────────────
      const calleeLabel = callees.length === 0
        ? '⊙ leaf'
        : `↓ ${callees.length} call${callees.length !== 1 ? 's' : ''}`;

      lenses.push(new vscode.CodeLens(range, {
        title: calleeLabel,
        tooltip: callees.length
          ? `Calls: ${callees.slice(0, 5).map(c => c.name).join(', ')}${callees.length > 5 ? ` +${callees.length - 5} more` : ''}`
          : 'Leaf function — calls nothing',
        command: callees.length ? 'cThrough.showCallees' : '',
        arguments: [fn.name]
      }));

      // ── Lens 3: Cyclomatic Complexity ────────────────────────────────────
      const complexIcon = complexity >= 20 ? '🔴' : complexity >= 10 ? '🟡' : '🟢';
      lenses.push(new vscode.CodeLens(range, {
        title: `${complexIcon} complexity: ${complexity}`,
        tooltip: complexityTooltip(complexity),
        command: 'cThrough.showTree',
        arguments: [fn.name]
      }));

      // ── Lens 4: Caller files (cross-file info) ───────────────────────────
      if (callers.length > 0) {
        const uniqueFiles = [...new Set(callers.map(c => path.basename(c.file || '')))].filter(Boolean);
        const fileLabel = uniqueFiles.length <= 2
          ? `📄 ${uniqueFiles.join(', ')}`
          : `📄 ${uniqueFiles.slice(0, 2).join(', ')} +${uniqueFiles.length - 2}`;

        lenses.push(new vscode.CodeLens(range, {
          title: fileLabel,
          tooltip: `Called from files:\n${uniqueFiles.join('\n')}`,
          command: 'cThrough.showCallers',
          arguments: [fn.name]
        }));
      }

      // ── Lens 5: Dead code warning (standalone, hard to miss) ─────────────
      if (isDead && !isLikelyEntryPoint(fn.name)) {
        lenses.push(new vscode.CodeLens(range, {
          title: '⚠ dead code — no callers found',
          tooltip: 'This function has no callers anywhere in the analyzed scope.\nIt may be unused, exported via header, or only called via function pointer.',
          command: 'cThrough.analyzeWorkspace',
          arguments: []
        }));
      }
    }

    return lenses;
  }

  /** resolveCodeLens is not needed — all commands are set in provideCodeLenses */
  resolveCodeLens(lens) {
    return lens;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function complexityTooltip(n) {
  if (n <= 4)  return `Complexity ${n}: Simple, easy to test`;
  if (n <= 9)  return `Complexity ${n}: Moderate, manageable`;
  if (n <= 19) return `Complexity ${n}: High — consider refactoring`;
  return       `Complexity ${n}: Very high — hard to test and maintain`;
}

/**
 * Heuristic: function names that are typically roots even with 0 callers.
 * main, ISR handlers, RTOS task functions, test functions, etc.
 */
function isLikelyEntryPoint(name) {
  return /^(main|app_main|startup|reset_handler|hardfault_handler|.*_irqhandler|.*_isr|.*_handler|.*_task|.*_thread|test_.*|setup|loop|init|vApplicationIdleHook|vApplicationTickHook)$/i.test(name);
}

module.exports = CThroughCodeLensProvider;
