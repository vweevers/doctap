#!/usr/bin/env node
'use strict';

const argv = require('minimist')(process.argv.slice(2), {
  '--': true,
  alias: {
    v: 'version',
    h: 'help',
    c: 'cwd'
  }
})

if (argv.version) {
  console.log('doctap', require('./package.json').version)
  process.exit()
}

if (argv.help) {
  console.log('doctap [file, ..]')
  process.exit()
}

const glob = require('glob')
    , normalize = require('path').normalize
    , doctap = require('.')

resolvePatterns(argv._, argv.cwd || process.cwd(), (err, files) => {
  if (err) throw err

  const opts = argv
  const maps = opts.maps = new Map

  // Rewrite stack traces
  require('source-map-support').install({
    environment: 'node',
    handleUncaughtExceptions: false,
    retrieveSourceMap: function (source) {
      return maps.get(source) || null
    }
  })

  // Make everything after '--' available to snippets
  process.argv = process.argv.slice(0, 2).concat(argv.__)

  doctap(files, opts)
})

function resolvePatterns (patterns, cwd, done) {
  const unique = new Set
  const stack = patterns.length ? patterns.slice() : ['readme.md']

  ;(function next () {
    glob(stack.shift(), { cwd, absolute: true }, (err, files) => {
      if (err) return done(err)
      for(let file of files) unique.add(normalize(file))
      stack.length ? next() : done(null, unique)
    })
  })()
}
