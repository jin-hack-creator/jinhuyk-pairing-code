const { Boom } = require('@hapi/boom');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, Browsers, makeCacheableSignalKeyStore, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const cors = require('cors');
const express = require('express');
const path = require('path');
const pino = require('pino');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');

const logger = pino({ transport: { target: 'pino-pretty', options: { colorize: true, timestamp: true } } });

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(cors({ origin: '*' }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 8000;
const clients = new Set();

wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    logger.info(`New WebSocket connection from ${clientIp}`);
    clients.add(ws);

    ws.on('error', (error) => logger.error('WebSocket error:', error));
    ws.on('close', () => {
        logger.info(`Client ${clientIp} disconnected`);
        clients.delete(ws);
    });
});

const broadcast = (type, data) => {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
        if (client.readyState === 1) client.send(message);
    });
};

app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    logger.info(`Received pairing request for phone: ${phone}`);

    if (!phone) {
        return res.status(400).json({ error: 'Please Provide Phone Number' });
    }

    try {
        await startWhatsApp(phone);
        res.json({ success: true, message: 'Pairing process started. Check your WhatsApp for the pairing code.' });
    } catch (error) {
        logger.error('Error in WhatsApp authentication:', error);
        res.status(500).json({ error: 'WhatsApp Authentication Failed', details: error.message });
    }
});

app.post('/qr', async (req, res) => {
    logger.info('Received QR code request');
    try {
        await startWhatsApp();
        res.json({ success: true, message: 'QR code generation started.' });
    } catch (error) {
        logger.error('Error in WhatsApp authentication:', error);
        res.status(500).json({ error: 'WhatsApp Authentication Failed', details: error.message });
    }
});

async function saveState() {
    try {
        const credsPath = path.join(__dirname, 'auth_info_baileys', 'creds.json');
        if (!fs.existsSync(credsPath)) {
            logger.error('Credentials file not found');
            return;
        }
        const credsData = fs.readFileSync(credsPath, 'utf-8');
        const base64Creds = Buffer.from(credsData).toString('base64');
        const sessionId = `JINHUYK-MD;;;${base64Creds}`;
        logger.info('Broadcasting session data');
        broadcast('session', sessionId);
    } catch (error) {
        logger.error('Error saving state:', error);
        throw error;
    }
}

async function startWhatsApp(phone = null) {
    try {
        const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, 'auth_info_baileys'));

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Jinhuyk-MD-Pairing'),
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            logger.info(`Connection status update: ${connection}`);
            broadcast('status', `Connection: ${connection}`);

            if (qr) {
                logger.info('QR code received');
                broadcast('qr', qr);
            }

            if (connection === 'open') {
                await saveState();
                logger.info('Connected to WhatsApp Servers.');
                broadcast('status', 'Connected! Session ID generated.');

                const welcomeMessage = `
🎉 *Welcome to JINHUYK-HACK-MD!* 🚀  

✅ *Successfully Configured!*
✔️ Session Created & Secured

🔒 *Your Session ID* is ready!  
⚠️ _Keep it private and secure - don't share it with anyone._ 

💡 *What's Next?* 
1️⃣ Explore all the cool features
2️⃣ Check /menu for commands
3️⃣ Enjoy seamless automation! 🤖  

⭐ *GitHub:* 
👉 https://github.com/jin-hack-creator/JINHUYK-HACK-MD  

📞 *Contact:*
👉 +242067274660

🚀 _Thanks for choosing JINHUYK-HACK-MD!_ ✨
`;
                await sock.sendMessage(sock.user.id, {
                    image: { url: 'https://i.postimg.cc/sx2KY0mS/JINHUYK-MD-V1.jpg' },
                    caption: welcomeMessage
                });
            }

            if (connection === 'close') {
                let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
                logger.warn(`Connection closed. Reason: ${reason}`);
                broadcast('status', `Connection closed. Reason: ${reason}`);
                if (reason === DisconnectReason.restartRequired) {
                    logger.info('Restart required, attempting to reconnect');
                    startWhatsApp(phone);
                }
            }
        });

        if (phone && !sock.authState.creds.registered) {
            let phoneNumber = phone.replace(/[^0-9]/g, '');
            if (phoneNumber.length < 11) {
                throw new Error('Please Enter Your Number With Country Code !!');
            }

            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    logger.info(`Pairing code: ${code}`);
                    broadcast('pairing-code', code);
                } catch (error) {
                    logger.error('Error requesting pairing code:', error);
                    broadcast('status', 'Error requesting pairing code.');
                }
            }, 3000);
        }

    } catch (error) {
        logger.error('Fatal error in startWhatsApp:', error);
        throw new Error(error.message || 'An Error Occurred');
    }
}

server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Open http://localhost:${PORT} in your browser.`);
});

server.on('error', (error) => logger.error('Server error:', error));
process.on('uncaughtException', (error) => logger.error('Uncaught Exception:', error));
process.on('unhandledRejection', (reason, promise) => logger.error('Unhandled Rejection at:', promise, 'reason:', reason));
