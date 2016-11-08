'use strict';

const j = require('jscodeshift')
    , recast = require('./as-if')('jscodeshift')('recast')

// NOTE
// Using j.template would make the code below way easier
// to read, but after many random errors I dropped it.

module.exports = function transform (...args) {
  return new Transformer(...args).transform()
}

class Transformer {
  constructor(testName, filename, source, semiglobal) {
    this.testName = testName
    this.ast = j(source, { sourceFileName: filename })
    this.semiglobal = semiglobal
    this.semiExports = new Set
    this.semiImports = new Set
    this.id = identifierFactory(this.ast, this.semiImports)
    this.counters = []
    this.planned = 0
  }

  transform() {
    this.generateAssertions()
    this.exportSemiglobals()
    this.wrapModule()

    return recast.print(this.ast.paths()[0], {
      quote: 'single',
      lineTerminator: '\n',
      sourceMapName: 'map.json'
    })
  }

  generateAssertions() {
    this.ast.find(j.CallExpression).filter(isLogCall).filter(hasArguments).forEach(path => {
      const comment = findComment(path)
      if (!comment) return

      const actualArgs = path.node.arguments
          , expected = parseComment(comment)
          , steps = expected.length

      this.planned+= steps

      const counter = this.id('it', this.counters.length)
      this.counters.push(counter.name)

      // We're replacing line 2 of the following example with an
      // assertion that is expected to be called twice, once
      // with value 2, once with value 4.
      //
      //    ---
      //    for(let n of [2, 4]) {
      //      console.log(n) // 2, 4
      //    }
      //    ```
      const actualArg = actualArgs.length > 1
          ? callExpression([this.id('util'), 'format'], actualArgs)
          : actualArgs[0]

      j(path).replaceWith(
        // Wrap in a block scope to prevent conflicts
        j.blockStatement([
          j.variableDeclaration('const', [
            j.variableDeclarator(this.id('it'), j.updateExpression('++', counter, false)),
            j.variableDeclarator(this.id('prefix'), this.messagePrefix(actualArgs)),
            j.variableDeclarator(this.id('suffix'), this.messageSuffix(steps)),
            j.variableDeclarator(this.id('actual'), actualArg)
          ]),

          this.buildIfStatement(steps, expected)
        ])
      )
    })
  }

  buildIfStatement (steps, expected) {
    // If assert is called too many times, do t.same(actual, undefined)
    // TODO: or fail with "called too many times" message?
    const stack = expected.concat([j.identifier('undefined')])

    // Iterate in reverse to build "if .. else if .. else"
    return stack.reverse().reduce((alternate, expected, i) => {
      const step = steps - i
          , msg = this.message(' == ' + compactSource(expected), step, steps)

      const consequent = j.blockStatement([
        callStatement([this.id('t'), 'same'], [this.id('actual'), expected, msg])
      ])

      if (alternate) {
        return j.ifStatement(
          j.binaryExpression('===', this.id('it'), j.literal(step)),
          consequent,
          alternate
        )
      } else {
        return consequent
      }
    }, null)
  }

  message (msg, step, steps) {
    // Don't add suffix to single iteration
    if (steps < 2 && step === 0) {
      var main = j.literal(msg)
    } else {
      main = j.binaryExpression('+', j.literal(msg), this.id('suffix'))
    }

    return j.binaryExpression('+', this.id('prefix'), main)
  }

  messagePrefix (actualArgs) {
    return j.literal(actualArgs.map(a => j(a).toSource()).join(', '))
  }

  messageSuffix (steps) {
    const open = `  `
        , close = `/${steps}`

    return j.templateLiteral(
      [ templateElement(open), templateElement(close, true) ],
      [ j.binaryExpression('+', this.id('it'), j.literal(1)) ]
    )
  }

  exportSemiglobals () {
    // Remember variables from top-most scope
    // for subsequent markdown code blocks.
    this.ast
      .findVariableDeclarators()
      .filter(path => path.scope.isGlobal)
      .filter(path => path.parentPath.parent.node.type === 'Program')
      .forEach(path => {
        this.semiglobal[path.node.id.name] = null
        this.semiExports.add(path.node.id.name)

        // Replace "x =" with "x = semiglobal.x ="
        j(path).replaceWith(
          j.variableDeclarator(
            j.identifier(path.node.id.name),
            j.assignmentExpression(
              '=',
              member(this.id('semiglobal'), path.node.id.name),
              path.node.init
            )
          )
        )
      })
  }

