const ctrl = require('./modules/projets/projets.controller');

function mockRes() {
  const res = { statusCode: 200 };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (d) => { res.body = d; return res; };
  res.end = () => res;
  return res;
}

(async () => {
  const projetId = '18';
  const user = { username: 'claude_test' };

  // 1) créer un dossier
  let req = { params: { id: projetId }, body: { nom: 'TestExplorer' }, user };
  let res = mockRes();
  await ctrl.createExplorerFolder(req, res);
  console.log('createFolder ->', res.statusCode, res.body);
  const folderId = res.body.id;

  // 2) uploader un fichier dans ce dossier
  req = {
    params: { id: projetId },
    body: { folder_id: String(folderId) },
    user,
    files: [{ buffer: Buffer.from('hello explorer'), originalname: 'test.txt', mimetype: 'text/plain', size: 15 }],
  };
  res = mockRes();
  await ctrl.uploadExplorerFiles(req, res);
  console.log('upload ->', res.statusCode, JSON.stringify(res.body));

  // 3) lister les documents du dossier
  req = { params: { id: projetId }, query: { folder_id: String(folderId) } };
  res = mockRes();
  await ctrl.getExplorerDocuments(req, res);
  console.log('list in folder ->', res.statusCode, JSON.stringify(res.body, null, 2));

  // 4) lister la racine — vérifie que les anciens documents (21 attendus) sont toujours là
  req = { params: { id: projetId }, query: {} };
  res = mockRes();
  await ctrl.getExplorerDocuments(req, res);
  console.log('list at root -> count:', res.body?.length);

  // 5) nettoyage : supprimer le document de test + le dossier de test
  const docId = res.body?.find?.(() => false); // noop, we fetch from folder list instead
  req = { params: { id: projetId }, query: { folder_id: String(folderId) } };
  res = mockRes();
  await ctrl.getExplorerDocuments(req, res);
  const testDoc = res.body[0];
  if (testDoc) {
    req = { params: { id: projetId, docId: String(testDoc.id) }, user };
    res = mockRes();
    await ctrl.deleteExplorerDocument(req, res);
    console.log('cleanup delete doc ->', res.statusCode);
  }
  req = { params: { id: projetId, folderId: String(folderId) } };
  res = mockRes();
  await ctrl.deleteExplorerFolder(req, res);
  console.log('cleanup delete folder ->', res.statusCode);

  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
