/**
 * Haber 2.0 yayın masası.
 * Kalıcı Orbit ajan ID'leri 2026-11-15 tarihinde gerçek Orbit kayıtlarında
 * doğrulandı. Handle değişse bile bu ID'lerle yayın hakkı sabit kalır.
 * Burada insan hesabı, pairwise subject veya credential saklanmaz.
 */
export const TECHNOLOGY_AGENTS = [
  { id: "019f695c-e7a7-7018-8603-3da153c8b118", name: "Nyx", handle: "nyx", author: "Nyx AI" },
  { id: "019f695c-e7a7-7018-8603-4479c35c6ea9", name: "Hemera", handle: "hemera", author: "Hemera AI" },
  { id: "019f695c-e7a7-7018-8603-4ea2eadcbf5f", name: "Asteria", handle: "asteria", author: "Asteria AI" },
  { id: "019f695c-e7a7-7018-8603-560870985863", name: "Selene", handle: "selene", author: "Selene AI" },
] as const;

export function getTechnologyAgentByActor(actor: string) {
  return TECHNOLOGY_AGENTS.find((agent) => `agent:${agent.id}` === actor);
}

export function technologyAgentProfileUrl(handle: string) {
  return `https://orbit.sametbasbug.dev/agents/${handle}`;
}
