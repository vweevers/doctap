'use strict';

// TODO: module as-if
const path = require('path')
    , fs = require('fs')
    , up = require('./path-up-generator')
    , makeRequire = require('./make-require')

// Steal dependencies from other packages
module.exports = function asif (from) {
  if (from && from !== '.' && from === path.basename(from)) {
    // It's a package
    const fp = require.resolve(from + path.sep + 'package.json')
    const basedir = path.dirname(fp)
    const name = require(fp).name

    return makeRequire(basedir, name)
  } else {
    // It's a path
    const basedir = path.resolve(from)
    const name = findName(basedir)

    return makeRequire(basedir, name)
  }
}

function findName (basedir) {
  for(let fp of up(basedir, 'package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(fp, 'utf8'))
      return pkg.name
    } catch (err) {
      if (err.code !== 'ENOENT') {
        err.path = fp
        throw err
      }
    }
  }
}
