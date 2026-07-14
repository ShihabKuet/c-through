'use strict';

/**
 * CParser - Parses C source files to extract:
 *   - Function definitions
 *   - Function calls (callees)
 *   - Variable/struct references
 *   - Macro usage
 *   - #include dependencies
 *   - Global variable references (read, write, address-taken, extern)
 */
class CParser {
  constructor() {
    this.stdLibFunctions = new Set([
      'printf','fprintf','sprintf','snprintf','scanf','fscanf','sscanf',
      'malloc','calloc','realloc','free','memcpy','memset','memmove','memcmp',
      'strlen','strcpy','strncpy','strcat','strncat','strcmp','strncmp',
      'strstr','strchr','strtok','atoi','atof','atol','strtol','strtod',
      'fopen','fclose','fread','fwrite','fgets','fputs','fseek','ftell',
      'exit','abort','assert','sizeof','typeof',
      'sin','cos','tan','sqrt','pow','abs','fabs','ceil','floor',
      'pthread_create','pthread_join','pthread_mutex_lock','pthread_mutex_unlock'
    ]);
  }

  /**
   * Strip comments from C code (both // and block comments)
   */
  stripComments(code) {
    let result = '';
    let i = 0;
    while (i < code.length) {
      // Block comment
      if (code[i] === '/' && code[i+1] === '*') {
        const end = code.indexOf('*/', i + 2);
        if (end === -1) break;
        // Preserve newlines for line tracking
        const block = code.slice(i, end + 2);
        result += block.replace(/[^\n]/g, ' ');
        i = end + 2;
      }
      // Line comment
      else if (code[i] === '/' && code[i+1] === '/') {
        const end = code.indexOf('\n', i);
        if (end === -1) { i = code.length; break; }
        result += ' '.repeat(end - i);
        i = end;
      }
      // String literal - skip contents
      else if (code[i] === '"') {
        result += '"';
        i++;
        while (i < code.length && code[i] !== '"') {
          if (code[i] === '\\') { result += '  '; i += 2; }
          else { result += code[i] === '\n' ? '\n' : ' '; i++; }
        }
        result += '"';
        i++;
      }
      // Char literal
      else if (code[i] === "'") {
        result += "'";
        i++;
        while (i < code.length && code[i] !== "'") {
          if (code[i] === '\\') { result += '  '; i += 2; }
          else { result += ' '; i++; }
        }
        result += "'";
        i++;
      }
      else {
        result += code[i++];
      }
    }
    return result;
  }

  /**
   * Extract all #include directives
   */
  parseIncludes(code) {
    const includes = [];
    const re = /^#\s*include\s+[<"]([^>"]+)[>"]/gm;
    let m;
    while ((m = re.exec(code)) !== null) {
      includes.push({
        file: m[1],
        line: code.slice(0, m.index).split('\n').length,
        isSystem: m[0].includes('<')
      });
    }
    return includes;
  }

  /**
   * Extract macro definitions
   */
  parseMacros(code) {
    const macros = [];
    const re = /^#\s*define\s+([A-Za-z_]\w*)(?:\(([^)]*)\))?\s+(.+)?/gm;
    let m;
    while ((m = re.exec(code)) !== null) {
      macros.push({
        name: m[1],
        params: m[2] !== undefined ? m[2].split(',').map(p => p.trim()) : null,
        body: m[3] ? m[3].trim() : '',
        line: code.slice(0, m.index).split('\n').length,
        isFunctionLike: m[2] !== undefined
      });
    }
    return macros;
  }

