/** Plugin-owned style injection; the client bundle has no CSS pipeline of its own. */
const css = {
  section: 'dsh-crew-cockpit', header: 'dsh-crew-header', good: 'dsh-crew-good', warning: 'dsh-crew-warning', status: 'dsh-crew-status', panel: 'dsh-crew-panel', rows: 'dsh-crew-rows', row: 'dsh-crew-row', traffic: 'dsh-crew-traffic', trafficRow: 'dsh-crew-traffic-row', tuning: 'dsh-crew-tuning', empty: 'dsh-crew-empty', error: 'dsh-crew-error', secondary: 'dsh-crew-secondary',
} as const

if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="dsh-crew-messaging/cockpit"]') === null) {
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-crew-messaging'
  tag.dataset.pluginCss = 'dsh-crew-messaging/cockpit'
  tag.textContent = `
.dsh-crew-cockpit{display:grid;gap:20px;color:var(--dsw-alias-label-primary)}.dsh-crew-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dsh-crew-header h2,.dsh-crew-panel h3{margin:0}.dsh-crew-header p,.dsh-crew-empty{margin:6px 0 0;color:var(--dsw-alias-label-secondary)}.dsh-crew-status,.dsh-crew-rows{display:grid;gap:8px}.dsh-crew-status{grid-template-columns:repeat(3,minmax(0,1fr))}.dsh-crew-status>div,.dsh-crew-row,.dsh-crew-traffic-row,.dsh-crew-panel{border:1px solid var(--dsw-alias-border-light);border-radius:12px}.dsh-crew-status>div{display:grid;gap:4px;padding:12px}.dsh-crew-status span,.dsh-crew-row span,.dsh-crew-traffic-row span,.dsh-crew-traffic-row small,.dsh-crew-tuning dt{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-crew-panel{padding:14px}.dsh-crew-rows{margin-top:10px}.dsh-crew-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:10px}.dsh-crew-traffic{display:grid;gap:8px;margin-top:10px}.dsh-crew-traffic-row{display:grid;gap:6px;padding:10px}.dsh-crew-traffic-row>div{display:flex;justify-content:space-between;gap:12px}.dsh-crew-traffic-row p{margin:0;white-space:pre-wrap}.dsh-crew-tuning{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:10px 0 0}.dsh-crew-tuning div{display:flex;justify-content:space-between;gap:8px}.dsh-crew-tuning dt,.dsh-crew-tuning dd{margin:0}.dsh-crew-good{color:var(--dsw-alias-success)}.dsh-crew-warning,.dsh-crew-error{color:var(--dsw-alias-warning)}.dsh-crew-secondary{width:fit-content;padding:6px 10px;border:1px solid var(--dsw-alias-border-light);border-radius:8px;background:transparent;color:inherit;cursor:pointer}@media(max-width:640px){.dsh-crew-status,.dsh-crew-tuning{grid-template-columns:1fr}}
`
  document.head.appendChild(tag)
}

export default css
