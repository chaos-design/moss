import { readFileSync } from "node:fs"
import path from "node:path"

const templates = new Map<string, string>()
const promptDirectory = path.join(process.cwd(), "src/lib/memory/prompts")

export function loadPromptTemplate(fileName: string) {
  if (path.basename(fileName) !== fileName) {
    throw new Error(`Prompt template must be a file name: ${fileName}`)
  }
  const absolutePath = path.join(promptDirectory, fileName)
  const cached = templates.get(absolutePath)
  if (cached) {
    return cached
  }

  const template = readFileSync(absolutePath, "utf8").trim()
  templates.set(absolutePath, template)
  return template
}

export function renderPromptTemplate(
  template: string,
  variables: Record<string, string | number>,
) {
  const rendered = template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_, key: string) => {
    if (!(key in variables)) {
      throw new Error(`Missing prompt template variable: ${key}`)
    }
    return String(variables[key])
  })

  const unresolved = rendered.match(/\{\{[a-zA-Z][a-zA-Z0-9]*\}\}/)
  if (unresolved) {
    throw new Error(`Unresolved prompt template variable: ${unresolved[0]}`)
  }
  return rendered
}
