#!/usr/bin/env node
var sys = require("sys");
var fs = require("fs");
var p = require('path');
var yaml = require('yaml');

function load(basename) {
  function _load(basename) {
    fs.readFile(basename, 'utf-8', function(err, rs) {});
    var raw = fs.readFileSync(basename, 'utf-8');
    var lines = raw.split('\n');
    var buffer = '';
    var offset = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('# ') === 0) {
        offset += lines[i].length + 1;
        buffer += '  ' + lines[i].substring(2) + '\n';
      } else {
        break;
      }
    }
    return {
      meta: buffer ? yaml.eval('---\n' + buffer) : {}
      , raw: raw.substring(offset)
    };
  }

  return {
    request: _load(basename)
    , response: _load(basename.replace('req.spec', 'res.spec'))
  };
}

function addLine(doc, value) {
  return doc + value + '\n';
}

function addLines(doc, values) {
  return doc + values.join('\n') + '\n';
}

function tableInit(headColumns, columns) {
  var maxColumns = [];
  var columnIdByName = {};
  for (var i in headColumns) {
    maxColumns[i] = headColumns[i].length;
    columnIdByName[columns[i]] = i;
  }
  return {
    header: headColumns
    , columns: columns
    , columnIdByName: columnIdByName
    , rows: []
    , maxColumns: maxColumns
  };
}

function realLength(value) {
  var length = value.length;
  for (var i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) > 128) {
      length++;
    }
  }
  return length;
}

function tableRows(table, rows) {
  table.rows = rows;
  for (var i in rows) {
    var row = rows[i];
    for (var j in table.columns) {
      var name = table.columns[j];
      var value = (typeof(row[name]) == 'string' ? row[name] : '');
      var length = realLength(value);
      table.maxColumns[j] = Math.max(table.maxColumns[j], length);
    }
  }
  return table;
}

function generateTable(table) {
  function pad(text, length, char) {
    char = char ? char : ' ';
    text = typeof(text) == 'string' ? text : '';
    var space = "";
    for (var i = 0; i < length - (text && text.length ? realLength(text) : 0); i++) {
      space += char;
    }
    return text + space; 
  };

  function add(buf, row) {
    var line = '|';
    for (var i in table.columns) {
      line += pad(row[table.columns[i]], table.maxColumns[i], ' ') + '|';
    }
    return buf + '\n' + line + '\n';
  };
  var line = '+';
  var headline = '+';
  for (var i in table.header) {
    line += pad('', table.maxColumns[i], '-') + '+';
    headline += pad('', table.maxColumns[i], '=') + '+';
  }

  var buf = line;
  var head = '|';
  for (var i in table.header) {
    head += pad(table.header[i], table.maxColumns[i], ' ') + '|';
  }
  buf += '\n' + head + '\n' + headline;
  for (var i in table.rows) {
    var row = table.rows[i];
    buf = add(buf, row) + line;
  }

  return buf;
}

function generateRST(basename, map) {
  var meta = load(basename);
  var doc = '';
  
  var req = meta.request.meta;
  var res = meta.response.meta;

  if (req) {
    doc = addLine(doc, [req.method, req.uri].join(' '));
    doc = addLines(doc, ['================================================================', ''])
    doc = addLines(doc, [req.description, '']);
    doc = addLines(doc, ['Request', '--------', '']);

    doc = addLines(doc, [['**', req.method, ' ', req.uri, '**'].join(''), '']);
    
    if (req.variables) {
      doc = addLines(doc, ['', '**Path Variables**', '']);
      for (var i in req.variables) {
        if (i == 0) continue;
        req.variables[i].name = '*:' + i + '*';
        req.variables[i]._description = '**' + req.variables[i].type + '**; ' + typeof(req.variables[i].description) == 'string' ? req.variables[i].description : '';
      }
      var table = tableInit(['Name', 'Description'], ['name', '_description']);
      tableRows(table, req.variables);
      doc = addLine(doc, generateTable(table));
    }

    if (req.queries) {
      doc = addLines(doc, ['', '**Request Parameters**', '']);
      for (var i in req.queries) {
        req.queries[i].name = i;
        req.queries[i].required = req.queries[i].required ? 'Required' : 'Optional';
      }
      var table = tableInit(["Name", "Type", "Description", "Required?", "Default"], ["name", "type", "description", "required", "default"]);
      tableRows(table, req.queries);
      doc = addLine(doc, generateTable(table));
    }
    if (req.headers) {
      doc = addLines(doc, ['', '**Request Headers**', '']);
      for (var i in req.headers) {
        req.headers[i].name = i;
        req.headers[i].mandatory = req.headers[i].mandatory ? 'Yes' : 'No';
      }     
      var table = tableInit(["Name", "Type", "Description", "Mandatory", "Default"], ["name", "type", "description", "mandatory", "default"]);
      tableRows(table, req.headers);
      doc = addLine(doc, generateTable(table));
    }

    function indent(raw) {
      var lines = raw.trim().split('\n');
      var block = '.. code-block:: javascript\n   :linenos:\n\n';
      for (var i in lines) {
        block += '    ' + lines[i] + '\n';
      }
      return block;
    }

    doc = addLines(doc, ['', '**Spec**', '', '', indent(meta.request.raw), '', '']);

    doc = addLines(doc, ['', 'Response', '--------', '']);
    doc = addLines(doc, ['', '**Spec**', '', '', indent(meta.response.raw), '', '']);
  }

  var i = 0;
  for (; i < basename.length; i++) {
    if (map.length <= i || basename[i] != map[i]) {
      break;
    }
  }
  var path = basename.substring(basename.indexOf("/", i+1), basename.length - 9);
  var variables = [];
  var url = req.uri;
  for (var i in (req.variables||{})) {
    variables.push(i)
  }
  url = url.replace(/\/:([a-zA-Z0-9_]+)?/g, '/{$1}');
  var obj = {
    req: {type: req.method, url: url, schema: path+'.req', named: variables}
    , res: {schema: path+'.res'}
  };
  fs.writeFileSync(map + "/" + req.action, JSON.stringify(obj, null, 2), "utf8");
  return doc;
}

