'use strict';
const vscode = require('vscode');
const path = require('path');

/**
 * VS Code TreeDataProvider for the C Through sidebar view.
 * Shows functions, their callees, callers, and metadata.
 */
class CTreeProvider {
  constructor(analysisDB) {
    this._db = analysisDB;
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    this._rootItems = [];
    this._filter = '';
    this._mode = 'file'; // 'file' | 'function' | 'callers' | 'callees'
    this._focusedFunction = null;
    // Which category sections are shown in the file view. Toggled from the
    // controls webview (Search & Filter panel).
    this._categories = {
      includes: true,
      structs:  true,
      macros:   true,
      globals:  true,
      functions: true
    };
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  setFilter(text) {
    this._filter = (text || '').toLowerCase().trim();
    this.refresh();
  }

  getFilter() {
    return this._filter;
  }

  clearFilter() {
    this._filter = '';
    this.refresh();
  }

  setCategoryEnabled(category, enabled) {
    if (category in this._categories) {
      this._categories[category] = !!enabled;
      this.refresh();
    }
  }

  getCategories() {
    return { ...this._categories };
  }

  showFileView(filePath) {
    this._mode = 'file';
    this._focusedFile = filePath;
    this.refresh();
  }

  showFunctionView(funcName, mode) {
    this._focusedFunction = funcName;
    this._mode = mode; // 'callers' or 'callees'
    this.refresh();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) {
      return this._getRootChildren();
    }
    return element.getChildren ? element.getChildren() : [];
  }

  _getRootChildren() {
    const db = this._db;
    if (!db || db.files.size === 0) {
      return [new InfoItem('No C files analyzed yet.', 'Run "Analyze File" or "Analyze Workspace"', 'info')];
    }

    if (this._mode === 'callers' && this._focusedFunction) {
      return this._getCallersTree(this._focusedFunction);
    }
    if (this._mode === 'callees' && this._focusedFunction) {
      return this._getCalleesTree(this._focusedFunction);
    }

    // Default: file view
    const items = [];
    for (const [filePath, fileData] of db.files) {
      if (this._focusedFile && filePath !== this._focusedFile) continue;
      items.push(new FileItem(filePath, fileData, db, this._filter, this._categories));
    }
    return items.length ? items : [new InfoItem('No files match filter', '', 'warning')];
  }

  _getCallersTree(funcName, depth = 0, visited = new Set()) {
    if (visited.has(funcName) || depth > 5) {
      return depth > 5 ? [new InfoItem('(max depth reached)', '', 'info')] : [new InfoItem('(recursive)', '', 'warning')];
    }
    visited.add(funcName);
    const callers = this._db.getCallers(funcName);
    if (!callers.length) return [new InfoItem('No callers found', `"${funcName}" is a root function`, 'info')];
    return callers.map(c => new FunctionItem(c.caller, c.file, c.line, 'caller', this._db, depth, visited));
  }

  _getCalleesTree(funcName, depth = 0, visited = new Set()) {
    if (visited.has(funcName) || depth > 5) {
      return depth > 5 ? [new InfoItem('(max depth reached)', '', 'info')] : [new InfoItem('(recursive)', '', 'warning')];
    }
    visited.add(funcName);
    const fn = this._db.getFunction(funcName);
    if (!fn) return [new InfoItem('Function not found', '', 'warning')];
    if (!fn.calls.length) return [new InfoItem('No calls made', `"${funcName}" calls nothing`, 'info')];
    return fn.calls
      .filter(c => !c.isStdLib || vscode.workspace.getConfiguration('cThrough').get('showStdLib'))
      .map(c => new FunctionItem(c.name, c.file, c.line, 'callee', this._db, depth, visited, c.count));
  }
}

// ─── Tree Items ────────────────────────────────────────────────────────────

