document.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('phone');
    const pairButton = document.getElementById('pair-button');
    const qrButton = document.getElementById('qr-button');
    const qrCodeContainer = document.getElementById('qr-code-container');
    const qrCodeEl = document.getElementById('qr-code');
    const pairingCodeContainer = document.getElementById('pairing-code-container');
    const pairingCodeEl = document.getElementById('pairing-code');
    const sessionIdContainer = document.getElementById('session-id-container');
    const sessionIdEl = document.getElementById('session-id');
    const copyButton = document.getElementById('copy-button');
    const statusLog = document.getElementById('status-log');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}`);

    const logStatus = (message) => {
        const p = document.createElement('p');
        p.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        statusLog.appendChild(p);
        statusLog.scrollTop = statusLog.scrollHeight;
    };

    ws.onopen = () => {
        logStatus('Connected to server.');
    };

    ws.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            switch (type) {
                case 'status':
                    logStatus(data);
                    break;
                case 'qr':
                    qrCodeEl.innerHTML = '';
                    const qr = qrcode(0, 'L');
                    qr.addData(data);
                    qr.make();
                    qrCodeEl.innerHTML = qr.createImgTag(4);
                    qrCodeContainer.classList.remove('hidden');
                    logStatus('QR code received.');
                    break;
                case 'pairing-code':
                    pairingCodeEl.textContent = data;
                    pairingCodeContainer.classList.remove('hidden');
                    logStatus(`Pairing code received: ${data}`);
                    break;
                case 'session':
                    sessionIdEl.value = data;
                    sessionIdContainer.classList.remove('hidden');
                    qrCodeContainer.classList.add('hidden');
                    pairingCodeContainer.classList.add('hidden');
                    logStatus('Session ID received.');
                    break;
            }
        } catch (error) {
            logStatus('Error processing message from server.');
        }
    };

    ws.onclose = () => {
        logStatus('Disconnected from server.');
    };

    ws.onerror = () => {
        logStatus('WebSocket error.');
    };

    pairButton.addEventListener('click', async () => {
        const phone = phoneInput.value;
        if (!phone) {
            alert('Please enter a phone number.');
            return;
        }

        logStatus(`Requesting pairing code for ${phone}...`);
        qrCodeContainer.classList.add('hidden');
        pairingCodeContainer.classList.add('hidden');
        sessionIdContainer.classList.add('hidden');

        try {
            const response = await fetch('/pair', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });
            const result = await response.json();
            if (response.ok) {
                logStatus(result.message);
            } else {
                logStatus(`Error: ${result.error}`);
            }
        } catch (error) {
            logStatus('Failed to send pairing request.');
        }
    });

    qrButton.addEventListener('click', async () => {
        logStatus('Requesting QR code...');
        qrCodeContainer.classList.add('hidden');
        pairingCodeContainer.classList.add('hidden');
        sessionIdContainer.classList.add('hidden');

        try {
            const response = await fetch('/qr', { method: 'POST' });
            const result = await response.json();
            if (response.ok) {
                logStatus(result.message);
            } else {
                logStatus(`Error: ${result.error}`);
            }
        } catch (error) {
            logStatus('Failed to send QR request.');
        }
    });

    copyButton.addEventListener('click', () => {
        sessionIdEl.select();
        document.execCommand('copy');
        alert('Session ID copied to clipboard!');
    });
});
