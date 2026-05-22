'use strict';
const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const CParser = require('./parser');
const AnalysisDB = require('./analysisDB');
const CTreeProvider = require('./treeProvider');
const TreeWebView = require('./treeWebView');
const CThroughCodeLensProvider = require('./codeLensProvider');
const DeadCodeReport = require('./deadCodeReport');

let db, parser, treeProvider, webView, codeLensProvider, deadCodeReport;
let lastScanRoot = undefined;

async function activate(context) {
  parser = new CParser();
  db = new AnalysisDB();
  treeProvider = new CTreeProvider(db);
  webView = new TreeWebView(context, db);
  deadCodeReport = new DeadCodeReport(context, db);

  // CodeLens provider
  codeLensProvider = new CThroughCodeLensProvider(db);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [{ language: 'c' }, { language: 'cpp' }],
      codeLensProvider
    )
  );

  const treeView = vscode.window.createTreeView('cThroughView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });

  // 1. Analyze current file
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.analyzeFile', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { vscode.window.showWarningMessage('No active editor.'); return; }
    if (!isCFile(editor.document.languageId)) { vscode.window.showWarningMessage('C/C++ files only.'); return; }
    await analyzeOneFile(editor.document.fileName, editor.document.getText());
    vscode.window.showInformationMessage(`C Through: Analyzed ${path.basename(editor.document.fileName)}`);
    treeProvider.showFileView(editor.document.fileName);
  }));

  // 2. Analyze entire workspace (no cap)
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.analyzeWorkspace', async () => {
    lastScanRoot = null;
    await runDirectoryScan(null);
  }));

  // 3. Analyze a specific directory — right-click on folder OR command palette
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.analyzeDirectory', async (folderUri) => {
    let dirPath;
    if (folderUri && folderUri.fsPath) {
      dirPath = folderUri.fsPath;
    } else {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        openLabel: 'Analyze This Directory',
        title: 'C Through — Choose directory to scan'
      });
      if (!picked || !picked.length) return;
      dirPath = picked[0].fsPath;
    }
    lastScanRoot = dirPath;
    await runDirectoryScan(dirPath);
  }));

  // 4. Re-scan last scope
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.rescan', async () => {
    if (lastScanRoot === undefined) {
      vscode.window.showInformationMessage('C Through: No previous scan. Run Analyze Workspace or Analyze Directory first.');
      return;
    }
    await runDirectoryScan(lastScanRoot);
  }));

  // 5–7. Show tree / callees / callers
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.showTree', async () => {
    await ensureCurrentFileAnalyzed();
    const fn = await getFunctionAtCursor() || await askFunctionName();
    if (fn) webView.show(fn, 'callees');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.showCallees', async (fnArg) => {
    await ensureCurrentFileAnalyzed();
    const fn = fnArg || await getFunctionAtCursor() || await askFunctionName();
    if (fn) webView.show(fn, 'callees');
  }));
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.showCallers', async (fnArg) => {
    await ensureCurrentFileAnalyzed();
    const fn = fnArg || await getFunctionAtCursor() || await askFunctionName();
    if (fn) webView.show(fn, 'callers');
  }));

  // Search sidebar
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.searchSidebar', async () => {
    const current = treeProvider.getFilter();
    const input = await vscode.window.showInputBox({
      placeHolder: 'Filter functions and globals by name…',
      prompt: 'C Through: Type to filter sidebar. Leave empty to clear.',
      value: current,
    });
    if (input === undefined) return; // user pressed Escape
    treeProvider.setFilter(input);
    if (input) {
      vscode.window.showInformationMessage(`C Through: Filtering by "${input}"`);
    }
  }));

  // Show Dead Code Report
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.showDeadCodeReport', async () => {
    deadCodeReport.show();
  }));

  // Toggle CodeLens on/off
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.toggleCodeLens', async () => {
    const cfg = vscode.workspace.getConfiguration('cThrough');
    const current = cfg.get('enableCodeLens', true);
    await cfg.update('enableCodeLens', !current, vscode.ConfigurationTarget.Global);
    codeLensProvider.refresh();
    vscode.window.showInformationMessage(`C Through: CodeLens ${!current ? 'enabled' : 'disabled'}`);
  }));

  // 8. Jump to source line
  context.subscriptions.push(vscode.commands.registerCommand('cThrough.jumpToFunction', async (filePath, line) => {
    if (!filePath) return;
    try {
      const doc = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch { vscode.window.showErrorMessage(`Cannot open: ${filePath}`); }
  }));

  // Auto-refresh single file on save (incremental — no full rescan)
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async doc => {
    const cfg = vscode.workspace.getConfiguration('cThrough');
    if (!cfg.get('autoRefresh') || !isCFile(doc.languageId)) return;
    if (isInScope(doc.fileName)) {
      await analyzeOneFile(doc.fileName, doc.getText());
      treeProvider.refresh();
    }
  }));

  // Switch sidebar to active file on editor change
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(async editor => {
    if (!editor || !isCFile(editor.document.languageId)) return;
    if (!db.files.has(editor.document.fileName))
      await analyzeOneFile(editor.document.fileName, editor.document.getText());
    treeProvider.showFileView(editor.document.fileName);
  }));

  // Analyze active file on startup
  const active = vscode.window.activeTextEditor;
  if (active && isCFile(active.document.languageId)) {
    await analyzeOneFile(active.document.fileName, active.document.getText());
    treeProvider.showFileView(active.document.fileName);
  }

  context.subscriptions.push(treeView);
  console.log('C Through: activated.');
}

