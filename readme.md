# console.log(actual) // expected

**Functionally test readme snippets.**

Transforms markdown code blocks to serially executed [tape](https://github.com/substack/tape) tests. Use trailing comments to specify the expected result of `console.log()` calls and pipe to a [TAP](https://testanything.org/tap-version-13-specification.html) [reporter of your choice](https://github.com/substack/tape#pretty-reporters). Requires Node.js 6.8.0+.

[![npm status](http://img.shields.io/npm/v/doctap.svg?style=flat-square)](https://www.npmjs.org/package/doctap) ![not even sure](https://img.shields.io/badge/good%20idea-maybe%3F-ff69b4.svg) [![Dependency status](https://img.shields.io/david/vweevers/doctap.svg?style=flat-square)](https://david-dm.org/vweevers/doctap)

## usage: doctap \[file, ..\]

Let's test the snippets in this very readme.

```js
const pkg = require('./package.json')
const floor = Math.floor

console.log('hello') // 'hello'
console.log(pkg.name) // 'doctap'
console.log(floor(1.2)) // 1
```

**doctap \*.md**

```
TAP version 13
# readme.md:12
ok 1 'hello' == 'hello'
ok 2 pkg.name == 'doctap'
ok 3 floor(1.2) == 1
```

*Output continued below.*

## asynchronicity

```js
const glob = require('glob')

glob('*.md', { cwd: __dirname }, (err, files) => {
  console.log(files) // ['readme.md']
})
```

```
# readme.md:36
ok 4 files == ['readme.md']
```

## comments are javascript too

```js
const name = 'doctap'
console.log(2 * 3) // 2 + 4
console.log('doctap') // name
```

```
# readme.md:51
ok 5 2 * 3 == 2 + 4
ok 6 'doctap' == name
```

## repeated calls

```js
for(let value of [1, 2, 3]) {
  console.log(value * 2) // 2, 4, 6
}
```

```
# readme.md:65
ok 7 value * 2 == 2 1/3
ok 8 value * 2 == 4 2/3
ok 9 value * 2 == 6 3/3
```

## require

As you may have noticed above: `require()` is relative to the markdown file.

Provided there's a nearby `package.json`, you can also require your own package by name.

```js
const doctap = require('doctap')
```

## shared scope

If one snippet declares a variable in the top-most scope (like `glob` above), subsequent snippets can reference it. This is most useful to require shared things in your first snippet, and avoid repeating yourself.

```js
console.log(glob.sync('*.md')) // ['readme.md']
```

```
# readme.md:92
ok 10 glob.sync('*.md') == ['readme.md']
```

## matches your style

```js
console.log('hello') // 'hello'
console.log("world") // `world`
```

```
# readme.md:103
ok 11 'hello' == 'hello'
ok 12 "world" == `world`
```

## multiple arguments

```js
console.log('hello %s', 'world') // 'hello world'
console.log(1, 2) // '1 2'
```

```
# readme.md:116
ok 13 'hello %s', 'world' == 'hello world'
ok 14 1, 2 == '1 2'
```

## errors

An attempt is made to rewrite stack traces, but it's not effective in all places right now, and not applied to failing `tape` assertions either.

```js
function please () {
  throw new Error('no')
}

console.log(false) // true
console.log(please())
```

```
# readme.md:131
not ok 15 false == true
  ---
    operator: deepEqual
    expected: true
    actual:   false
    at: Test.test (/doctap/readme131.js:26:11)
  ...

/doctap/readme131.js:19
      throw new Error('no')
      ^

Error: no
    at please (/doctap/readme.md:133:9)
    at Test.test (/doctap/readme.md:137:13)
    at Test.bound [as _cb] (/doctap/node_modules/tape/lib/test.js:65:32)
    at ...
```

## install

With [npm](https://npmjs.org) do:

```
npm install doctap --global
```

## license

[MIT](http://opensource.org/licenses/MIT) © Vincent Weevers
