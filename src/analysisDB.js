'use strict';

/**
 * AnalysisDB - In-memory store for all parsed C file data.
 * Supports cross-file callers/callees lookup.
 */
class AnalysisDB {
  constructor() {
    this.files = new Map();           // filePath -> ParsedFile
    this._functionIndex = new Map(); // funcName -> {file, fn}
    this._callersIndex = new Map();  // funcName -> [{caller, file, line}]
    this._globalIndex = new Map();   // varName -> {file, line, type, isExtern, isStatic, declaration}
    this._globalRefs  = new Map();   // varName -> [{file, func, funcLine, refType, line}]
    this._funcRefs    = new Map();   // funcName -> [{file, line}] indirect (pointer) refs
    this._funcRefsDirty = true;      // rebuild _funcRefs lazily after files change
    this._macroIndex  = new Map();   // macroName -> {file, line, isFunctionLike}
    this._structIndex = new Map();   // struct name/tag -> {file, line, isTypedef}
  }

  clear() {
    this.files.clear();
    this._functionIndex.clear();
    this._callersIndex.clear();
    this._globalIndex.clear();
    this._globalRefs.clear();
    this._funcRefs.clear();
    this._funcRefsDirty = true;
    this._macroIndex.clear();
    this._structIndex.clear();
  }

  addFile(parsedFile) {
    const { filePath, functions } = parsedFile;
    this.files.set(filePath, parsedFile);
    this._funcRefsDirty = true;

    // Index global definitions and extern declarations
    const { globals } = parsedFile;
    for (const g of (globals || [])) {
      if (!this._globalIndex.has(g.name) || !g.isExtern) {
        this._globalIndex.set(g.name, {
          file: filePath, line: g.line, type: g.type,
          isExtern: g.isExtern, isStatic: g.isStatic, declaration: g.declaration
        });
      }
      if (g.isExtern) {
        if (!this._globalRefs.has(g.name)) this._globalRefs.set(g.name, []);
        const ex = this._globalRefs.get(g.name);
        if (!ex.find(e => e.file === filePath && e.refType === 'extern'))
          ex.push({ file: filePath, func: null, funcLine: null, refType: 'extern', line: g.line });
      }
    }

    // Index macro definitions (for function -> macro links in the call graph)
    for (const mac of (parsedFile.macros || [])) {
      if (!this._macroIndex.has(mac.name)) {
        this._macroIndex.set(mac.name, {
          file: filePath, line: mac.line, isFunctionLike: mac.isFunctionLike
        });
      }
    }

    // Index struct/union/enum definitions by both typedef name and tag
    for (const s of (parsedFile.structs || [])) {
      const entry = { file: filePath, line: s.line, isTypedef: s.isTypedef };
      if (s.name && !this._structIndex.has(s.name)) this._structIndex.set(s.name, entry);
      if (s.tag && !this._structIndex.has(s.tag)) this._structIndex.set(s.tag, entry);
    }

    // Index global refs from function bodies
    for (const fn of functions) {
      if (!fn.globalRefs || !fn.globalRefs.length) continue;
      for (const ref of fn.globalRefs) {
        if (!this._globalRefs.has(ref.name)) this._globalRefs.set(ref.name, []);
        const existing = this._globalRefs.get(ref.name);
        if (!existing.find(e => e.file === filePath && e.func === fn.name && e.line === ref.line))
          existing.push({ file: filePath, func: fn.name, funcLine: fn.line, refType: ref.type, line: ref.line });
      }
    }

    // Index all functions
    for (const fn of functions) {
      this._functionIndex.set(fn.name, { file: filePath, fn });
    }

    // Build callers index
    for (const fn of functions) {
      for (const call of fn.calls) {
        if (!this._callersIndex.has(call.name)) {
          this._callersIndex.set(call.name, []);
        }
        const existing = this._callersIndex.get(call.name);
        // Avoid duplicates on re-parse
        if (!existing.find(e => e.caller === fn.name && e.file === filePath)) {
          existing.push({ caller: fn.name, file: filePath, line: fn.line, count: call.count });
        }
      }
    }
  }

