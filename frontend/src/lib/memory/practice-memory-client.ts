import type { PracticeMemoryWrite } from "./practice-memory"

export async function savePracticeMemoryDocument(memory: PracticeMemoryWrite) {
  try {
    const response = await fetch("/api/memory-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(memory),
      keepalive: true,
    })
    return response.ok
  } catch {
    return false
  }
}
