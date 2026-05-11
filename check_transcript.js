const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function check() {
    const db = await open({
        filename: path.join(__dirname, 'backend', 'data', 'database.sqlite'),
        driver: sqlite3.Database
    });

    const lastMeeting = await db.get("SELECT id, title FROM transcript_meetings ORDER BY id DESC LIMIT 1");
    if (!lastMeeting) {
        console.log("No meeting found");
        return;
    }

    const cues = await db.all("SELECT * FROM transcript_cues WHERE meeting_id = ? ORDER BY start_seconds", [lastMeeting.id]);
    const transcriptText = cues.map(c => `[${c.start_seconds}] ${c.speaker_name}: ${c.text}`).join('\n');
    
    console.log(`Meeting: ${lastMeeting.title} (ID: ${lastMeeting.id})`);
    console.log(`Cues count: ${cues.length}`);
    console.log(`Transcript text length: ${transcriptText.length} characters`);
    console.log(`Approx size: ${(transcriptText.length / 1024).toFixed(2)} KB`);
}

check();
