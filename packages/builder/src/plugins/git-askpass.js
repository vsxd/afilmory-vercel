#!/usr/bin/env node

const prompt = (process.argv[2] ?? '').toLowerCase()

if (prompt.includes('username')) {
  process.stdout.write(process.env.AFILMORY_GIT_USERNAME || 'x-access-token')
} else if (prompt.includes('password')) {
  process.stdout.write(process.env.AFILMORY_GIT_PASSWORD || '')
}
