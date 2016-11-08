'use strict';

const __require = require
    , __resolve = require('resolve').sync

module.exports = function makeRequire (basedir, packageName) {
  function require (id) {
    return __require(resolve(id))
  }

  function resolve (id) {
    if (id && id === packageName) id = '.'
    return __resolve(id, { basedir })
  }

  require.resolve = resolve
  require.extensions = __require.extensions
  require.cache = __require.cache

  return require
}