function generate(basename, map) {
  var meta = load(basename);
  var doc = '';
  
  var req = meta.request.meta;
  var res = meta.response.meta;

  doc = addLines(doc, ['{toc}', '']);
  if (req) {
    doc = addLine(doc, ['h1.',  req.method, req.uri].join(' '));
    doc = addLines(doc, [req.description, '']);
    doc = addLines(doc, ['h2. Request', '']);
    doc = addLine(doc, ['||', req.method, '|| ', req.uri, '||'].join(' '));
    if (req.variables) {
      for (var i in req.variables) {
        v = req.variables[i];
        doc = addLine(doc, ['||', ':'+i, '|', '*'+v.type+'*,', v.description, '|'].join(' '));
      }
      doc = addLine(doc, '');
    }
    doc = addLines(doc, ['h3. Request Parameters', '']);
    if (req.queries) {
      doc = addLines(doc, ['|| Name || Type || Description || Required? || Default ||']);
      for (var i in req.queries) {
        var v = req.queries[i];
        doc = addLine(doc, ['|', i, '|', v.type||'', '|',
          v.description||'', '|', v.required==true?'Required':'Optional', '|', v.default==null?'None':v.default, '|'].join(' '));
      }
      doc = addLine(doc, '');
    }
    doc = addLines(doc, ['h3. Request Headers', '']);
    if (req.headers) {
      doc = addLines(doc, ['|| Name || Type || Description || Mandatory || Default ||']);
      for (var i in req.headers) {
        var v = req.headers[i];
        doc = addLine(doc, ['|', i, '|', v.type||'', '|',
          v.description||'', '|', v.mandatory||'', '|', v.default||'', '|'].join(' '));
      }
      doc = addLine(doc, '');
    }
    doc = addLines(doc, ['h3. Spec', '', '{code:language=javascript}', meta.request.raw.trim(), '{code}', '']);

    doc = addLines(doc, ['h2. Response', '']);
    doc = addLines(doc, ['h3. Spec', '', '{code:language=javascript}', meta.response.raw.trim(), '{code}', '']);
  }

  var i = 0;
  for (; i < basename.length; i++) {
    if (map.length <= i || basename[i] != map[i]) {
      break;
    }
  }
  var path = basename.substring(basename.indexOf("/", i+1), basename.length - 9);
  var variables = [];
  var url = req.uri;
  for (var i in (req.variables||{})) {
    variables.push(i)
  }
  url = url.replace(/\/:([a-zA-Z0-9_]+)?/g, '/{$1}');
  var obj = {
    req: {type: req.method, url: url, schema: path+'.req', named: variables}
    , res: {schema: path+'.res'}
  };
  fs.writeFileSync(map + "/" + req.action, JSON.stringify(obj, null, 2), "utf8");
  return doc;
}

function main(args) {
  if (args[1] == "wiki") {
    var basename = p.resolve(args[2]);
    var output = p.resolve(args[3]);
    var map = p.resolve(args[4]);
    fs.writeFileSync(p.resolve(output), generateRST(basename, map), "utf8");
  } else if (args[1] == "map") {
    var map = p.resolve(args[2]);
    var files = fs.readdirSync(map);
    var output = {};
    for (var i in files) {
      output[files[i]] = JSON.parse(fs.readFileSync(map+"/"+files[i], "utf8"));
    }
    fs.writeFileSync(p.resolve(args[3]), JSON.stringify(output, null, 2), "utf8");
  }
}

main(process.argv.slice(1));
