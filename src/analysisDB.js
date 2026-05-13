'use strict';

/**
 * AnalysisDB - In-memory store for all parsed C file data.
 * Supports cross-file callers/callees lookup.
 */
class AnalysisDB {
  constructor() {
    this.files = new Map();         // filePath -> ParsedFile
    this._functionIndex = new Map(); // funcName -> {file, fn}
    this._callersIndex = new Map();  // funcName -> [{caller, file, line}]
  }

  clear() {
    this.files.clear();
    this._functionIndex.clear();
    this._callersIndex.clear();
  }

  addFile(parsedFile) {
    const { filePath, functions } = parsedFile;
    this.files.set(filePath, parsedFile);

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

    // Remove from function index
    for (const fn of file.functions) {
      this._functionIndex.delete(fn.name);
      // Remove callers from this file
      for (const [callee, callers] of this._callersIndex) {
        const filtered = callers.filter(c => c.file !== filePath);
        if (filtered.length === 0) this._callersIndex.delete(callee);
        else this._callersIndex.set(callee, filtered);
      }
    }
    this.files.delete(filePath);
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
      return { name, file: fn.file, line: fn.line, children, params: fn.params, returnType: fn.returnType };
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
      return { name, file: fn?.file, line: fn?.line, children, callerCount: callers.length };
    };
    return build(funcName, 0);
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
      structs: Array.from(this.files.values()).reduce((s, f) => s + f.structs.length, 0)
    };
  }
}

module.exports = AnalysisDB;