  /**
   * Extract struct/typedef definitions
   */
  parseStructs(code) {
    const structs = [];
    // typedef struct { ... } Name;
    const re1 = /typedef\s+struct\s*(\w*)\s*\{([^}]*)\}\s*(\w+)\s*;/gs;
    let m;
    while ((m = re1.exec(code)) !== null) {
      structs.push({
        name: m[3],
        tag: m[1] || m[3],
        line: code.slice(0, m.index).split('\n').length,
        isTypedef: true,
        fields: this._parseStructFields(m[2])
      });
    }
    // struct Name { ... };
    const re2 = /\bstruct\s+(\w+)\s*\{([^}]*)\}/gs;
    while ((m = re2.exec(code)) !== null) {
      if (!structs.find(s => s.tag === m[1])) {
        structs.push({
          name: m[1],
          tag: m[1],
          line: code.slice(0, m.index).split('\n').length,
          isTypedef: false,
          fields: this._parseStructFields(m[2])
        });
      }
    }
    return structs;
  }

  _parseStructFields(body) {
    const fields = [];
    const lines = body.split(';').filter(l => l.trim());
    for (const line of lines) {
      const parts = line.trim().match(/(.+?)\b(\w+)(?:\[.*?\])?\s*$/);
      if (parts) {
        fields.push({ type: parts[1].trim(), name: parts[2] });
      }
    }
    return fields;
  }

  /**
   * Extract global variable declarations
   */
  parseGlobals(code, functionNames) {
    const globals = [];
    const fnSet = new Set(functionNames);

    // Match any file-scope variable declaration statement:
    // optional qualifiers + any type identifier + a comma-separated declarator list + semicolon.
    // The declarator list (group 2) is split afterwards so that multi-variable
    // declarations like `uint8_t a[100], b[100];` yield one global per name.
    const re = /^(?:(?:static|extern|const|volatile)\s+)*(?:(?:unsigned|signed|long|short|const)\s+)*(?:struct\s+|enum\s+|union\s+)?([A-Za-z_]\w*)\s+([^;\n]*?)\s*;/gm;

    // Skip keywords, function names, and typedef/struct/enum declarations
    const skip = new Set([
      'if','else','while','for','switch','do','return','typedef',
      'struct','enum','union','define','include','pragma','void'
    ]);

    let m;
    while ((m = re.exec(code)) !== null) {
      const typeName    = m[1];
      const declarators = m[2];
      const decl        = m[0].trim();

      if (skip.has(typeName)) continue;
      if (!typeName || !declarators) continue;
      // A declarator list containing a '(' at top level is a function prototype
      // or function pointer, not a plain variable — skip to avoid false matches.
      if (/\(/.test(declarators) && !/\[/.test(declarators)) continue;
      // A '{' before any initializer means this is a struct/union/enum body
      // (e.g. single-line `struct s { int a; };`), not a variable declaration.
      if (/\{/.test(declarators.split('=')[0])) continue;

      const line     = code.slice(0, m.index).split('\n').length;
      const isExtern = /\bextern\b/.test(decl);
      const isStatic = /\bstatic\b/.test(decl);

      for (const token of this._splitDeclarators(declarators)) {
        // Strip pointer stars, array subscripts and initializers to get the name
        const nameMatch = token.replace(/=[\s\S]*$/, '').match(/([A-Za-z_]\w*)\s*(?:\[[^\]]*\])*\s*$/);
        const varName = nameMatch ? nameMatch[1] : null;
        if (!varName) continue;
        if (fnSet.has(varName)) continue;
        if (skip.has(varName)) continue;

        globals.push({
          name: varName,
          type: typeName,
          line,
          declaration: decl,
          isExtern,
          isStatic
        });
      }
    }
    return globals;
  }

  /**
   * Split a declarator list on top-level commas, ignoring commas nested inside
   * brackets, braces or parentheses (e.g. array/struct initializers).
   */
  _splitDeclarators(list) {
    const tokens = [];
    let depth = 0, current = '';
    for (const ch of list) {
      if (ch === '[' || ch === '{' || ch === '(') depth++;
      else if (ch === ']' || ch === '}' || ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        tokens.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) tokens.push(current);
    return tokens.map(t => t.trim()).filter(Boolean);
  }

  /**
   * Given a line and the index just past a call's opening '(', return the first
   * argument's text and the index it starts at. Stops at the first top-level
   * comma or the matching ')'. Returns null if the argument list is empty.
   */
  _firstArg(line, openIdx) {
    let depth = 0, arg = '';
    let i = openIdx;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
      else if (c === ',' && depth === 0) break;
      arg += c;
    }
    return arg.trim() ? { arg, start: openIdx } : null;
  }

  /**
   * Extract all function definitions with their bodies
   */
  parseFunctions(cleanCode, originalCode) {
    const functions = [];
    // Match: [return_type] function_name([params]) {
    // Handles: static, inline, extern, pointer returns, etc.
    // The return-type base token is optional: types made entirely of qualifier
    // keywords (e.g. `unsigned long`, `long`, `short`) leave no base word, so
    // requiring one would steal the function name. When present it must be
    // separated from the name by whitespace or a pointer star, so a bare
    // identifier like `show_redirect` is never split.
    const headerRe = /^(?:[A-Z_][A-Z0-9_]*\s+)?(?:(?:static|inline|extern|const|volatile|__attribute__\s*\([^)]+\))\s+)*(?:(?:unsigned|signed|long|short|const)\s+)*(?:(?:struct|union|enum)\s+)?(?:\w+\s*\*+\s*|\w+\s+)?(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?:__attribute__\s*\([^)]+\)\s*)?\{/gm;
    let m;
    while ((m = headerRe.exec(cleanCode)) !== null) {
      const name = m[1];
      if (['if','else','while','for','switch','do'].includes(name)) continue;
      const bodyStart = m.index + m[0].length - 1;
      const body = this._extractBraceBlock(cleanCode, bodyStart);
      if (!body) continue;
      const lineNo = cleanCode.slice(0, m.index).split('\n').length;
      const params = this._parseParams(m[2]);
      const calls = this._extractCalls(body, name);
      const refs = this._extractVariableRefs(body);
      const complexity = this._cyclomaticComplexity(body);
      const isEntryPoint = this._isEntryPoint(name);
      const globalRefs = this._extractGlobalRefs(body, lineNo);
      // Names in scope inside this function (params + local declarations), used
      // to suppress false function-pointer references when a local shadows a
      // function of the same name (e.g. `int vty; fun2(vty);`).
      const localNames = this._extractLocalNames(body);
      for (const p of params) localNames.add(p.name);
      functions.push({
        name,
        line: lineNo,
        params,
        calls,
        refs,
        complexity,
        isEntryPoint,
        globalRefs,
        localNames: Array.from(localNames),
        bodyLength: body.split('\n').length,
        isStatic: m[0].startsWith('static'),
        returnType: m[0].slice(0, m[0].indexOf(name)).trim()
      });
    }
    return functions;
  }

  /**
   * Extract global variable name references found in a function body.
   * Classification happens later in analysisDB once all globals are known.
   * Stores raw line-level occurrences with enough context to classify.
   */
  _extractGlobalRefs(body, funcLine) {
    const rawRefs = [];
    const lines = body.split('\n');
    // Keywords that look like identifiers but are never variable references.
    const kw = new Set([
      'if','else','while','for','switch','do','return','sizeof','typeof',
      'case','default','goto','break','continue','const','static','volatile',
      'unsigned','signed','void','int','char','float','double','long','short',
      'struct','union','enum','NULL','true','false'
    ]);
    lines.forEach((line, idx) => {
      const absLine = funcLine + idx + 1;
      // Character positions already claimed by a write/addr occurrence, so the
      // read pass below does not double-count the same identifier occurrence.
      const claimed = new Set();
      let m;

      // Detect writes via library functions that write into their destination
      // argument, e.g. strcpy(dest,src) / memcpy(dest,...) / sprintf(dest,...).
      // Only the destination (first) argument is a write; source arguments are
      // reads and are already captured by the read pass below. Run first so the
      // destination position is claimed before the addr/read passes.
      const callRe = /\b([A-Za-z_]\w*)\s*\(/g;
      while ((m = callRe.exec(line)) !== null) {
        if (!CParser.DEST_WRITE_FNS.has(m[1])) continue;
        const dest = this._firstArg(line, m.index + m[0].length);
        if (!dest) continue;
        const base = dest.arg.replace(/^\s*&\s*/, '').match(/([A-Za-z_]\w*)/);
        if (!base) continue;
        rawRefs.push({ name: base[1], type: 'write', line: absLine });
        const pos = line.indexOf(base[1], dest.start);
        if (pos >= 0) claimed.add(pos);
      }
      // Detect address-taken: &identifier
      const addrRe = /&\s*([A-Za-z_]\w*)\b/g;
      while ((m = addrRe.exec(line)) !== null) {
        const start = m.index + m[0].indexOf(m[1]);
        if (claimed.has(start)) continue;
        rawRefs.push({ name: m[1], type: 'addr', line: absLine });
        claimed.add(start);
      }
      // Detect writes: identifier = / identifier += / identifier++ / --identifier
      const writeRe = /\b([A-Za-z_]\w*)\s*(?:\+\+|--|(?:[+\-*\/%&|^]=|=(?!=)))/g;
      while ((m = writeRe.exec(line)) !== null) {
        rawRefs.push({ name: m[1], type: 'write', line: absLine });
        claimed.add(m.index);
      }
      // Detect writes through a subscript/member lvalue chain, e.g.
      //   arr[i] = ...      students[6].age = ...      obj.field = ...
      //   p->next->val = ...   arr[i]++
      // The base identifier is the write target; without this it would be
      // mis-counted as a read by the pass below.
      const subWriteRe = /\b([A-Za-z_]\w*)\s*(?:\[[^\]]*\]|\.\w+|->\w+)+\s*(?:\+\+|--|<<=|>>=|[+\-*\/%&|^]=|=(?!=))/g;
      while ((m = subWriteRe.exec(line)) !== null) {
        rawRefs.push({ name: m[1], type: 'write', line: absLine });
        claimed.add(m.index);
      }
      const preWriteRe = /(?:\+\+|--)\s*([A-Za-z_]\w*)\b/g;
      while ((m = preWriteRe.exec(line)) !== null) {
        const start = m.index + m[0].indexOf(m[1]);
        rawRefs.push({ name: m[1], type: 'write', line: absLine });
        claimed.add(start);
      }
      // Detect reads/compares: any remaining identifier that is not a write
      // target, not a member access (a.b / a->b), and not a function call.
      // Non-global names are filtered out later against the known-globals set.
      const idRe = /([A-Za-z_]\w*)/g;
      while ((m = idRe.exec(line)) !== null) {
        const name = m[1];
        const start = m.index;
        if (claimed.has(start)) continue;
        if (kw.has(name)) continue;
        // Skip member fields: preceded by '.' or '->'
        if (/(?:\.|->)\s*$/.test(line.slice(0, start))) continue;
        // Skip function calls: immediately followed by '('
        if (/^\s*\(/.test(line.slice(start + name.length))) continue;
        rawRefs.push({ name, type: 'read', line: absLine });
      }
    });
    return rawRefs;
  }

  /**
   * Collect candidate function-pointer references across the whole file:
   * identifiers that appear in a value position (struct/array initializer
   * elements, call arguments, assignment RHS, address-of) and are NOT direct
   * calls. These reveal functions registered in command/dispatch tables or
   * handed to task-creation / callback-registration APIs — which therefore have
   * no direct callers. Names are filtered against the real function set in
   * analysisDB, so collecting broadly here is safe.
   */
  /**
   * Extract names of local variables declared in a function body. Used to
   * suppress false function-pointer references where a local shadows a function
   * of the same name. Matches `TYPE [*] name [, name2 …] [= …];` declarations,
   * skipping statements led by a control keyword (e.g. `return x;`).
   */
  _extractLocalNames(body) {
    const names = new Set();
    const skipType = new Set([
      'return','if','else','while','for','switch','do','goto','sizeof',
      'typedef','case','break','continue'
    ]);
    const re = /^[ \t]*((?:(?:static|const|volatile|register|auto|unsigned|signed|long|short)\s+)*(?:struct\s+|union\s+|enum\s+)?[A-Za-z_]\w*)\s+((?:\*\s*)*[A-Za-z_]\w*(?:\s*\[[^\]]*\])?(?:\s*,\s*(?:\*\s*)*[A-Za-z_]\w*(?:\s*\[[^\]]*\])?)*)\s*(?:=[^;]*)?;/gm;
    let m;
    while ((m = re.exec(body)) !== null) {
      const firstTypeWord = m[1].trim().split(/\s+/)[0];
      if (skipType.has(firstTypeWord)) continue;
      for (const tok of this._splitDeclarators(m[2])) {
        const nm = tok.replace(/=.*$/, '').match(/([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*$/);
        if (nm) names.add(nm[1]);
      }
    }
    return names;
  }

  _extractFuncRefs(clean, functions) {
    const refs = [];
    const seen = new Set();
    // Per-function scopes: line span + names in scope (params + locals). A use of
    // a name inside a function that declares it locally is that local variable,
    // not a reference to a same-named function, so it is suppressed.
    const scopes = (functions || []).map(fn => ({
      start: fn.line,
      end: fn.line + fn.bodyLength + 2,
      names: new Set(fn.localNames || [])
    }));
    const shadowed = (name, absLine) =>
      scopes.some(s => absLine >= s.start && absLine <= s.end && s.names.has(name));
    const lines = clean.split('\n');
    lines.forEach((line, idx) => {
      const absLine = idx + 1;
      const idRe = /([A-Za-z_]\w*)/g;
      let m;
      while ((m = idRe.exec(line)) !== null) {
        const name = m[1];
        const start = m.index;
        const end = start + name.length;
        // Skip direct calls (name followed by '(') and member fields (a.b / a->b)
        if (/^\s*\(/.test(line.slice(end))) continue;
        if (/(?:\.|->)\s*$/.test(line.slice(0, start))) continue;
        // Skip uses of a local/parameter that shadows a same-named function
        if (shadowed(name, absLine)) continue;
        const before = line.slice(0, start).replace(/\s+$/, '');
        const after  = line.slice(end).replace(/^\s+/, '');
        // Skip declarations: `TYPE name` / `TYPE *name` is a declared variable or
        // parameter, not a value reference (e.g. `int vty` in a prototype). These
        // are recognised by the preceding text ending in an identifier character
        // once any pointer stars are removed. `return X` is a value, not a decl.
        const beforeNoStar = before.replace(/[*\s]+$/, '');
        if (/\w$/.test(beforeNoStar) && !/\breturn$/.test(beforeNoStar)) continue;
        // Keep only value positions: preceded by , { ( = & [ : ? (or `return`),
        // or starting a line (multi-line initializer / arg-list continuation),
        // or immediately followed by , ) } ;
        const prev = before.slice(-1);
        const next = after.slice(0, 1);
        const prevValue = before === '' || ',{(=&[:?'.includes(prev) || /\breturn$/.test(before);
        const nextValue = ',)};'.includes(next);
        if (!prevValue && !nextValue) continue;
        const key = name + '@' + absLine;
        if (seen.has(key)) continue;
        seen.add(key);
        refs.push({ name, line: absLine });
      }
    });
    return refs;
  }

  _extractBraceBlock(code, startBrace) {
    let depth = 0, i = startBrace;
    let start = -1;
    while (i < code.length) {
      if (code[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (code[i] === '}') {
        depth--;
        if (depth === 0) return code.slice(start + 1, i);
      }
      i++;
    }
    return null;
  }

  _parseParams(paramStr) {
    if (!paramStr.trim() || paramStr.trim() === 'void') return [];
    return paramStr.split(',').map(p => {
      p = p.trim();
      const namePart = p.match(/(\w+)\s*(?:\[[^\]]*\])?\s*$/);
      return { raw: p, name: namePart ? namePart[1] : p };
    }).filter(p => p.name !== 'void');
  }

  _extractCalls(body, selfName) {
    const calls = new Map();
    // Match: identifier( — but not: if(, while(, for(, etc.
    const re = /\b([A-Za-z_]\w*)\s*\(/g;
    const keywords = new Set(['if','else','while','for','switch','do','return','sizeof','typeof','__attribute__']);
    let m;
    while ((m = re.exec(body)) !== null) {
      const name = m[1];
      if (keywords.has(name) || name === selfName) continue;
      if (!calls.has(name)) calls.set(name, 0);
      calls.set(name, calls.get(name) + 1);
    }
    return Array.from(calls.entries()).map(([name, count]) => ({ name, count, isStdLib: this.stdLibFunctions.has(name) }));
  }

  /**
   * Cyclomatic complexity = 1 + number of decision points in function body.
   * Decision points: if, else if, for, while, do, case, &&, ||, ?
   */
  _cyclomaticComplexity(body) {
    const decisionRe = /(if|else\s+if|for|while|do|case)|(\?\s*[^:])|(&&|\|\|)/g;
    let count = 1;
    let m;
    while ((m = decisionRe.exec(body)) !== null) count++;
    return count;
  }

  /**
   * Heuristic: is this function a known entry point?
   * These are expected to have 0 callers and should NOT be flagged as dead code.
   */
  _isEntryPoint(name) {
    return /^(main|app_main|startup|reset_handler|hardfault_handler|.*_irqhandler|.*_isr|.*_handler|.*_task|.*_thread|test_.*|setup|loop|init|vApplicationIdleHook|vApplicationTickHook)$/i.test(name);
  }

  _extractVariableRefs(body) {
    // Extract identifiers that look like variables (uppercase likely macros/enums)
    const re = /\b([A-Za-z_]\w*)\b/g;
    const keywords = new Set(['int','char','float','double','void','if','else','while','for',
      'return','static','const','struct','typedef','unsigned','signed','long','short',
      'NULL','true','false','sizeof','switch','case','break','continue','do','goto']);
    const refs = new Set();
    let m;
    while ((m = re.exec(body)) !== null) {
      const id = m[1];
      if (!keywords.has(id) && /^[A-Z_][A-Z0-9_]+$/.test(id)) {
        refs.add(id); // likely macro/enum constant
      }
    }
    return Array.from(refs);
  }

  /**
   * Full parse of a C file
   */
  parseFile(code, filePath) {
    const clean = this.stripComments(code);
    const includes = this.parseIncludes(code);
    const macros = this.parseMacros(code);
    const structs = this.parseStructs(clean);
    const functions = this.parseFunctions(clean, code);
    const funcNames = functions.map(f => f.name);
    const globals = this.parseGlobals(clean, funcNames);
    const funcRefs = this._extractFuncRefs(clean, functions);

    // Build callers map (reverse of callees)
    const callers = new Map();
    for (const fn of functions) {
      for (const call of fn.calls) {
        if (!callers.has(call.name)) callers.set(call.name, []);
        callers.get(call.name).push({ caller: fn.name, count: call.count });
      }
    }

    // Annotate functions with their callers
    for (const fn of functions) {
      fn.callers = callers.get(fn.name) || [];
    }

    // Filter globalRefs to only include known global variable names
    // This is done post-parse so parseFunctions() remains a single pass
    const globalNameSet = new Set(globals.map(g => g.name));
    const skipWords = new Set(['if','else','while','for','switch','do','return',
      'int','char','float','double','void','NULL','true','false','sizeof']);
    for (const fn of functions) {
      if (fn.globalRefs) {
        fn.globalRefs = fn.globalRefs.filter(r =>
          globalNameSet.has(r.name) && !skipWords.has(r.name)
        );
      }
    }

    return { filePath, includes, macros, structs, globals, functions, funcRefs };
  }
}

// Standard library functions that write into their first (destination)
// argument. A global passed there is a write, not a read.
CParser.DEST_WRITE_FNS = new Set([
  'strcpy','strncpy','strcat','strncat','strlcpy','strlcat',
  'memcpy','memmove','memset','bzero',
  'sprintf','snprintf','vsprintf','vsnprintf',
  'fgets','gets','fread'
]);

module.exports = CParser;