  removeFile(filePath) {
    const file = this.files.get(filePath);
    if (!file) return;

    // Drop this file's caller entries. The predicate depends only on filePath,
    // so this runs once for the whole file — not once per function.
    for (const [callee, callers] of this._callersIndex) {
      if (!callers.some(c => c.file === filePath)) continue; // nothing from this file
      const filtered = callers.filter(c => c.file !== filePath);
      if (filtered.length === 0) this._callersIndex.delete(callee);
      else this._callersIndex.set(callee, filtered);
    }

    // Remove this file's functions from the index, but only the entries this
    // file actually owns — otherwise a same-named static in another file (a
    // common C pattern) would be evicted along with this one.
    const orphaned = new Set();
    for (const fn of file.functions) {
      const entry = this._functionIndex.get(fn.name);
      if (entry && entry.file === filePath) {
        this._functionIndex.delete(fn.name);
        orphaned.add(fn.name);
      }
    }
    // Any orphaned name still defined by another file takes over the entry.
    if (orphaned.size) {
      for (const [otherPath, other] of this.files) {
        if (!orphaned.size) break;
        if (otherPath === filePath) continue;
        for (const ofn of (other.functions || [])) {
          if (orphaned.has(ofn.name)) {
            this._functionIndex.set(ofn.name, { file: otherPath, fn: ofn });
            orphaned.delete(ofn.name);
          }
        }
      }
    }

    // Clean global entries from this file
    for (const g of (file.globals || [])) {
      const entry = this._globalIndex.get(g.name);
      if (entry && entry.file === filePath) this._globalIndex.delete(g.name);
      if (this._globalRefs.has(g.name)) {
        const filtered = this._globalRefs.get(g.name).filter(r => r.file !== filePath);
        if (filtered.length === 0) this._globalRefs.delete(g.name);
        else this._globalRefs.set(g.name, filtered);
      }
    }

    // Clean macro / struct index entries from this file
    for (const [name, e] of this._macroIndex) {
      if (e.file === filePath) this._macroIndex.delete(name);
    }
    for (const [name, e] of this._structIndex) {
      if (e.file === filePath) this._structIndex.delete(name);
    }

    this.files.delete(filePath);
    this._funcRefsDirty = true;
  }

  /**
   * Rebuild the indirect function-reference index from every file's raw
   * candidates, keeping only names that resolve to a known function. A
   * reference on the function's own definition line is ignored.
   */
  _buildFuncRefs() {
    const map = new Map();
    for (const [filePath, file] of this.files) {
      for (const ref of (file.funcRefs || [])) {
        const def = this._functionIndex.get(ref.name);
        if (!def) continue; // only real functions
        if (def.file === filePath && def.fn.line === ref.line) continue; // own def line
        if (!map.has(ref.name)) map.set(ref.name, []);
        const arr = map.get(ref.name);
        if (!arr.find(e => e.file === filePath && e.line === ref.line))
          arr.push({ file: filePath, line: ref.line });
      }
    }
    this._funcRefs = map;
    this._funcRefsDirty = false;
  }

  /**
   * Indirect (function-pointer) references to a function — command tables,
   * task/thread entry points, callback registrations. Distinct from callers:
   * these are references, not resolved call edges.
   */
  getFunctionRefs(funcName) {
    if (this._funcRefsDirty) this._buildFuncRefs();
    return this._funcRefs.get(funcName) || [];
  }

  getFunction(name) {
    const entry = this._functionIndex.get(name);
    return entry ? { ...entry.fn, file: entry.file } : null;
  }

  getCallers(funcName) {
    return this._callersIndex.get(funcName) || [];
  }