// ── Core directory scan (no file cap) ────────────────────────────────────────
async function runDirectoryScan(dirPath) {
  const cfg = vscode.workspace.getConfiguration('cThrough');
  const includeGlob = cfg.get('includeGlob') || '**/*.{c,h,cpp,hpp}';
  const excludeGlob = cfg.get('excludeGlob') || '**/node_modules/**';
  const scopeLabel = dirPath ? path.basename(dirPath) : 'Workspace';

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `C Through: Scanning ${scopeLabel}…`,
    cancellable: true
  }, async (progress, token) => {

    // findFiles with no limit (undefined)
    let uris = await vscode.workspace.findFiles(includeGlob, excludeGlob, undefined, token);

    // Narrow to chosen directory if specified
    if (dirPath) {
      const norm = dirPath.replace(/\\/g, '/');
      uris = uris.filter(u => u.fsPath.replace(/\\/g, '/').startsWith(norm));
    }

    if (!uris.length) {
      vscode.window.showWarningMessage(`C Through: No C/C++ files found under "${scopeLabel}".`);
      return;
    }

    db.clear();
    let i = 0, errors = 0;

    for (const uri of uris) {
      if (token.isCancellationRequested) break;
      progress.report({
        message: `[${Math.round((i / uris.length) * 100)}%]  ${path.basename(uri.fsPath)}  (${i + 1}/${uris.length})`,
        increment: 100 / uris.length
      });
      try {
        const text = fs.readFileSync(uri.fsPath, 'utf8');
        db.addFile(parser.parseFile(text, uri.fsPath));
      } catch (e) { errors++; console.error('Parse error:', uri.fsPath, e.message); }
      i++;
    }

    const s = db.getStats();
    vscode.window.showInformationMessage(
      `C Through ✔  ${s.files} files · ${s.functions} functions · ${s.calls} calls` +
      (errors ? `  (${errors} errors)` : '')
    );
    treeProvider.refresh();
    codeLensProvider.refresh();
    if (deadCodeReport) deadCodeReport.refresh();
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isCFile(langId) { return ['c', 'cpp'].includes(langId); }

function isInScope(filePath) {
  if (lastScanRoot === null) return true;       // full workspace scan
  if (lastScanRoot === undefined) return false; // no scan yet
  return filePath.replace(/\\/g, '/').startsWith(lastScanRoot.replace(/\\/g, '/'));
}

async function analyzeOneFile(filePath, text) {
  try {
    db.removeFile(filePath);
    db.addFile(parser.parseFile(text, filePath));
    treeProvider.refresh();
    codeLensProvider.refresh();
  } catch (e) { console.error('analyzeOneFile:', e); }
}

async function ensureCurrentFileAnalyzed() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isCFile(editor.document.languageId)) return;
  if (!db.files.has(editor.document.fileName))
    await analyzeOneFile(editor.document.fileName, editor.document.getText());
}

async function getFunctionAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const range = editor.document.getWordRangeAtPosition(editor.selection.active);
  if (!range) return null;
  const word = editor.document.getText(range);
  return /^[A-Za-z_]\w*$/.test(word) ? word : null;
}

async function askFunctionName() {
  const all = db.getAllFunctions();
  if (!all.length) {
    vscode.window.showWarningMessage('No functions indexed yet. Run Analyze Workspace or Analyze Directory first.');
    return null;
  }
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const items = all.map(f => ({
    label: f.name,
    description: path.relative(wsRoot, f.file) + `:${f.line}`
  }));
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Type or select a function name…',
    matchOnDescription: true
  });
  return picked ? picked.label : null;
}

function deactivate() { db?.clear(); }
module.exports = { activate, deactivate };
