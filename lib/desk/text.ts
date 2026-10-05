// Fill `{name}` placeholders in an i18n template. Numbers are formatted by the caller.
export function fill(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