  getAllFunctions() {
    const result = [];
    for (const [name, { file, fn }] of this._functionIndex) {
      result.push({ name, file, line: fn.line });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  getGlobalDef(varName) {
    return this._globalIndex.get(varName) || null;
  }

  getGlobalRefs(varName) {
    return this._globalRefs.get(varName) || [];
  }

  getMacroDef(name) {
    return this._macroIndex.get(name) || null;
  }

  getStructDef(name) {
    return this._structIndex.get(name) || null;
  }

  /**
   * Build the data symbols (globals, macros, structs) a function touches, for
   * display as nodes in the call graph. Each is deduped and linked to its
   * definition. `fn` is a full parser function object (from getFunction).
   */
  _functionSymbols(fn) {
    // Globals — dedupe by name, aggregate the access kinds (read/write/addr)
    const gmap = new Map();
    for (const r of (fn.globalRefs || [])) {
      const acc = gmap.get(r.name) || new Set();
      acc.add(r.type);
      gmap.set(r.name, acc);
    }
    const globals = [];
    for (const [name, acc] of gmap) {
      const def = this.getGlobalDef(name);
      globals.push({
        name,
        access: ['write', 'read', 'addr'].filter(a => acc.has(a)).join('/') || 'ref',
        file: def ? def.file : null,
        line: def ? def.line : null
      });
    }

    // Macros — intersect the all-caps token set with the real macro table
    const seenM = new Set();
    const macros = [];
    for (const name of (fn.refs || [])) {
      if (seenM.has(name)) continue;
      const def = this.getMacroDef(name);
      if (def) { seenM.add(name); macros.push({ name, file: def.file, line: def.line }); }
    }

    // Structs — intersect candidate type names with the real struct/union table
    const seenS = new Set();
    const structs = [];
    for (const name of (fn.typeRefs || [])) {
      if (seenS.has(name)) continue;
      const def = this.getStructDef(name);
      if (def) { seenS.add(name); structs.push({ name, file: def.file, line: def.line }); }
    }

    return { globals, macros, structs };
  }

  getAllGlobals() {
    const result = [];
    for (const [name, def] of this._globalIndex) {
      result.push({ name, ...def });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Build a full call tree rooted at funcName (downward)
   */
  buildCallTree(funcName, maxDepth = 5) {
    const visited = new Set();
    const build = (name, depth) => {
      if (depth > maxDepth || visited.has(name)) {
        return { name, children: [], truncated: true };
      }
      visited.add(name);
      const fn = this.getFunction(name);
      if (!fn) return { name, children: [], external: true };
      const children = fn.calls
        .filter(c => !c.isStdLib)
        .map(c => build(c.name, depth + 1));
      visited.delete(name); // allow same fn in different branches
      return {
        name, kind: 'function', file: fn.file, line: fn.line, children,
        params: fn.params, returnType: fn.returnType,
        symbols: this._functionSymbols(fn)
      };
    };
    return build(funcName, 0);
  }

  /**
   * Build a full callers tree rooted at funcName (upward)
   */
  buildCallersTree(funcName, maxDepth = 5) {
    const visited = new Set();
    const build = (name, depth) => {
      if (depth > maxDepth || visited.has(name)) {
        return { name, children: [], truncated: true };
      }
      visited.add(name);
      const callers = this.getCallers(name);
      const fn = this.getFunction(name);
      const children = callers.map(c => build(c.caller, depth + 1));
      visited.delete(name);
      return {
        name, kind: 'function', file: fn?.file, line: fn?.line, children,
        callerCount: callers.length,
        symbols: fn ? this._functionSymbols(fn) : { globals: [], macros: [], structs: [] }
      };
    };
    return build(funcName, 0);
  }

  /**
   * Generate dead code report from current indexed data.
   */
  generateDeadCodeReport() {
    const findings = [];

    const isEntryPoint = name =>
      /^(main|app_main|startup|reset_handler|hardfault_handler|.*_irqhandler|.*_isr|.*_handler|.*_task|.*_thread|test_.*|setup|loop|init|vApplicationIdleHook|vApplicationTickHook)$/i.test(name);

    // ── Unused Functions ───────────────────────────────────────────────────
    for (const [name, { file, fn }] of this._functionIndex) {
      const callers = this._callersIndex.get(name) || [];
      if (callers.length > 0) continue;
      if (isEntryPoint(name)) continue;
      // Referenced by pointer (command table, thread entry, callback) — not dead
      if (this.getFunctionRefs(name).length > 0) continue;

      findings.push({
        category:   'functions',
        name,
        file,
        line:       fn.line,
        type:       fn.returnType || 'function',
        severity:   fn.isStatic ? 'high' : 'high',
        confidence: fn.isStatic ? 'high' : 'medium',
        reason:     fn.isStatic
          ? 'Static function — no local callers found'
          : 'No callers found — may be exported via header or called via function pointer'
      });
    }

    // ── Unused / Write-only Globals ────────────────────────────────────────
    if (this._globalIndex) {
      for (const [name, def] of this._globalIndex) {
        if (def.isExtern) continue;
        const refs   = this._globalRefs ? (this._globalRefs.get(name) || []) : [];
        const reads  = refs.filter(r => r.refType === 'read').length;
        const writes = refs.filter(r => r.refType === 'write').length;
        const args   = refs.filter(r => r.refType === 'arg').length;
        const addrs  = refs.filter(r => r.refType === 'addr').length;
        const total  = reads + writes + args + addrs;

        if (total === 0) {
          findings.push({
            category:   'globals',
            name,
            file:       def.file,
            line:       def.line,
            type:       def.type || 'variable',
            severity:   def.isStatic ? 'high' : 'medium',
            confidence: 'high',
            reason:     'Declared but never read, written, or referenced'
          });
        } else if (reads === 0 && args === 0 && addrs === 0 && writes > 0) {
          findings.push({
            category:   'globals',
            name,
            file:       def.file,
            line:       def.line,
            type:       def.type || 'variable',
            severity:   'medium',
            confidence: 'high',
            reason:     'Written ' + writes + 'x but never read — possible logic bug'
          });
        }
      }
    }

    // ── Unused Macros ──────────────────────────────────────────────────────
    // Collect all macro names referenced in function bodies (via refs array)
    const usedMacros = new Set();
    for (const [, file] of this.files) {
      for (const fn of file.functions) {
        for (const ref of (fn.refs || [])) usedMacros.add(ref);
      }
    }

    for (const [, file] of this.files) {
      for (const macro of (file.macros || [])) {
        // Skip include guards
        if (/^[A-Z_]+_H(_+)?$/.test(macro.name)) continue;
        if (usedMacros.has(macro.name)) continue;
        findings.push({
          category:   'macros',
          name:       macro.name,
          file:       file.filePath,
          line:       macro.line,
          type:       macro.isFunctionLike ? 'macro (fn)' : 'macro',
          severity:   'low',
          confidence: 'medium',
          reason:     'Defined but not referenced in any analyzed function body'
        });
      }
    }

    // ── Unresolved Externs ─────────────────────────────────────────────────
    if (this._globalIndex) {
      for (const [name, def] of this._globalIndex) {
        if (!def.isExtern) continue;
        // Check if a non-extern definition exists anywhere in the index
        let hasDefinition = false;
        for (const [, other] of this._globalIndex) {
          if (other !== def && !other.isExtern) { hasDefinition = true; break; }
        }
        if (!hasDefinition) {
          findings.push({
            category:   'externs',
            name,
            file:       def.file,
            line:       def.line,
            type:       def.type || 'extern',
            severity:   'info',
            confidence: 'low',
            reason:     'Extern declared but definition not found in scanned files'
          });
        }
      }
    }

    // Sort: high → medium → low → info, then alphabetically
    const order = { high:0, medium:1, low:2, info:3 };
    findings.sort((a, b) =>
      (order[a.severity] || 0) - (order[b.severity] || 0) ||
      a.name.localeCompare(b.name)
    );

    return {
      findings,
      scannedFiles:     this.files.size,
      scannedFunctions: this._functionIndex.size,
      scannedGlobals:   this._globalIndex ? this._globalIndex.size : 0
    };
  }

  getStats() {
    let totalFunctions = 0, totalCalls = 0;
    for (const [, file] of this.files) {
      totalFunctions += file.functions.length;
      totalCalls += file.functions.reduce((s, fn) => s + fn.calls.length, 0);
    }
    return {
      files: this.files.size,
      functions: totalFunctions,
      calls: totalCalls,
      structs: Array.from(this.files.values()).reduce((s, f) => s + f.structs.length, 0),
      globals: this._globalIndex.size
    };
  }
}

module.exports = AnalysisDB;
