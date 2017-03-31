'use strict'

const getCommit = require('git-current-commit').sync
const EventEmitter = require('events')
const inherits = require('util').inherits
const canonical = require('gh-canonical-repository')
const got = require('got')

module.exports = Watch
inherits(Watch, EventEmitter)

function Watch (dir) {
  if (!(this instanceof Watch)) return new Watch(dir)
  EventEmitter.call(this)

  this._dir = dir
  this.state = {
    started: new Date(),
    commit: {
      sha: getCommit(dir),
      found: true
    },
    link: null,
    repo: null,
    build: null,
    results: {},
    success: null
  }
}

Watch.prototype._getBuilds = function (cb) {
  const onrepo = (err, repo) => {
    if (err) return cb(err)
    this.state.repo = repo
    const url = `https://ci.appveyor.com/api/projects/${this.state.repo[0]}/${this.state.repo[1]}/history?recordsNumber=50`
    got(url, { json: true })
      .then(res => setImmediate(() => cb(null, res.body.builds)))
      .catch(err => setImmediate(() => cb(err)))
  }

  if (this.state.repo) onrepo(null, this.state.repo)
  else canonical(this._dir, onrepo, () => {}) // FIXME
}

Watch.prototype._getResolvedBuild = function (build, cb) {
  const url = `https://ci.appveyor.com/api/projects/${this.state.repo[0]}/${this.state.repo[1]}/build/${build.buildNumber || build.number}`
  got(url, { json: true })
    .then(res => setImmediate(() => cb(null, res.body.build)))
    .catch(err => setImmediate(() => cb(err)))
}

Watch.prototype._findBuild = function (builds) {
  return builds.find(b => b.commitId === this.state.commit.sha)
}

Watch.prototype._link = function () {
  return `https://ci.appveyor.com/project/${this.state.repo[0]}/${this.state.repo[1]}/build/${this.state.build.number}`
}

Watch.prototype._getBuild = function (cb) {
  const onBuild = (err, build) => {
    if (err) return cb(err)
    this.state.build = {
      jobs: build.jobs,
      number: build.buildNumber,
      status: build.status
    }
    cb()
  }

  if (this.state.build && this.state.build.number) {
    return this._getResolvedBuild(this.state.build, onBuild)
  }

  this._getBuilds((err, builds) => {
    if (err) return cb(err)
    const tmpBuild = this._findBuild(builds)
    if (!tmpBuild) return this._getBuild(cb)
    this.state.commit.branch = tmpBuild.branch
    this._getResolvedBuild(tmpBuild, onBuild)
  })
}

Watch.prototype.start = function () {
  const check = err => {
    if (err) return this.emit('error', err)

    if (this.state.build.status === 'success') {
      this.state.success = true
    } else if (this.state.build.status === 'failure') {
      this.state.success = false
    }
    this.state.link = this._link()
    this.state.results = { windows: {} }
    this.state.build.jobs.forEach(job => {
      this.state.results.windows[job.jobId] = {
        state: {
          success: 'passed',
          running: 'started'
        }[job.status],
        allowFailure: job.allowFailure,
        name: job.name,
        startedAt: job.started
      }
    })

    if (typeof this.state.success !== 'boolean') return this._getBuild(check)
    this.emit('finish')
  }

  this._getBuild(check)
}