class FileItem extends vscode.TreeItem {
  constructor(filePath, fileData, db, filter, categories) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Expanded);
    this.filePath = filePath;
    this.fileData = fileData;
    this.db = db;
    this.filter = filter || '';
    this.categories = categories || { includes: true, structs: true, macros: true, globals: true, functions: true };
    this.tooltip = filePath;
    this.description = `${fileData.functions.length} functions`;
    this.iconPath = new vscode.ThemeIcon('symbol-file');
    this.contextValue = 'cFile';
  }

  getChildren() {
    const sections = [];
    const cat = this.categories;
    const f = this.filter;
    const match = name => !f || (name || '').toLowerCase().includes(f);

    // Includes section
    if (cat.includes) {
      const includes = this.fileData.includes.filter(inc => match(inc.file));
      if (includes.length) {
        sections.push(new SectionItem('Includes', includes.map(inc =>
          new LeafItem(inc.file, inc.isSystem ? '<system>' : '"local"', 'symbol-file', inc.line, this.filePath)
        )));
      }
    }

    // Structs/Types section
    if (cat.structs) {
      const structs = this.fileData.structs.filter(s => match(s.name));
      if (structs.length) {
        sections.push(new SectionItem('Structs / Types', structs.map(s =>
          new StructItem(s, this.filePath)
        )));
      }
    }

    // Macros section
    if (cat.macros) {
      const fnMacros = this.fileData.macros.filter(m => m.isFunctionLike && match(m.name));
      const valMacros = this.fileData.macros.filter(m => !m.isFunctionLike && match(m.name));
      if (fnMacros.length) {
        sections.push(new SectionItem('Function Macros', fnMacros.map(m =>
          new LeafItem(`${m.name}(${(m.params || []).join(', ')})`, m.body.slice(0, 40), 'symbol-misc', m.line, this.filePath)
        )));
      }
      if (valMacros.length) {
        sections.push(new SectionItem('Macros', valMacros.map(m =>
          new LeafItem(m.name, m.body.slice(0, 40), 'symbol-constant', m.line, this.filePath)
        )));
      }
    }

    // Globals section — filtered
    if (cat.globals) {
      const filteredGlobals = this.fileData.globals.filter(g => match(g.name));
      if (filteredGlobals.length) {
        sections.push(new SectionItem('Global Variables', filteredGlobals.map(g =>
          new GlobalVarItem(g, this.filePath, this.db)
        )));
      }
    }

    // Functions section — filtered
    if (cat.functions) {
      const filteredFunctions = this.fileData.functions.filter(fn => match(fn.name));
      if (filteredFunctions.length) {
        sections.push(new SectionItem('Functions', filteredFunctions.map(fn =>
          new FunctionDefItem(fn, this.filePath, this.db)
        )));
      } else if (!f) {
        sections.push(new SectionItem('Functions', []));
      }
    }

    return sections;
  }
}

class SectionItem extends vscode.TreeItem {
  constructor(label, children) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this._children = children;
    this.description = `(${children.length})`;
    this.iconPath = new vscode.ThemeIcon(
      label === 'Functions' ? 'symbol-function' :
      label === 'Includes' ? 'references' :
      label === 'Structs / Types' ? 'symbol-struct' :
      label === 'Global Variables' ? 'symbol-variable' :
      'symbol-misc'
    );
    this.contextValue = 'section';
  }
  getChildren() { return this._children; }
}

