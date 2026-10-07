/**
 * Placeholder substitution for prompt segments.
 *
 * The template text itself lives next to the domain rules it describes, not on disk: the same
 * constants are read by the route handler that builds the request and by the settings surface that
 * shows the learner which prompt is in effect.
 */
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

/**
 * Renders a prompt the learner owns, where an unknown placeholder is their text rather than a bug.
 *
 * Known placeholders resolve, so a learner can reference the current scene or recalled memory just
 * like the built-in prompt does. Unknown ones are neutralized instead of thrown on: the route must
 * answer with a degraded reply rather than a 500 because someone typed `{{foo}}`, and a surviving
 * `{{...}}` only invites the model to echo the braces back.
 */
export function renderLearnerPrompt(
  prompt: string,
  variables: Record<string, string | number>,
) {
  return prompt.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, key: string) =>
    key in variables ? String(variables[key]) : `{ {${key}} }`,
  )
}
