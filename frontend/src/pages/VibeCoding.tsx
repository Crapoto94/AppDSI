import React, { useState, useEffect } from 'react';
import { Download, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Header from '../components/Header';

const PLAN_URL = '/docs/vibecoding-plan.md';

interface ResourceLink {
  label: string;
  url: string;
}

const QUICK_LINKS: ResourceLink[] = [
  { label: 'OpenCode — documentation', url: 'https://opencode.ai/docs/' },
  { label: 'Groq — console & clés API', url: 'https://console.groq.com/' },
  { label: 'GitHub — prise en main (fr)', url: 'https://docs.github.com/fr/get-started/quickstart/hello-world' },
  { label: 'Docker — cours OpenClassrooms (fr)', url: 'https://openclassrooms.com/fr/courses/8431896-optimisez-votre-deploiement-en-creant-des-conteneurs-avec-docker' },
  { label: 'SQL — cours OpenClassrooms (fr)', url: 'https://openclassrooms.com/fr/courses/7818671-requetez-une-base-de-donnees-avec-sql' },
  { label: 'Méthode EBIOS Risk Manager (ANSSI)', url: 'https://cyber.gouv.fr/securisation/analyse-des-risques/methode-ebios-rm/' },
];

const VibeCoding: React.FC = () => {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(PLAN_URL)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.text();
      })
      .then(text => setContent(text))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#0f172a', margin: 0, marginBottom: '8px' }}>
                VibeCoding
              </h1>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                Ressources et plan de la formation au développement assisté par IA (OpenCode)
              </p>
            </div>
            <a
              href={PLAN_URL}
              download="plan-formation-vibecoding.md"
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <Download size={18} />
              Télécharger le plan (.md)
            </a>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: 0, marginBottom: '14px' }}>
              Ressources rapides
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {QUICK_LINKS.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: '#f1f5f9',
                    color: '#0c4a6e',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
                >
                  {link.label}
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '32px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Chargement du plan...</div>
            ) : error ? (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                Le plan de formation n'a pas pu être chargé. Utilisez le bouton de téléchargement ci-dessus.
              </div>
            ) : (
              <div className="vibecoding-md">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
              </div>
            )}
          </div>
        </div>
      </main>

      <style>{`
        .vibecoding-md { color: #334155; line-height: 1.7; overflow-wrap: break-word; }
        .vibecoding-md h1 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 16px; }
        .vibecoding-md h2 { font-size: 1.4rem; font-weight: 800; color: #0f172a; margin: 32px 0 14px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
        .vibecoding-md h3 { font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 22px 0 10px; }
        .vibecoding-md p { margin: 0.6em 0; }
        .vibecoding-md ul, .vibecoding-md ol { padding-left: 1.6em; margin: 0.6em 0; }
        .vibecoding-md li { margin-bottom: 0.3em; }
        .vibecoding-md a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
        .vibecoding-md a:hover { color: #1d4ed8; }
        .vibecoding-md code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .vibecoding-md pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .vibecoding-md pre code { background: none; padding: 0; color: inherit; }
        .vibecoding-md blockquote { border-left: 3px solid #cbd5e1; margin: 0.8em 0; padding: 4px 16px; color: #64748b; background: #f8fafc; border-radius: 0 6px 6px 0; }
        .vibecoding-md table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9rem; }
        .vibecoding-md th, .vibecoding-md td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
        .vibecoding-md th { background: #f8fafc; font-weight: 700; }
        .vibecoding-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
      `}</style>
    </div>
  );
};

export default VibeCoding;