class GlobalVarItem extends vscode.TreeItem {
  constructor(g, filePath, db) {
    super(g.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.g = g;
    this.filePath = filePath;
    this.db = db;
    const tag = g.isExtern ? 'extern' : g.isStatic ? 'static' : 'global';
    this.description = `${g.type || ''}  [${tag}]  line ${g.line}`;
    this.tooltip = g.declaration;
    this.iconPath = new vscode.ThemeIcon(
      g.isExtern ? 'symbol-interface' : g.isStatic ? 'lock' : 'symbol-variable'
    );
    this.contextValue = 'cGlobal';
    this.command = {
      command: 'cThrough.jumpToFunction',
      title: 'Go to Declaration',
      arguments: [filePath, g.line]
    };
  }

  getChildren() {
    const items = [];
    const refs = this.db.getGlobalRefs(this.g.name);

    if (!refs.length) {
      items.push(new InfoItem('No references found', 'Analyze workspace for cross-file refs', 'info'));
      return items;
    }

    const def = this.db.getGlobalDef(this.g.name);
    if (def) {
      items.push(new RefItem(
        def.isExtern ? 'Extern declared' : 'Defined',
        path.basename(def.file),
        def.line, def.file, 'symbol-variable'
      ));
    }

    const externRefs = refs.filter(r => r.refType === 'extern');
    for (const r of externRefs) {
      items.push(new RefItem('Extern declared', path.basename(r.file), r.line, r.file, 'symbol-interface'));
    }

    const writes = refs.filter(r => r.refType === 'write');
    if (writes.length) {
      items.push(new SectionItem(`Written (${writes.length})`,
        writes.map(r => new RefItem(r.func || '?', `${path.basename(r.file)}:${r.line}`, r.line, r.file, 'edit'))
      ));
    }

    const reads = refs.filter(r => r.refType === 'read');
    if (reads.length) {
      items.push(new SectionItem(`Read (${reads.length})`,
        reads.map(r => new RefItem(r.func || '?', `${path.basename(r.file)}:${r.line}`, r.line, r.file, 'eye'))
      ));
    }

    const args = refs.filter(r => r.refType === 'arg');
    if (args.length) {
      items.push(new SectionItem(`Passed as arg (${args.length})`,
        args.map(r => new RefItem(r.func || '?', `${path.basename(r.file)}:${r.line}`, r.line, r.file, 'symbol-parameter'))
      ));
    }

    const addrs = refs.filter(r => r.refType === 'addr');
    if (addrs.length) {
      items.push(new SectionItem(`Address taken (${addrs.length})`,
        addrs.map(r => new RefItem(r.func || '?', `${path.basename(r.file)}:${r.line}`, r.line, r.file, 'symbol-key'))
      ));
    }

    return items;
  }
}

class RefItem extends vscode.TreeItem {
  constructor(label, description, line, filePath, icon) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description || '';
    this.iconPath = new vscode.ThemeIcon(icon || 'circle-small-filled');
    this.tooltip = filePath ? `${filePath}:${line}` : '';
    this.contextValue = 'cRef';
    if (filePath && line) {
      this.command = {
        command: 'cThrough.jumpToFunction',
        title: 'Go to Reference',
        arguments: [filePath, line]
      };
    }
  }
}

