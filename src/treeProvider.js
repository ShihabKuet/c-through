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
  }

  refresh() {
    this._onDidChangeTreeData.fire();
  }

  setFilter(text) {
    this._filter = text.toLowerCase();
    this.refresh();
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
      items.push(new FileItem(filePath, fileData, db));
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
  constructor(filePath, fileData, db) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Expanded);
    this.filePath = filePath;
    this.fileData = fileData;
    this.db = db;
    this.tooltip = filePath;
    this.description = `${fileData.functions.length} functions`;
    this.iconPath = new vscode.ThemeIcon('symbol-file');
    this.contextValue = 'cFile';
  }

  getChildren() {
    const sections = [];

    // Includes section
    if (this.fileData.includes.length) {
      sections.push(new SectionItem('Includes', this.fileData.includes.map(inc =>
        new LeafItem(inc.file, inc.isSystem ? '<system>' : '"local"', 'symbol-file', inc.line)
      )));
    }

    // Structs/Types section
    if (this.fileData.structs.length) {
      sections.push(new SectionItem('Structs / Types', this.fileData.structs.map(s =>
        new StructItem(s, this.filePath)
      )));
    }

    // Macros section
    const fnMacros = this.fileData.macros.filter(m => m.isFunctionLike);
    const valMacros = this.fileData.macros.filter(m => !m.isFunctionLike);
    if (fnMacros.length) {
      sections.push(new SectionItem('Function Macros', fnMacros.map(m =>
        new LeafItem(`${m.name}(${m.params.join(', ')})`, m.body.slice(0, 40), 'symbol-misc', m.line)
      )));
    }
    if (valMacros.length) {
      sections.push(new SectionItem('Macros', valMacros.map(m =>
        new LeafItem(m.name, m.body.slice(0, 40), 'symbol-constant', m.line)
      )));
    }

    // Globals section
    if (this.fileData.globals.length) {
      sections.push(new SectionItem('Global Variables', this.fileData.globals.map(g =>
        new LeafItem(g.name, g.declaration.slice(0, 60), 'symbol-variable', g.line)
      )));
    }

    // Functions section
    sections.push(new SectionItem('Functions', this.fileData.functions.map(fn =>
      new FunctionDefItem(fn, this.filePath, this.db)
    )));

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
    if (callerItems.length) {
      items.push(new SectionItem(`Called by (${callerItems.length})`, callerItems));
    } else {
      items.push(new LeafItem('Called by: (none)', 'root function', 'info'));
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
  constructor(label, description, icon, line) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description || '';
    this.iconPath = new vscode.ThemeIcon(icon || 'circle-small-filled');
    if (line) this.tooltip = `Line ${line}`;
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
