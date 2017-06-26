// Copyright 2016 Zaiste & contributors. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const debug = require('debug')('blezer');
const Promise = require('bluebird');

const redis = require('./redis');
const { println } = require('./util');
const { tasks } = require('./load');
const Job = require('./job');

class TaskFactory {
  static getInstance(task, jid) {
    if (tasks.hasOwnProperty(task)) {
      return new tasks[task](jid);
    } else {
      throw new Error(`Could not instantiate ${task}`);
    }
  }
}

async function listen(pid, queues) {
  while (true) {
    let [_, jid] = await redis.blpopAsync(...queues, 0);

    try {
      let job = await redis.hgetallAsync(`blezer:jobs:${jid}`);
      debug(`${pid}: ${job.task} as ${jid} with ${job.args}`);

      await redis.hmsetAsync(`blezer:jobs:${jid}`, {
        pid,
        startedAt: Date.now()
      });
      await redis.lpushAsync('blezer:active', jid);

      let task = TaskFactory.getInstance(job.task, jid);
      await task.perform(JSON.parse(job.args));

      await redis
        .multi()
        .lpush('blezer:processed', jid)
        .lrem('blezer:active', 0, jid)
        .hmset(`blezer:jobs:${jid}`, { finishedAt: Date.now() })
        .execAsync();


      const args = JSON.parse(job.args)

      if (args.rootJid) {
        const rootJob = await Job.find(args.rootJid);
        const processed =  rootJob.processed  ? parseInt(rootJob.processed, 10) : 0;
        const successed =  rootJob.successed  ? parseInt(rootJob.successed, 10) : 0;
        await redis.hmsetAsync(`blezer:jobs:${rootJob.jid}`, { processed: processed + 1, successed: successed + 1 })
      }
    } catch (error) {
      const job = await Job.find(jid);

      await redis
        .multi()
        .hmset(`blezer:jobs:${jid}`, { failedAt: Date.now() })
        .lpush('blezer:failed', jid)
        .lrem('blezer:active', 0, jid)
        .execAsync();

      await redis.rpushAsync(`blezer:logs:${jid}`, `[${new Date().toISOString()}] ${error.message}`);

      if (job.args.rootJid) {
        const rootJid = job.args.rootJid
        const rootJob = await Job.find(rootJid);
        const processed =  rootJob.processed  ? parseInt(rootJob.processed, 10) : 0;

        await redis
          .multi()
          .hmset(`blezer:jobs:${rootJid}`, { failedAt: Date.now(),  processed: processed + 1 })
          .lrem('blezer:failed', 0, rootJid)
          .lrem('blezer:active', 0, rootJid)
          .lrem('blezer:processed', 0, rootJid)
          .lpush('blezer:failed', rootJid)
          .execAsync();

        await redis.rpushAsync(`blezer:logs:${rootJid}`, `[${new Date().toISOString()}] child process failed ${jid} - ${error.message} `);
      }


      println(error.message);
    }
  }
}

module.exports = { listen };
