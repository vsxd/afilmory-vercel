import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

import { buildGitAuthenticationEnv } from '../plugins/github-repo-sync'

describe('GitHub repo sync auth', () => {
  it('should configure askpass auth for GitHub HTTPS repositories', async () => {
    const env = buildGitAuthenticationEnv('https://github.com/vsxd/afilmory-metadata-cache.git', 'github_pat_test')

    expect(env).toBeDefined()
    expect(env?.GIT_TERMINAL_PROMPT).toBe('0')
    expect(env?.GIT_ASKPASS).toContain('git-askpass.js')

    const username = await execa(env!.GIT_ASKPASS!, ['Username for https://github.com'], { env })
    const password = await execa(env!.GIT_ASKPASS!, ['Password for https://github.com'], { env })

    expect(username.stdout).toBe('x-access-token')
    expect(password.stdout).toBe('github_pat_test')
  })

  it('should skip askpass auth when the url is not a GitHub HTTPS repository', () => {
    expect(buildGitAuthenticationEnv('ssh://git@github.com/vsxd/afilmory-metadata-cache.git', 'github_pat_test')).toBe(
      undefined,
    )
    expect(buildGitAuthenticationEnv('https://example.com/repo.git', 'github_pat_test')).toBe(undefined)
  })

  it('should skip askpass auth when the url already contains credentials', () => {
    expect(
      buildGitAuthenticationEnv(
        'https://someone:secret@github.com/vsxd/afilmory-metadata-cache.git',
        'github_pat_test',
      ),
    ).toBe(undefined)
  })
})
