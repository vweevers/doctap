'use strict';

const { resolve, parse, sep, dirname } = require('path')

module.exports = function* up (dir, filename) {
  dir = resolve(dir)
  const root = parse(dir).root

  while (dir !== root) {
    yield filename ? dir + sep + filename : dir
    dir = dirname(dir)
  }

  yield filename ? root + filename : root
}
