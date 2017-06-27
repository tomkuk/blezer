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

const Task = require('./lib/task');
const Queue = require('./lib/queue');
const Job = require('./lib/job');

async function enqueue(task, args, { name = 'default', title } = {}) {
  const queue = new Queue(name);
  const job = await queue.enqueue(task, args, title, {});

  return job;
}

module.exports = { Job, Task, Queue, enqueue };
