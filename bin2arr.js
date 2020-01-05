#!/usr/bin/env node
const fs = require("fs");
const buf = fs.readFileSync(process.argv[2]);
const extbuf = new Buffer(buf.length + 4);
buf.copy(extbuf);
var out = [];

for (var i = 0; i < buf.length; i += 4)
    out.push(extbuf.readUInt32BE(i));

process.stdout.write(JSON.stringify(out) + "\n");
