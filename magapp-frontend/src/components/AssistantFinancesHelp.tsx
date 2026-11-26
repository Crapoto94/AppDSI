import React from 'react';

// Aide affichée dans la fenêtre de l'assistant (guide complet : docs/GUIDE-ASSISTANT-FINANCES.md).

const h: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: '#0f172a', margin: '16px 0 6px' };
const ul: React.CSSProperties = { margin: 0, paddingLeft: 18, fontSize: 13, color: '#334155', lineHeight: 1.65 };
const chip: React.CSSProperties = { padding: '3px 9px', borderRadius: 8, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#5b21b6', fontSize: 12.5, cursor: 'pointer', margin: '2px 4px 2px 0' };

const TOPICS: [string, string[]][] = [
  ['Budget (voté, disponible, engagé, mandaté)', ['Évolution du budget de fonctionnement de la DSI depuis 2023, en courbe', 'Disponible en investissement par service, en camembert', 'Histogramme du mandaté par chapitre l’an dernier']],
  ['Engagements', ['Engagements en cours de plus de 20 000 €']],
  ['Commandes et factures', ['Les dernières commandes UGAP', 'Factures sans service fait']],
  ['Mandats et titres', ['Les 10 plus gros fournisseurs l’an dernier, en histogramme']],
];

const AssistantFinancesHelp: React.FC<{ onAsk: (question: string) => void }> = ({ onAsk }) => (
  <div style={{ maxWidth: 780, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '6px 22px 20px' }}>
    <h3 style={h}>Ce que vous pouvez demander</h3>
    {TOPICS.map(([title, examples]) => (
      <div key={title} style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{title}</div>
        {examples.map(e => <button type="button" key={e} style={chip} onClick={() => onAsk(e)}>{e}</button>)}
      </div>
    ))}
    <div style={{ fontSize: 12.5, color: '#64748b' }}>Vous pouvez aussi poser une question générale (« c’est quoi un mandat ? », « pourquoi… ? ») : la réponse de l’IA est alors signalée comme telle.</div>
    <div style={{ fontSize: 12.5, color: '#64748b' }}>Les marchés, fiches tiers, emprunts, immobilisations et régies ne sont pas interrogeables.</div>

    <h3 style={h}>Directions et services</h3>
    <ul style={ul}>
      <li>Par sigle (<b>DSI</b>, <b>DCOM</b> ou <b>DIRCOM</b>, <b>DRH</b>, <b>DSF</b>, <b>DBC</b>, <b>DEP</b>, <b>DDAC</b>…) ou en toutes lettres : « la direction de la communication », « le service voirie », « BF6 ».</li>
      <li>Les sigles courts (DS, DJ, DEP…) s’écrivent en majuscules.</li>
      <li>Une direction est comptée <b>en entier</b> (ses services sont additionnés) ; ajoutez « par service » pour le détail, ou « par direction » pour les comparer.</li>
      <li>Pour exclure : « <b>hors</b> DSI », « <b>sauf</b> la communication et la voirie », « hors UGAP ».</li>
    </ul>

    <h3 style={h}>Filtres permanents (listes déroulantes)</h3>
    <ul style={ul}>
      <li>Année, section, chapitre, nature, fonction, budget, direction, service : ils s’appliquent à <b>toutes</b> les demandes et priment sur la question.</li>
      <li>Ils restent actifs, même après fermeture, jusqu’à <b>Réinitialiser</b>.</li>
      <li>Les listes suivent vos <b>droits Sedit</b> (et non votre service d’affectation). S’ils sont limités, un bandeau le dit et la direction ou le service unique est verrouillé.</li>
      <li>Les factures n’ont ni section, ni chapitre, ni nature, ni fonction : ces filtres sont alors signalés comme non appliqués.</li>
    </ul>

    <h3 style={h}>Enchaîner les questions</h3>
    <ul style={ul}>
      <li>Ce qui a été dit reste valable : service, années, section, filtres. Exemples : « et en 2024 ? », « par chapitre », « sépare fonctionnement et investissement ».</li>
      <li>« Tous les services », « toutes les factures » ou « sans filtre » lèvent ce qui avait été dit. <b>Nouvelle discussion</b> repart de zéro.</li>
    </ul>

    <h3 style={h}>Comparer</h3>
    <ul style={ul}>
      <li>« Les commandes par mois en 2026 <b>par rapport à</b> 2025 » : les mois sont mis face à face, avec l’écart.</li>
      <li>« <b>Compare</b> la DSI et la communication », « compare UGAP et SCC », « compare voté et mandaté ».</li>
    </ul>

    <h3 style={h}>Éduquer l’IA</h3>
    <ul style={ul}>
      <li>Le bouton <b>Éduquer l’IA</b> enregistre une consigne reprise à chaque question (pour vous, ou pour tous si vous êtes administrateur).</li>
      <li>Elle aide à comprendre vos mots ; elle ne change ni vos droits, ni les chiffres.</li>
    </ul>

    <h3 style={h}>Tableaux, graphiques et pièces jointes</h3>
    <ul style={ul}>
      <li><b>Excel</b> et <b>Word</b> produisent un fichier avec <b>toutes</b> les lignes, à ouvrir depuis le navigateur. L’icône de copie ne copie que la page affichée.</li>
      <li>Les tableaux s’affichent par pages de 50 lignes.</li>
      <li>Graphiques : « en courbe », « en histogramme », « en camembert », ou les icônes au-dessus du tableau. « Une couleur par mois » (ou le bouton <b>Couleurs</b>) colore chaque barre ; <b>Image</b> télécharge le graphique.</li>
      <li>Le trombone ouvre les pièces jointes ; <b>Sedit</b> ouvre la fiche (facture, commande, engagement, mandat) dans Sedit.</li>
      <li>Au clavier ou à la voix (bouton micro, en HTTPS).</li>
    </ul>

    <h3 style={h}>À vérifier</h3>
    <ul style={ul}>
      <li>Le <b>titre du tableau</b> dit exactement ce qui a été cherché : l’IA peut mal comprendre une question.</li>
      <li>Le montant officiel « engagé » ou « mandaté » est celui du budget ; les listes peuvent s’en écarter un peu.</li>
    </ul>

    <h3 style={h}>Droits et confidentialité</h3>
    <ul style={ul}>
      <li>Vous ne voyez que ce que vos droits Sedit permettent, comme dans « Mes factures ». Un partage de factures n’ouvre que les factures.</li>
      <li>L’IA est hébergée par la Ville : elle traduit la question, sans voir ni inventer de montant.</li>
    </ul>
  </div>
);

export default AssistantFinancesHelp;
