#!/usr/bin/env node
var sys = require("sys");
var fs = require("fs");
var p = require('path');
var yaml = require('yaml');

function load(basename) {
  function _load(basename) {
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

function generate(basename) {
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
  return doc;
}

function main(args) {
  var basename = p.resolve(args[1]);
  var output = p.resolve(args[2]);

  fs.writeSync(fs.openSync(p.resolve(output),'w+'), generate(basename), 0, "utf8");
}

main(process.argv.slice(1));