class FunctionDefItem extends vscode.TreeItem {
  constructor(fn, filePath, db) {
    super(fn.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.fn = fn;
    this.filePath = filePath;
    this.db = db;
    this.description = `line ${fn.line} · ${fn.calls.length} calls · ${fn.callers.length} callers`;
    this.tooltip = `${fn.returnType} ${fn.name}(${fn.params.map(p=>p.raw).join(', ')})\nLine: ${fn.line}\nBody: ${fn.bodyLength} lines`;
    this.iconPath = new vscode.ThemeIcon(fn.isStatic ? 'lock' : 'symbol-function');
    this.contextValue = 'cFunction';
    this.command = {
      command: 'cThrough.jumpToFunction',
      title: 'Go to Definition',
      arguments: [filePath, fn.line]
    };
  }

  getChildren() {
    const items = [];

    // Signature
    items.push(new LeafItem(
      `${this.fn.returnType} ${this.fn.name}(${this.fn.params.map(p=>p.raw).join(', ')})`,
      '', 'symbol-method'
    ));

    // Callers
    const callerItems = this.fn.callers.map(c => {
      const callerFn = this.db.getFunction(c.caller);
      return new FunctionRefItem(c.caller, callerFn?.file || this.filePath, callerFn?.line || 0, 'caller', c.count);
    });
    // Indirect references (command tables, thread entry, callbacks)
    const funcRefs = this.db.getFunctionRefs(this.fn.name);
    if (callerItems.length) {
      items.push(new SectionItem(`Called by (${callerItems.length})`, callerItems));
    } else if (funcRefs.length) {
      items.push(new LeafItem('Called by: (none)', 'referenced via pointer', 'info'));
    } else {
      items.push(new LeafItem('Called by: (none)', 'root function', 'info'));
    }
    if (funcRefs.length) {
      const refItems = funcRefs.map(r => new RefItem(
        path.basename(r.file),
        `referenced  line ${r.line}`,
        r.line, r.file, 'references'
      ));
      items.push(new SectionItem(`Referenced (${refItems.length})`, refItems));
    }

    // Callees
    const calleeItems = this.fn.calls
      .filter(c => !c.isStdLib || vscode.workspace.getConfiguration('cThrough').get('showStdLib'))
      .map(c => {
        const calleeFn = this.db.getFunction(c.name);
        return new FunctionRefItem(c.name, calleeFn?.file || '', calleeFn?.line || 0, 'callee', c.count, c.isStdLib);
      });
    if (calleeItems.length) {
      items.push(new SectionItem(`Calls (${calleeItems.length})`, calleeItems));
    } else {
      items.push(new LeafItem('Calls: (none)', 'leaf function', 'info'));
    }

    // Global refs used by this function
    const gRefs = this.fn.globalRefs || [];
    if (gRefs.length) {
      const gItems = gRefs.map(r => new RefItem(
        r.name,
        `${r.type}  line ${r.line}`,
        r.line, this.filePath,
        r.type === 'write' ? 'edit' :
        r.type === 'addr'  ? 'symbol-key' :
        r.type === 'arg'   ? 'symbol-parameter' : 'eye'
      ));
      items.push(new SectionItem(`Global refs (${gRefs.length})`, gItems));
    }

    return items;
  }
}

class FunctionItem extends vscode.TreeItem {
  constructor(funcName, filePath, line, role, db, depth, visited, callCount) {
    const fn = db.getFunction(funcName);
    super(funcName, fn ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.funcName = funcName;
    this.filePath = filePath || fn?.file || '';
    this.line = line || fn?.line || 0;
    this.role = role;
    this.db = db;
    this.depth = depth;
    this.visited = new Set(visited);
    this.callCount = callCount;

    const countStr = callCount > 1 ? ` ×${callCount}` : '';
    this.description = `${path.basename(this.filePath || '')} line ${this.line}${countStr}`;
    this.iconPath = new vscode.ThemeIcon(role === 'caller' ? 'arrow-up' : 'arrow-down');
    this.contextValue = 'cFunction';

    if (this.filePath && this.line) {
      this.command = {
        command: 'cThrough.jumpToFunction',
        title: 'Go to Definition',
        arguments: [this.filePath, this.line]
      };
    }
  }

  getChildren() {
    const fn = this.db.getFunction(this.funcName);
    if (!fn) return [];
    if (this.role === 'caller') {
      const callers = this.db.getCallers(this.funcName);
      return callers.map(c => new FunctionItem(c.caller, c.file, c.line, 'caller', this.db, this.depth+1, this.visited));
    } else {
      return fn.calls
        .filter(c => !c.isStdLib || vscode.workspace.getConfiguration('cThrough').get('showStdLib'))
        .map(c => new FunctionItem(c.name, c.file, c.line, 'callee', this.db, this.depth+1, this.visited, c.count));
    }
  }
}

class FunctionRefItem extends vscode.TreeItem {
  constructor(name, filePath, line, role, count, isStdLib) {
    super(name, vscode.TreeItemCollapsibleState.None);
    const countStr = count > 1 ? ` ×${count}` : '';
    this.description = filePath ? `${path.basename(filePath)} line ${line}${countStr}` : `stdlib${countStr}`;
    this.tooltip = isStdLib ? 'Standard library function' : `${filePath}:${line}`;
    this.iconPath = new vscode.ThemeIcon(
      isStdLib ? 'library' : (role === 'caller' ? 'arrow-up' : 'arrow-down')
    );
    this.contextValue = 'cFunctionRef';
    if (filePath && line) {
      this.command = {
        command: 'cThrough.jumpToFunction',
        title: 'Go to Definition',
        arguments: [filePath, line]
      };
    }
  }
}

class StructItem extends vscode.TreeItem {
  constructor(struct, filePath) {
    super(struct.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.struct = struct;
    this.filePath = filePath;
    this.description = `line ${struct.line} · ${struct.fields.length} fields`;
    this.iconPath = new vscode.ThemeIcon('symbol-struct');
    this.contextValue = 'cStruct';
    this.command = {
      command: 'cThrough.jumpToFunction',
      title: 'Go to Definition',
      arguments: [filePath, struct.line]
    };
  }
  getChildren() {
    return this.struct.fields.map(f => new LeafItem(`${f.name}`, f.type, 'symbol-field'));
  }
}

class LeafItem extends vscode.TreeItem {
  constructor(label, description, icon, line, filePath) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description || '';
    this.iconPath = new vscode.ThemeIcon(icon || 'circle-small-filled');
    if (line) this.tooltip = `Line ${line}`;
    if (line && filePath) {
      this.command = {
        command: 'cThrough.jumpToFunction',
        title: 'Go to Definition',
        arguments: [filePath, line]
      };
    }
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label, description, type) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new vscode.ThemeIcon(
      type === 'warning' ? 'warning' : type === 'info' ? 'info' : 'circle-slash'
    );
  }
}

module.exports = CTreeProvider;
