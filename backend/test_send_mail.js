const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const nodemailer = require('nodemailer');

async function test() {
    const db = await open({
        filename: path.join(__dirname, 'database.sqlite'),
        driver: sqlite3.Database
    });

    const s = await db.get('SELECT * FROM mail_settings WHERE id = 1');
    if (!s) throw new Error("Paramètres mail non configurés");

    console.log('Using settings:', {
        host: s.smtp_host,
        port: s.smtp_port,
        secure: s.smtp_secure === 'ssl',
        user: s.smtp_user,
        from: `"${s.sender_name}" <${s.sender_email}>`
    });

    let transporter;

    if (s.smtp_host) {
        transporter = nodemailer.createTransport({
            host: s.smtp_host,
            port: s.smtp_port,
            secure: s.smtp_secure === 'ssl',
            auth: {
                user: s.smtp_user,
                pass: s.smtp_pass
            },
            debug: true,
            logger: true
        });
    } else {
        const brevoTransport = require('nodemailer-brevo-transport');
        transporter = nodemailer.createTransport(new brevoTransport({
            apiKey: s.smtp_pass
        }));
    }
    
    const content = "Test mail content";
    const html = s.template_html.replace('{{content}}', content);

    try {
        const info = await transporter.sendMail({
            from: `"${s.sender_name}" <${s.sender_email}>`,
            to: 'machevalier@gmail.com', // Test recipient
            subject: "Test d'envoi DSI Hub",
            html
        });
        console.log('Mail sent successfully:', info);
    } catch (error) {
        console.error('Failed to send mail:', error);
    }
    await db.close();
}

test().catch(err => console.error(err));
