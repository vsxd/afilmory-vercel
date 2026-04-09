const transitionStyleSelector = 'style[data-afilmory-accent-transition="true"]'

export const getAccentTransitionStyle = () => document.head.querySelector<HTMLStyleElement>(transitionStyleSelector)

export const applyAccentTransitionStyle = (durationMs = 100) => {
  if (typeof document === 'undefined') {
    return () => {}
  }

  const style = document.createElement('style')
  style.dataset.afilmoryAccentTransition = 'true'
  style.textContent = `
    * {
      transition: color 0.2s ease-in-out, background-color 0.2s ease-in-out;
    }
  `

  document.head.append(style)

  const timeoutId = setTimeout(() => {
    style.remove()
  }, durationMs)

  return () => {
    clearTimeout(timeoutId)
    style.remove()
  }
}
