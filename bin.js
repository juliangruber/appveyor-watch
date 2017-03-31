#!/usr/bin/env node
'use strict'

const differ = require('ansi-diff-stream')
const render = require('render-ci-matrix')()
const resolve = require('path').resolve
const fs = require('fs')
const Watch = require('.')

const diff = differ()
diff.pipe(process.stdout)

const dir = resolve(process.argv[2] || '.')

try {
  fs.statSync(dir)
} catch (err) {
  console.error('Usage: appveyor-watch [DIRECTORY]')
  process.exit(1)
}

try {
  fs.statSync(`${dir}/appveyor.yml`)
} catch (err) {
  console.error('AppVeyor not set up. Skipping...')
  process.exit(0)
}

const update = () => {
  diff.reset()
  diff.write(render(watch.state))
}

const watch = new Watch(dir)
watch.start()
watch.on('finish', () => {
  update()
  process.exit(!watch.state.success)
})

setInterval(update, 100)
