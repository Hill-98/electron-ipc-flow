export function getWebContentsBody(webContents: Electron.WebContents) {
  return webContents.executeJavaScript(
    'document.body.textContent.trim().split("|").filter((v) => v.trim() !== "")',
  ) as Promise<string[]>
}

export function includeCount(strs: string[], need: string): number {
  return strs.filter((str) => str === need).length
}

export async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
