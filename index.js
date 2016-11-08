'use strict';

const fs = require('fs')
    , vm = require('vm')
    , transform = require('./lib/transform')
    , asif = require('./lib/as-if')

const { relative, dirname, basename, extname, join } = require('path')
    , { SourceMapConsumer, SourceMapGenerator } = require('source-map')
    , { extractCodeBlocks } = require('standard-markdown/lib/codeBlockUtils')

module.exports = function doctap (files, opts) {
  opts = opts || {}

  const maps = opts.maps || new Map
  const cwd = opts.cwd || process.cwd()

  for(let mdpath of files) {
    const title = relative(cwd, mdpath)
        , markdown = fs.readFileSync(mdpath, 'utf8')
        , basedir = dirname(mdpath)
        , stem = basename(mdpath, extname(mdpath))
        , semiglobal = { }

    extractCodeBlocks(markdown).forEach(block => {
      const line = block.line + 1
          , res = transform(title + ':' + line, mdpath, block.code, semiglobal)
          , map = expandMap(res.map, line, markdown)

      const MODULE = {
        filename: join(basedir, `${stem}${line}.js`),
        exports: {},
        id: '.'
      }

      // Remember the map for source-map-support
      maps.set(MODULE.filename, { url: mdpath, map })

      const run = vm.runInThisContext(res.code, {
        filename: MODULE.filename,
        displayErrors: true
      })

      const REQUIRE = asif(basedir)

      // TODO: move semiglobal initialization to the
      // generated code, then separate the module wrapper
      run ( MODULE.exports
          , REQUIRE
          , MODULE
          , MODULE.filename
          , basedir
          , semiglobal )
    })
  }
}

function expandMap (map, offset, sourceContent) {
  const gen = new SourceMapGenerator({ file: map.file })

  new SourceMapConsumer(map).eachMapping(m => {
    gen.addMapping({
      source: m.source,
      original: {
        line: m.originalLine + offset,
        column: m.originalColumn
      },
      generated: {
        line: m.generatedLine,
        column: m.generatedColumn
      }
    })
  })

  map = gen.toJSON()
  map.sourcesContent = [sourceContent]

  return map
}
