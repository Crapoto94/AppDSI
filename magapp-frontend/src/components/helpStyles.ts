// Styles de l'aide (guides Markdown rendus en HTML, classe .vc-help) — repris du DSI Hub
export const HELP_CSS = `
.vc-help { font-size: 14.5px; color: #334155; line-height: 1.7; }
.vc-help > *:first-child { margin-top: 0; }
.vc-help h1 { font-size: 1.5rem; font-weight: 800; color: #0f172a; margin: 0 0 6px; }
.vc-help h2 { font-size: 1.18rem; font-weight: 800; color: #1e293b; margin: 26px 0 10px; padding-bottom: 6px; border-bottom: 2px solid #eef2f7; }
.vc-help h3 { font-size: 1.02rem; font-weight: 700; color: #334155; margin: 18px 0 6px; }
.vc-help p { margin: 8px 0; }
.vc-help ul, .vc-help ol { margin: 8px 0; padding-left: 22px; }
.vc-help li { margin: 4px 0; }
.vc-help a { color: #2563eb; text-decoration: none; }
.vc-help hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
.vc-help code { background: #f1f5f9; color: #be123c; padding: 1px 6px; border-radius: 5px; font-family: Consolas, Menlo, monospace; font-size: 0.85em; }
.vc-help blockquote { margin: 12px 0; padding: 8px 14px; border-left: 4px solid #93c5fd; background: #eff6ff; color: #1e3a8a; border-radius: 0 8px 8px 0; }
.vc-help blockquote p { margin: 4px 0; }
.vc-help table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; border: 1px solid #e2e8f0; }
.vc-help th, .vc-help td { border: 1px solid #e9eef5; padding: 9px 12px; text-align: left; vertical-align: top; }
.vc-help th { background: #f1f5f9; color: #334155; font-weight: 700; }
.vc-help tbody tr:nth-child(even) { background: #f8fafc; }
.vc-help strong { color: #0f172a; }
.vc-help-pulse { animation: vcHelpPulse 2.4s ease-in-out infinite; }
.vc-help-pulse:hover { filter: brightness(1.08); animation: none; }
@keyframes vcHelpPulse { 0%, 100% { box-shadow: 0 4px 14px -4px rgba(37,99,235,0.55); } 50% { box-shadow: 0 0 0 5px rgba(37,99,235,0.18); } }
`;
