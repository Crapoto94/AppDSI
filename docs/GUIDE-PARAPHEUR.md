# Guide du Parapheur électronique (`/parapheur`)

> Ce guide s'adresse à **tous les agents** qui créent un circuit de signature ou qui doivent signer un document — aucune connaissance technique n'est nécessaire pour les sections 1 à 10.
> Une **section avancée** (§11) détaille ensuite, pour les curieux et les administrateurs, les mécanismes cryptographiques qui garantissent l'authenticité des documents scellés.

---

## Sommaire

1. [Qu'est-ce que le parapheur électronique ?](#1-quest-ce-que-le-parapheur-électronique)
2. [Vue d'ensemble : les 5 grandes étapes](#2-vue-densemble-les-5-grandes-étapes)
3. [Créer un parapheur (pas à pas)](#3-créer-un-parapheur-pas-à-pas)
4. [Signer un document reçu par e-mail](#4-signer-un-document-reçu-par-e-mail-côté-signataire)
5. [Les 3 façons de signer](#5-les-3-façons-de-signer)
6. [Circuit séquentiel ou circuit parallèle ?](#6-circuit-séquentiel-ou-circuit-parallèle)
7. [Suivre, relancer, annuler un parapheur](#7-suivre-relancer-annuler-un-parapheur)
8. [Déléguer sa signature](#8-déléguer-sa-signature)
9. [Vérifier l'authenticité d'un document signé](#9-vérifier-lauthenticité-dun-document-signé-qr-code)
10. [Questions fréquentes](#10-questions-fréquentes)
11. [Section avancée — comprendre les mécanismes techniques](#11-section-avancée-comprendre-les-mécanismes-techniques)

---

## 1. Qu'est-ce que le parapheur électronique ?

Le **parapheur électronique** remplace le parapheur papier qui circulait de bureau en bureau pour recueillir des signatures. Vous déposez un ou plusieurs documents PDF, vous choisissez qui doit les signer, et le système :

- envoie automatiquement un **lien de signature personnel** à chaque signataire (par e-mail) ;
- **garde la trace** de qui a signé, quand, et dans quel ordre ;
- **scelle** le document une fois toutes les signatures recueillies, pour prouver qu'il n'a plus été modifié depuis ;
- fournit une page publique permettant à **quiconque** de vérifier l'authenticité du document final, à partir d'un QR code imprimé dessus.

> 💡 Vous n'avez besoin d'aucun logiciel particulier : tout se passe dans le navigateur, y compris pour signer.

---

## 2. Vue d'ensemble : les 5 grandes étapes

<svg viewBox="0 0 1000 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:920px;height:auto;">
  <defs>
    <marker id="ph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"/>
    </marker>
  </defs>

  <g>
    <rect x="20" y="20" width="168" height="130" rx="14" fill="#f5f3ff" stroke="#7c3aed" stroke-width="2"/>
    <circle cx="46" cy="46" r="14" fill="#7c3aed"/>
    <text x="46" y="51" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">1</text>
    <text x="104" y="51" text-anchor="middle" font-size="13" font-weight="700" fill="#4c1d95">Création</text>
    <text x="104" y="78" text-anchor="middle" font-size="11" fill="#334155">Vous déposez les</text>
    <text x="104" y="94" text-anchor="middle" font-size="11" fill="#334155">PDF et choisissez</text>
    <text x="104" y="110" text-anchor="middle" font-size="11" fill="#334155">les signataires</text>
  </g>

  <line x1="188" y1="85" x2="214" y2="85" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow)"/>

  <g>
    <rect x="216" y="20" width="168" height="130" rx="14" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
    <circle cx="242" cy="46" r="14" fill="#1d4ed8"/>
    <text x="242" y="51" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">2</text>
    <text x="300" y="51" text-anchor="middle" font-size="13" font-weight="700" fill="#1e3a8a">Circuit lancé</text>
    <text x="300" y="78" text-anchor="middle" font-size="11" fill="#334155">Séquentiel ou</text>
    <text x="300" y="94" text-anchor="middle" font-size="11" fill="#334155">parallèle</text>
    <text x="300" y="110" text-anchor="middle" font-size="11" fill="#334155">(en_cours)</text>
  </g>

  <line x1="384" y1="85" x2="410" y2="85" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow)"/>

  <g>
    <rect x="412" y="20" width="168" height="130" rx="14" fill="#fff7ed" stroke="#b45309" stroke-width="2"/>
    <circle cx="438" cy="46" r="14" fill="#b45309"/>
    <text x="438" y="51" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">3</text>
    <text x="496" y="51" text-anchor="middle" font-size="13" font-weight="700" fill="#7c2d12">Signature(s)</text>
    <text x="496" y="78" text-anchor="middle" font-size="11" fill="#334155">Chaque signataire</text>
    <text x="496" y="94" text-anchor="middle" font-size="11" fill="#334155">reçoit un lien</text>
    <text x="496" y="110" text-anchor="middle" font-size="11" fill="#334155">unique par e-mail</text>
  </g>

  <line x1="580" y1="85" x2="606" y2="85" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow)"/>

  <g>
    <rect x="608" y="20" width="168" height="130" rx="14" fill="#f0fdf4" stroke="#16a34a" stroke-width="2"/>
    <circle cx="634" cy="46" r="14" fill="#16a34a"/>
    <text x="634" y="51" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">4</text>
    <text x="692" y="51" text-anchor="middle" font-size="13" font-weight="700" fill="#14532d">Scellement</text>
    <text x="692" y="78" text-anchor="middle" font-size="11" fill="#334155">Empreinte SHA-256</text>
    <text x="692" y="94" text-anchor="middle" font-size="11" fill="#334155">+ certificat interne</text>
    <text x="692" y="110" text-anchor="middle" font-size="11" fill="#334155">(terminé)</text>
  </g>

  <line x1="776" y1="85" x2="802" y2="85" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow)"/>

  <g>
    <rect x="804" y="20" width="168" height="130" rx="14" fill="#f8fafc" stroke="#475569" stroke-width="2"/>
    <circle cx="830" cy="46" r="14" fill="#475569"/>
    <text x="830" y="51" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">5</text>
    <text x="888" y="51" text-anchor="middle" font-size="13" font-weight="700" fill="#1e293b">Vérification</text>
    <text x="888" y="78" text-anchor="middle" font-size="11" fill="#334155">QR code sur le</text>
    <text x="888" y="94" text-anchor="middle" font-size="11" fill="#334155">PDF → page</text>
    <text x="888" y="110" text-anchor="middle" font-size="11" fill="#334155">publique de contrôle</text>
  </g>
</svg>

Entre chaque étape, **le système agit seul** : dès qu'un signataire a signé, l'étape suivante démarre automatiquement (notification au signataire suivant, ou scellement final si c'était le dernier).

---

## 3. Créer un parapheur (pas à pas)

Depuis `/parapheur`, cliquez sur **« Nouveau »**.

1. **Informations générales** — donnez un titre clair (ex. *« Convention de partenariat — Association Sportive 2026 »*), un message d'accompagnement optionnel, et une échéance si le document est urgent.
2. **Documents à signer** — glissez-déposez le ou les PDF qui doivent porter une signature.
3. **Annexes** *(optionnel)* — des PDF consultables par les signataires mais qui ne seront pas signés (ex. un rapport de présentation joint à une délibération).
4. **Signataires** — recherchez chaque agent via l'annuaire RH, choisissez son mode de signature (voir [§5](#5-les-3-façons-de-signer)) et, si besoin, le titre affiché sous son nom (ex. *« Directeur des Systèmes d'Information »*).
5. **Positionnement** — si plusieurs documents ou signataires, placez le cadre de chaque signature à l'endroit voulu sur la page (glisser-déposer sur l'aperçu).
6. Dès le **2ᵉ signataire** ajouté, une fenêtre vous demande de choisir le **circuit** : séquentiel ou parallèle ([§6](#6-circuit-séquentiel-ou-circuit-parallèle)).
7. Validez : le parapheur passe en statut **« en cours »**, et le ou les premiers signataires reçoivent leur lien par e-mail.

> **Exemple concret** — Un arrêté municipal à faire signer par le DGS puis par le Maire : vous créez un parapheur avec le PDF de l'arrêté, vous ajoutez les deux signataires dans cet ordre, vous choisissez **séquentiel**. Le DGS signe en premier ; le Maire n'est sollicité qu'une fois la signature du DGS enregistrée.

---

## 4. Signer un document reçu par e-mail (côté signataire)

Quand c'est votre tour de signer, vous recevez un e-mail contenant un **lien personnel et unique**. En cliquant dessus :

1. Vous êtes authentifié avec vos identifiants habituels (ceux du poste de travail).
2. Chaque document s'affiche en plein écran : **vous devez faire défiler jusqu'au bas de chaque page** avant que le bouton de signature ne devienne actif — c'est volontaire, pour garantir que vous avez pris connaissance du contenu.
3. Vous dessinez votre signature au doigt/à la souris (ou vous réutilisez celle déjà enregistrée), et vous pouvez ajouter une **mention manuscrite libre** (ex. *« Bon pour accord »*, *« Avis favorable »*) que vous positionnez où vous voulez près de votre signature.
4. Selon le mode choisi pour vous par le créateur, vous confirmez avec votre certificat P12, un code reçu par SMS, ou simplement en validant.
5. Vous pouvez aussi **refuser** de signer, en indiquant un motif — le circuit s'arrête alors et le créateur est prévenu.

> 💡 Le lien de signature n'est utilisable qu'une fois et vous est personnel : ne le transférez pas à quelqu'un d'autre.

---

## 5. Les 3 façons de signer

| Mode | Ce que ça veut dire concrètement | Pour qui |
|---|---|---|
| **Simple** | Signature manuscrite dessinée à l'écran, mémorisée pour être réutilisée la fois suivante. | La grande majorité des agents et des usages courants. |
| **Sécurisée (certificat P12)** | En plus de la signature manuscrite, un certificat personnel protégé par mot de passe vient authentifier cryptographiquement l'acte. | Réservé aux directions générales et directeurs, pour les actes à forte valeur juridique. Non délégable. |
| **SMS (code à usage unique)** | Un code à 6 chiffres est envoyé par SMS et doit être saisi pour valider la signature, en plus du tracé manuscrit. | Renforce la preuve d'identité sans nécessiter de certificat personnel. |

---

## 6. Circuit séquentiel ou circuit parallèle ?

<svg viewBox="0 0 900 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:860px;height:auto;">
  <text x="20" y="24" font-size="13" font-weight="700" fill="#1e293b">Séquentiel — un signataire à la fois</text>

  <rect x="40" y="40" width="220" height="70" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="150" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Signataire 1</text>
  <text x="150" y="86" text-anchor="middle" font-size="11" fill="#1d4ed8">(en_cours)</text>

  <line x1="260" y1="75" x2="336" y2="75" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow2)"/>

  <rect x="340" y="40" width="220" height="70" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <text x="450" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="#475569">Signataire 2</text>
  <text x="450" y="86" text-anchor="middle" font-size="11" fill="#64748b">(en_attente)</text>

  <line x1="560" y1="75" x2="636" y2="75" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow2)"/>

  <rect x="640" y="40" width="220" height="70" rx="12" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <text x="750" y="68" text-anchor="middle" font-size="12" font-weight="700" fill="#475569">Signataire 3</text>
  <text x="750" y="86" text-anchor="middle" font-size="11" fill="#64748b">(en_attente)</text>

  <text x="450" y="132" text-anchor="middle" font-size="11" fill="#64748b">Le signataire suivant n'est sollicité qu'une fois le précédent signé</text>

  <text x="20" y="176" font-size="13" font-weight="700" fill="#1e293b">Parallèle — tout le monde en même temps</text>

  <circle cx="450" cy="196" r="8" fill="#7c3aed"/>
  <line x1="450" y1="204" x2="150" y2="226" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow2)"/>
  <line x1="450" y1="204" x2="450" y2="226" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow2)"/>
  <line x1="450" y1="204" x2="750" y2="226" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow2)"/>

  <rect x="40" y="230" width="220" height="60" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="150" y="256" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Signataire 1</text>
  <text x="150" y="274" text-anchor="middle" font-size="11" fill="#1d4ed8">(en_cours)</text>

  <rect x="340" y="230" width="220" height="60" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="450" y="256" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Signataire 2</text>
  <text x="450" y="274" text-anchor="middle" font-size="11" fill="#1d4ed8">(en_cours)</text>

  <rect x="640" y="230" width="220" height="60" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="750" y="256" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Signataire 3</text>
  <text x="750" y="274" text-anchor="middle" font-size="11" fill="#1d4ed8">(en_cours)</text>

  <defs>
    <marker id="ph-arrow2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"/>
    </marker>
  </defs>
</svg>

- **Séquentiel** : utile quand l'ordre compte (ex. *avis technique → validation hiérarchique → signature du Maire*). Chaque signataire ne voit le document que quand c'est son tour.
- **Parallèle** : utile quand l'ordre n'a pas d'importance (ex. plusieurs élus qui co-signent une même délibération) — tout le monde reçoit son lien immédiatement, et le parapheur se termine dès que **tous** ont signé, quel que soit l'ordre.

---

## 7. Suivre, relancer, annuler un parapheur

Sur la fiche d'un parapheur (`/parapheur/:id`) :

- Le **statut global** et le statut de **chaque signataire** sont affichés avec un code couleur : 🟠 en attente / en cours, 🟢 signé, 🔴 refusé, ⚪ annulé.
- **Relancer** renvoie l'e-mail de signature à un signataire qui tarde.
- **Annuler** stoppe définitivement le circuit (utile en cas d'erreur de document ou de signataire).
- Une fois **terminé**, vous pouvez télécharger le **dossier de preuves** (ZIP contenant les documents scellés et leur journal de signature) et voir le badge **« Sceau vérifié »**.

---

## 8. Déléguer sa signature

Si vous êtes absent (congés, mission), vous pouvez désigner un **délégataire** depuis l'onglet *Délégations* : choisissez la personne et la période. Pendant cette période, les documents qui vous sont adressés sont automatiquement signés par votre délégataire, avec la mention *« signé par X, par délégation de Y »*.

> ⚠️ La délégation n'est pas possible pour la signature **sécurisée (certificat P12)**, qui reste strictement personnelle.

---

## 9. Vérifier l'authenticité d'un document signé (QR code)

Chaque PDF scellé porte un **QR code** imprimé sur la dernière page. En le scannant (ou en ouvrant le lien qu'il contient), n'importe qui — y compris en dehors de la collectivité, sans compte ni mot de passe — accède à une page de contrôle qui indique :

- le contenu et les métadonnées du document ;
- la liste des signataires et la date de chaque signature ;
- si l'**intégrité** du fichier et la **chaîne de confiance** du sceau sont valides (voir [§11.3](#113-le-sceau-empreinte-sha-256-et-chaîne-de-confiance) pour le détail technique).

---

## 10. Questions fréquentes

**Je n'ai pas reçu l'e-mail de signature.**
Vérifiez vos courriers indésirables, puis demandez au créateur du parapheur de cliquer sur « Relancer ». Le lien précédent reste valable.

**Le bouton « Signer » reste grisé.**
C'est normal tant que vous n'avez pas fait défiler **tous** les documents jusqu'en bas — c'est une garantie de lecture, pas un bug.

**Je me suis trompé de signataire dans le circuit.**
Annulez le parapheur et recréez-en un correct ; un circuit en cours ne peut pas être modifié une fois lancé.

**Acrobat Reader affiche « signataire inconnu ou non fiable ».**
C'est attendu : les documents sont scellés avec l'**autorité de certification interne** de la collectivité, qui n'est pas enregistrée dans le magasin de confiance par défaut d'Adobe. Cela n'affecte pas la validité du document ; utilisez la page de vérification publique ([§9](#9-vérifier-lauthenticité-dun-document-signé-qr-code)) pour la preuve officielle.

**Puis-je signer depuis mon téléphone ?**
Oui, la page de signature fonctionne sur mobile (y compris pour dessiner sa signature au doigt).

---

## 11. Section avancée — comprendre les mécanismes techniques

> Cette section n'est pas nécessaire pour utiliser le module au quotidien. Elle explique, pour les agents curieux et les équipes techniques, **comment** le système garantit qu'un document scellé n'a pas été modifié et qu'il provient bien de la collectivité.

### 11.1 Architecture générale du scellement

Quand le **dernier signataire** valide sa signature, le parapheur passe au statut `terminé` et un processus de **scellement** se déclenche automatiquement côté serveur :

<svg viewBox="0 0 900 460" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:820px;height:auto;">
  <defs>
    <marker id="ph-arrow3" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"/>
    </marker>
  </defs>

  <rect x="260" y="10" width="380" height="56" rx="12" fill="#f8fafc" stroke="#475569" stroke-width="2"/>
  <text x="450" y="44" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">PDF signé par le dernier signataire</text>

  <line x1="360" y1="66" x2="260" y2="120" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>
  <line x1="540" y1="66" x2="650" y2="120" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>

  <rect x="40" y="120" width="380" height="80" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="2"/>
  <text x="230" y="144" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">Intégrité — empreinte SHA-256</text>
  <text x="230" y="166" text-anchor="middle" font-size="11" fill="#334155">Calcul du hash SHA-256</text>
  <text x="230" y="184" text-anchor="middle" font-size="11" fill="#334155">du fichier PDF final</text>

  <rect x="460" y="120" width="400" height="80" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="660" y="144" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Confiance — autorité de certification interne</text>
  <text x="660" y="166" text-anchor="middle" font-size="11" fill="#334155">Clé RSA 2048, chiffrée en base</text>
  <text x="660" y="184" text-anchor="middle" font-size="11" fill="#334155">(AES-256-GCM) au repos</text>

  <line x1="230" y1="200" x2="230" y2="240" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>
  <line x1="660" y1="200" x2="660" y2="240" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>

  <rect x="40" y="240" width="380" height="70" rx="12" fill="#f0fdf4" stroke="#16a34a" stroke-width="2"/>
  <text x="230" y="266" text-anchor="middle" font-size="12" font-weight="700" fill="#14532d">Stockage</text>
  <text x="230" y="286" text-anchor="middle" font-size="11" fill="#334155">Hash enregistré en base — colonne seal_hash</text>

  <rect x="460" y="240" width="400" height="70" rx="12" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2"/>
  <text x="660" y="266" text-anchor="middle" font-size="12" font-weight="700" fill="#1e3a8a">Signature technique</text>
  <text x="660" y="286" text-anchor="middle" font-size="11" fill="#334155">Certificat feuille éphémère + signature PAdES sur le PDF</text>

  <line x1="230" y1="310" x2="340" y2="352" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>
  <line x1="660" y1="310" x2="560" y2="352" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>

  <rect x="210" y="356" width="480" height="60" rx="12" fill="#fff7ed" stroke="#b45309" stroke-width="2"/>
  <text x="450" y="380" text-anchor="middle" font-size="12" font-weight="700" fill="#7c2d12">Vérification (page publique, à la demande)</text>
  <text x="450" y="400" text-anchor="middle" font-size="11" fill="#334155">Recalcul du hash + cert.verify(AC interne)</text>

  <line x1="450" y1="416" x2="450" y2="434" stroke="#94a3b8" stroke-width="2" marker-end="url(#ph-arrow3)"/>

  <rect x="210" y="436" width="480" height="20" rx="10" fill="none" stroke="none"/>
  <text x="450" y="450" text-anchor="middle" font-size="11" font-weight="700" fill="#0f172a">Sceau valide = has_pades ET hash_ok ET chain_ok</text>
</svg>

### 11.2 L'autorité de certification interne

DSIHUB génère, dès la première utilisation, sa propre **autorité de certification (AC) interne** :

- une paire de clés **RSA 2048 bits**, auto-signée, valable **15 ans**, générée avec la bibliothèque `node-forge` ;
- la **clé privée** de cette AC est chiffrée au repos (**AES-256-GCM**) avant d'être stockée en base — elle n'est jamais exposée en clair ;
- cette AC sert uniquement à signer des **certificats feuilles éphémères**, un par document scellé (voire par signature technique), jamais à signer directement au nom d'un agent.

> C'est un mécanisme équivalent, à plus petite échelle, à celui d'une autorité de certification publique (type ChamberSign, Certigna…) — sauf qu'ici l'AC est interne à la collectivité et sert exclusivement à prouver l'intégrité des documents produits par DSIHUB.

### 11.3 Le sceau : empreinte SHA-256 et chaîne de confiance

Le « sceau » apposé sur un parapheur terminé repose sur **deux vérifications indépendantes**, combinées :

| Vérification | Ce qu'elle prouve | Comment |
|---|---|---|
| **Intégrité** | Le fichier n'a pas été modifié depuis son scellement. | Le hash **SHA-256** du PDF est recalculé à la demande et comparé à la valeur `seal_hash` enregistrée en base au moment du scellement. |
| **Chaîne de confiance** | Le certificat qui a scellé le document provient bien de la collectivité. | Le certificat de scellement est vérifié cryptographiquement (`cert.verify(caCert)`) : il doit avoir été signé par l'AC interne décrite au §11.2. |

Le résultat global (`all_valid`) n'est vrai que si **les deux** contrôles réussissent, en plus de la présence effective d'une signature PAdES sur le fichier (`has_pades`). C'est ce triple contrôle qui est résumé par le badge **« Sceau vérifié »**.

> ℹ️ Le message « signataire inconnu » d'Adobe Acrobat (voir [FAQ](#10-questions-fréquentes)) n'est pas une erreur de sécurité : Acrobat compare simplement le certificat à son propre magasin de confiance public, qui ne connaît pas l'AC interne de la collectivité.

### 11.4 La signature PAdES et les bibliothèques utilisées

- Les documents sont manipulés côté serveur avec **`pdf-lib`** (assemblage, apposition visuelle des signatures et mentions).
- La signature cryptographique finale suit la norme **PAdES** (*PDF Advanced Electronic Signatures*), apposée via **`@signpdf/signpdf`** et un module *signer P12* : le certificat feuille éphémère (§11.2) est empaqueté en `.p12` avec un mot de passe généré aléatoirement, utilisé uniquement le temps de la signature puis jamais réutilisé.
- Côté navigateur, l'affichage et le rendu page à page des PDF (visionneuse, miniatures, mode mobile/Safari) utilisent **`pdf.js`**.

### 11.5 Mentions manuscrites et pad de signature

- Le pad de signature (`SignaturePad.tsx`) s'appuie sur `react-signature-canvas` : le tracé est automatiquement **rogné** aux limites du dessin, puis converti en image PNG, mémorisée pour être proposée par défaut lors des prochaines signatures du même agent.
- La **mention libre** (ex. *« Bon pour accord »*, 120 caractères maximum) saisie par le signataire est convertie côté client en image « manuscrite » via une police cursive, positionnable indépendamment du cadre de signature, puis intégrée au PDF au même titre que la signature.

### 11.6 Sécurité : mots de passe, OTP, chiffrement au repos

- **Certificat P12** : le mot de passe du certificat personnel n'est jamais stocké en clair ; il est saisi à chaque signature (ou mémorisé chiffré, selon le paramétrage choisi par l'agent).
- **Code SMS** : le code à usage unique (6 chiffres) expire au bout de **10 minutes** et n'est jamais conservé en clair en base — seul son **hash SHA-256** l'est, pour vérification.
- **Clé privée de l'AC interne** : chiffrée au repos en **AES-256-GCM** (voir §11.2).
- **Lien de signature par signataire** : jeton unique, à usage personnel, qui ne donne accès qu'aux documents du parapheur concerné.

### 11.7 Référence rapide des points d'API

Pour les équipes techniques amenées à déboguer ou faire évoluer le module (`backend/modules/parapheur/`) :

| Endpoint | Rôle |
|---|---|
| `POST /api/parapheur` | Création d'un parapheur (documents, annexes, signataires, circuit). |
| `GET /api/parapheur/a-signer` / `/signes` / `/all` | Listes filtrées par statut, selon le profil de l'utilisateur connecté. |
| `POST /api/parapheur/public/:token/sign` \| `/reject` | Actions du signataire, via son jeton personnel (sans session applicative). |
| `GET /api/parapheur/:id/verify-seal` | Recalcule et renvoie le résultat des vérifications d'intégrité et de chaîne de confiance. |
| `GET /api/parapheur/verify/:token` | Point d'entrée public (QR code), sans authentification. |
| `GET /api/parapheur/admin/ca` | Émission/consultation de l'autorité de certification interne (réservé admin). |

---

*Une question qui ne trouve pas de réponse ici ? Contactez la DSI.*
