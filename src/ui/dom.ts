// Accès au DOM : éléments par identifiant (une erreur claire si le gabarit HTML a changé).
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error('élément #' + id + ' introuvable');
  return el as T;
};
/** écrit une propriété de style seulement si elle change (évite des recalculs de mise en page à chaque image) */
export function setStyle(el: HTMLElement, prop: string, v: string): void {
  const d = el.dataset, k = 's_' + prop.replace(/-/g, '_');
  if (d[k] === v) return;
  d[k] = v;
  if (prop.startsWith('--')) el.style.setProperty(prop, v);
  else (el.style as unknown as Record<string, string>)[prop] = v;
}
export function setText(el: HTMLElement, v: string): void {
  if (el.textContent !== v) el.textContent = v;
}
