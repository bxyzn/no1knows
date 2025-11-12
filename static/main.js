const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

var socket = io.connect(protocol + document.domain + ':' + location.port);
let username = "";
let psk = "";
let _historyResolved = false;
let _historyResolve;
const historyLoaded = new Promise((resolve) => { _historyResolve = resolve; });

window.onload = async function () {
    changePsk();
    if (localStorage.getItem("username")) {
        username = localStorage.getItem("username");
        if (confirm("Hi " + username + ". Do you want to change your username?")) {
            changeUsername();
        } else {
            setUsername(username);
        }
    } else {
        changeUsername();
    }

    socket.emit('newuser');

    setLoading(true);

    const HISTORY_TIMEOUT_MS = 30000; // 30s fallback
    await Promise.race([
        historyLoaded,
        new Promise((res) => setTimeout(res, HISTORY_TIMEOUT_MS))
    ]);

    setLoading(false);
};

function changePsk() {
    const v = prompt("Enter your password:") || "";
    if (!v || v.trim() === "") {
        alert("NO PASSWORD IS SET! Reload page to change password...");
        location.reload();
        return;
    }
    psk = v;
}

function changeUsername() {
    username = prompt("Enter your username:");
    if (!username || username.trim() === "") {
        alert("Username is required! Reload the page...");
        location.reload();
        psk = "";
        return;
    }
    setUsername(username.trim());
}

function setUsername(name) {
    localStorage.setItem("username", name);
    var el = document.getElementById("username");
    if (el) {
        el.innerHTML = "@" + name;
    }
}

function scrollMessagesToBottom(smooth = false) {
    const list = document.getElementById('messages');
    if (list) {
        try {
            if (smooth && typeof list.scrollTo === 'function') {
                list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
            } else {
                list.scrollTop = list.scrollHeight;
            }
        } catch (e) {
            window.scrollTo(0, document.body.scrollHeight);
        }
    } else {
        window.scrollTo(0, document.body.scrollHeight);
    }
}

function setLoading(show) {
    const el = document.getElementById('loading');
    if (!el) return;
    try {
        el.style.display = show ? 'flex' : 'none';
        el.setAttribute('aria-hidden', show ? 'false' : 'true');
    } catch (e) {
        // ignore
    }
}

async function sendMessage() {
    var msg = document.getElementById('m').value;
    if (msg && msg.startsWith('!')) {
        const token = msg.slice(1).trim();
        if (token) {
            socket.emit('getcommand', token);
        }
        document.getElementById('m').value = '';
        return;
    }
    broadcaster(msg, username);
    document.getElementById('m').value = '';
}

async function broadcaster(msg, username = username) {
    if (msg) {
        var payload = {
            username: username,
            msg: msg,
        };

        try {
            const encrypted = await window.encryptData(psk, payload);
            socket.emit('message', encrypted);
        } catch (err) {
            console.error('Encryption failed', err);
            alert('Failed to encrypt message. Check console for details.');
        }
    }
}

socket.on('message', async function (payload) {
    var item = document.createElement('li');
    try {
        const decrypted = await window.decryptData(psk, payload);
        let uname = (decrypted && decrypted.username) ? decrypted.username : 'unknown';
        let msg = (decrypted && decrypted.msg) ? decrypted.msg : '';
        item.textContent = uname + " : " + msg;
    } catch (err) {
        console.warn('Decryption failed for incoming message', err);
        item.textContent = 'USER : Encrypted Message';
    }

    var list = document.getElementById('messages');
    if (list) {
        list.appendChild(item);
        scrollMessagesToBottom();
    }
});

socket.on('history', async function (payloads) {
    try {
        if (!payloads) return;
        if (!Array.isArray(payloads)) {
            console.warn('history: expected array, got', payloads);
            return;
        }

        for (let i = 0; i < payloads.length; i++) {
            const payload = payloads[i];
            var item = document.createElement('li');
            try {
                const decrypted = await window.decryptData(psk, payload);
                let uname = (decrypted && decrypted.username) ? decrypted.username : 'unknown';
                let msg = (decrypted && decrypted.msg) ? decrypted.msg : '';
                item.textContent = uname + " : " + msg;
            } catch (err) {
                console.warn('Decryption failed for history message', err);
                item.textContent = 'USER : Encrypted Message';
            }
            var list = document.getElementById('messages');
            if (list) {
                list.appendChild(item);
            }
        }

        scrollMessagesToBottom();
    } catch (err) {
        console.error('Failed to process history', err);
    } finally {
        if (!_historyResolved) {
            _historyResolved = true;
            try { _historyResolve(); } catch (e) { /* ignore */ }
        }
    }
});

socket.on('history_cleared', function () {
    const list = document.getElementById('messages');
    if (list) {
        list.innerHTML = '';
    }
    setLoading(false);
});
