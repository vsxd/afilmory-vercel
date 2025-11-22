import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { $ } from 'execa'

import { precheck } from './precheck'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workdir = path.resolve(__dirname, '..')

async function main() {
  await precheck()
  // Get command line arguments excluding node and script name
  const args = process.argv.slice(2)
  try {
    await $({ cwd: workdir, stdio: 'inherit' })`vite --host ${args}`
  } catch (error: any) {
    // 130 is SIGINT (Ctrl+C), which is a normal exit for dev server
    if (error.exitCode === 130) {
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(0)
    }
    throw error
  }
}

main()