  // Equivalent of "require('module').wrap(body)",
  // with some extras.
  wrapModule() {
    return this.ast.find(j.Program).replaceWith(path => {
      const moduleArgs
        = [ 'exports'
          , 'require'
          , 'module'
          , '__filename'
          , '__dirname' ]

      const args = moduleArgs.concat([this.id.string('semiglobal')])

      const body = [
        j.expressionStatement(j.literal('use strict')),
        j.variableDeclaration('const', [
          j.variableDeclarator(this.id('util'), req('util'))
        ])
      ]

      if (this.counters.length) {
        body.push(j.variableDeclaration('let', [
          j.variableDeclarator(
            j.arrayPattern(this.counters.map(c => j.identifier(c))),
            j.arrayExpression(
              Array(this.counters.length).fill(0).map(_ => j.literal(0))
            )
          )
        ]))
      }

      body.push(callStatement(req('tape'), [
        j.literal(this.testName),
        j.functionExpression(
          this.id('test'),
          [this.id('t')],
          j.blockStatement(this.testBody(path.node.body))
        )
      ]))

      return j.expressionStatement(
        j.functionExpression(
          null,
          args.map(a => j.identifier(a)),
          j.blockStatement(body)
        )
      )
  	}).size()
  }

  testBody(body) {
    if (this.planned === 0) {
      body = body.concat(callStatement([this.id('t'), 'end']))
    } else {
      body = [
        // if plan > count, all subsequent tests fail
        // this is a temporary solution
        callStatement([this.id('t'), 'once'], [j.literal('run'), arrow([], [
          j.variableDeclaration('const', [
            j.variableDeclarator(
              j.identifier('timeout'), callExpression('setTimeout', arrow([],
                callStatement([this.id('t'), 'end'])
              ), j.literal(1500))
            )
          ]),

          callStatement([this.id('t'), 'once'], [j.literal('end'), arrow([], [
            callStatement('clearTimeout', [j.identifier('timeout')])
          ])])
        ])]),

        callStatement([this.id('t'), 'plan'], [j.literal(this.planned)])
      ].concat(body)
    }

    const semis = Object.keys(this.semiglobal).filter(k => {
      return !this.semiExports.has(k) && this.semiImports.has(k)
    })

    if (semis.length) {
      return [
        j.variableDeclaration('let', [
          j.variableDeclarator(
            j.objectExpression(semis.map(shorthand)),
            j.logicalExpression('||', this.id('semiglobal'), j.objectExpression([]))
          )
        ])
      ].concat(body)
    } else {
      return body
    }
  }
}

// Helpers

function arrow (args, body) {
  if (Array.isArray(body)) {
    body = j.blockStatement(body)
  } else if (!j.BlockStatement.check(body)) {
    body = j.blockStatement([body])
  }

  return j.arrowFunctionExpression(args, body)
}

function callStatement (id, args, ...rest) {
  return j.expressionStatement(
    callExpression(id, args, ...rest)
  )
}

function callExpression(id, args, ...rest) {
  if (args === undefined) args = []
  else if (!Array.isArray(args)) args = [args].concat(rest)

  if (typeof id === 'string') id = j.identifier(id)
  else if (Array.isArray(id)) id = member(...id)

  return j.callExpression(id, args)
}

function req (id) {
  if (typeof id === 'string') id = j.literal(id)
  return callExpression('require', [id])
}

function member (object, property, computed) {
  if (typeof object === 'string') object = j.identifier(object)
  if (typeof property === 'string') property = j.identifier(property)

  return j.memberExpression(object, property, computed || false)
}

function shorthand (k) {
  const prop = j.property('init', j.identifier(k), j.identifier(k))
  prop.shorthand = true
  return prop
}

function templateElement (raw, tail) {
  return j.templateElement({ raw, cooked: raw }, tail || false)
}

function compactSource (el) {
  const opts = { reuseWhitespace: false, lineTerminator: '\n', tabWidth: 1 }
  return j(el).toSource(opts).replace(/\n */g, ' ')
}

// Because we take the comment as JavaScript source code, it
// can reference variables and do all sorts of crazy stuff.
function parseComment (comment) {
  const body = j('[' + comment + ']').nodes()[0].program.body
  const array = body[0].expression
  return array.elements
}

// Make identifiers with unique names
function identifierFactory (ast, reserved) {
  reserved = reserved || new Set

  ast.find(j.Identifier).forEach(path => {
    reserved.add(path.node.name)
  })

  ast.find(j.FunctionDeclaration).forEach(path => {
    reserved.add(path.node.id.name)
  })

  function identifier (name, suffix) {
    return j.identifier(identifier.string(name, suffix))
  }

  identifier.string = function (name, suffix) {
    let sfx = suffix == null ? '' : suffix
      , unique = name + sfx
      , n = 0

    while (reserved.has(unique)) {
      unique = name + (n++) + sfx
    }

    return unique
  }

  return identifier
}

function findComment (path) {
  let parent = path
    , line = path.node.loc.start.line

  // Find comment on the same line (surely there must be a better way?)
  while(parent && parent.node.loc && parent.node.loc.start.line === line){
    if (parent.node.comments) {
      for(let c of parent.node.comments) {
        if (c.trailing) return c.value.trim()
      }

      break
    }

    parent = parent.parentPath
  }
}

function hasArguments (path) {
  return path.node.arguments.length
}

function isLogCall (path) {
  const callee = path.node.callee
  const isMember = j.MemberExpression.check(callee)

  if (isMember) {
    return callee.object.name === 'console' &&
           callee.property.name === 'log'
  } else {
    // TODO: find patterns like "log = console.log.bind(..)"
    return callee.name === 'log'
  }
}
