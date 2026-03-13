const setupDb = require('./db');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const https = require('https');

async function downloadAndFix() {
    const db = await setupDb();
    const rows = await db.all('SELECT id, icon FROM magapp_apps');
    
    const targetDir = path.resolve(__dirname, 'magapp_img');
    if (!fs.existsSync(targetDir)) {
        console.log(`Creating directory: ${targetDir}`);
        fs.mkdirSync(targetDir, { recursive: true });
    }
    
    const agent = new https.Agent({  
      rejectUnauthorized: false
    });

    for (const row of rows) {
        if (row.icon) {
            let fileName = path.basename(row.icon);
            // Nettoyage nom de fichier pour Windows
            fileName = fileName.replace(/[?#].*$/, ''); 
            
            const targetPath = path.join(targetDir, fileName);
            
            const remoteUrl = `https://magapp.ivry.local/img/${fileName}`;
            try {
                if (!fs.existsSync(targetPath)) {
                    console.log(`Downloading ${remoteUrl}...`);
                    const response = await axios.get(remoteUrl, { 
                        responseType: 'arraybuffer',
                        httpsAgent: agent
                    });
                    fs.writeFileSync(targetPath, response.data);
                    console.log(`Saved ${fileName}`);
                }
                
                const newPath = `/magapp/img/${fileName}`;
                await db.run('UPDATE magapp_apps SET icon = ? WHERE id = ?', [newPath, row.id]);
            } catch (error) {
                console.error(`Failed ${fileName}: ${error.message}`);
            }
        }
    }
    console.log('Fini !');
    process.exit(0);
}

downloadAndFix();
