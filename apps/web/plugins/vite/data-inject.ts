import { readFileSync } from 'node:fs'

import { DOMParser } from 'linkedom'
import type { Plugin } from 'vite'

import { siteConfig } from '../../../../site.config.build'
import { MANIFEST_PATH } from './__internal__/constants'

// ── manifest helpers ──────────────────────────────────────────────────────────

function resolveEmbedPreference(_command: 'serve' | 'build'): boolean {
  const flag = process.env.AFILMORY_EMBED_MANIFEST?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  return true
}

function getManifestContent(command: 'serve' | 'build'): string {
  try {
    const content = readFileSync(MANIFEST_PATH, 'utf-8')
    return content
  } catch (error) {
    if (command === 'build') {
      throw new Error(
        `[data-inject] Cannot read manifest at ${MANIFEST_PATH}. ` +
          `Run "pnpm build:manifest" before "pnpm build:web". Original error: ${error}`,
      )
    }
    console.warn('[data-inject] Failed to read manifest file (dev mode, using empty object):', error)
    return '{}'
  }
}

function escapeInlineScriptJson(json: string): string {
  return json
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003C')
    .replaceAll('>', '\\u003E')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}

function buildInlineScriptAssignment(name: '__MANIFEST__' | '__SITE_CONFIG__', json: string): string {
  return `window.${name} = ${escapeInlineScriptJson(json)};`
}

// ── site-config helpers ───────────────────────────────────────────────────────

const CONFIG_SCRIPT_ID = 'config'
const INJECTED_SCRIPT_ID = 'config-runtime'

// ── combined plugin ───────────────────────────────────────────────────────────

export function dataInjectPlugin(): Plugin {
  let embedManifest: boolean | undefined

  const siteConfigPayload = JSON.stringify(siteConfig)
  const siteConfigScriptContent = buildInlineScriptAssignment('__SITE_CONFIG__', siteConfigPayload)
  const parser = new DOMParser()

  return {
    name: 'data-inject',
    enforce: 'pre',

    configResolved(config) {
      embedManifest = resolveEmbedPreference(config.command as 'serve' | 'build')
    },

    configureServer(server) {
      const shouldEmbed = embedManifest ?? resolveEmbedPreference(server.config.command as 'serve')
      if (!shouldEmbed) {
        return
      }

      // 监听 manifest 文件变化
      server.watcher.add(MANIFEST_PATH)

      server.watcher.on('change', (file) => {
        if (file === MANIFEST_PATH) {
          server.config.logger.info('[data-inject] Manifest file changed, triggering full reload')
          // 触发页面重新加载
          server.ws.send({
            type: 'full-reload',
          })
        }
      })
    },

    transformIndexHtml(html, ctx) {
      // ── inject __MANIFEST__ ────────────────────────────────────────────────
      const command: 'serve' | 'build' = ctx?.server ? 'serve' : 'build'
      const shouldEmbed = embedManifest ?? resolveEmbedPreference(command)
      embedManifest = shouldEmbed
      let nextHtml = html

      if (shouldEmbed) {
        const manifestContent = getManifestContent(command)
        const manifestScriptContent = buildInlineScriptAssignment('__MANIFEST__', manifestContent)
        nextHtml = nextHtml.replace(
          '<script id="manifest"></script>',
          `<script id="manifest">${manifestScriptContent}</script>`,
        )
      }

      // ── inject __SITE_CONFIG__ ─────────────────────────────────────────────
      const document = parser.parseFromString(nextHtml, 'text/html')
      if (!document.querySelector(`#${INJECTED_SCRIPT_ID}`)) {
        const scriptEl = document.createElement('script', 'text/javascript')
        scriptEl.id = INJECTED_SCRIPT_ID
        scriptEl.textContent = siteConfigScriptContent

        const configScript = document.querySelector(`#${CONFIG_SCRIPT_ID}`)
        if (configScript?.parentNode) {
          configScript.parentNode.insertBefore(scriptEl, configScript.nextSibling)
        } else if (document.head) {
          document.head.append(scriptEl)
        } else {
          const fallbackParent = document.body ?? document.documentElement
          fallbackParent?.append(scriptEl)
        }

        nextHtml = document.toString()
      }

      return nextHtml
    },
  }
}
