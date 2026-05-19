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
        params: m[2] ? m[2].split(',').map(p => p.trim()) : null,
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

    // Match any file-scope variable declaration:
    // optional qualifiers + any type identifier + optional pointer + name + optional array + optional init + semicolon
    const re = /^(?:(?:static|extern|const|volatile)\s+)*(?:(?:unsigned|signed|long|short|const)\s+)*(?:struct\s+|enum\s+|union\s+)?([A-Za-z_]\w*)\s*\*?\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\])*\s*(?:=\s*[^;]+)?;/gm;

    let m;
    while ((m = re.exec(code)) !== null) {
      const typeName = m[1];
      const varName  = m[2];
      const decl     = m[0].trim();

      // Skip keywords, function names, and typedef/struct/enum declarations
      const skip = new Set([
        'if','else','while','for','switch','do','return','typedef',
        'struct','enum','union','define','include','pragma','void'
      ]);
      if (skip.has(typeName)) continue;
      if (fnSet.has(varName)) continue;
      if (!varName || !typeName) continue;

      globals.push({
        name: varName,
        type: typeName,
        line: code.slice(0, m.index).split('\n').length,
        declaration: decl,
        isExtern: /\bextern\b/.test(decl),
        isStatic: /\bstatic\b/.test(decl)
      });
    }
    return globals;
  }

  /**
   * Extract all function definitions with their bodies
   */
  parseFunctions(cleanCode, originalCode) {
    const functions = [];
    // Match: [return_type] function_name([params]) {
    // Handles: static, inline, extern, pointer returns, etc.
    const headerRe = /^(?:(?:static|inline|extern|const|volatile|__attribute__\s*\([^)]+\))\s+)*(?:(?:unsigned|signed|long|short|const)\s+)*(?:(?:struct|union|enum)\s+)?\w+\s*\*?\s*(\w+)\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)\s*(?:__attribute__\s*\([^)]+\)\s*)?\{/gm;
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
      functions.push({
        name,
        line: lineNo,
        params,
        calls,
        refs,
        complexity,
        isEntryPoint,
        globalRefs,
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
    lines.forEach((line, idx) => {
      const absLine = funcLine + idx + 1;
      // Detect address-taken: &identifier
      const addrRe = /&\s*([A-Za-z_]\w*)\b/g;
      let m;
      while ((m = addrRe.exec(line)) !== null) {
        rawRefs.push({ name: m[1], type: 'addr', line: absLine });
      }
      // Detect writes: identifier = / identifier += / identifier++ / ++identifier
      const writeRe = /\b([A-Za-z_]\w*)\s*(?:\+\+|--|(?:[+\-*\/%&|^]=|=(?!=)))/g;
      while ((m = writeRe.exec(line)) !== null) {
        rawRefs.push({ name: m[1], type: 'write', line: absLine });
      }
      const preWriteRe = /(?:\+\+|--)\s*([A-Za-z_]\w*)\b/g;
      while ((m = preWriteRe.exec(line)) !== null) {
        rawRefs.push({ name: m[1], type: 'write', line: absLine });
      }
    });
    return rawRefs;
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

    return { filePath, includes, macros, structs, globals, functions };
  }
}

module.exports = CParser;
