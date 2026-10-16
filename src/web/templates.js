// Templates are defined as getters so the large HTML strings are only
// allocated when a panel/login/setup route is actually requested.
// WebSocket proxy requests never touch this object, so on a cold start
// triggered by a proxy connection the runtime never allocates these strings
// — which was a major contributor to "Worker exceeded memory limit" errors.
const HTML_TEMPLATES = {
  get nginx() { return `<!DOCTYPE html>
<html>
<head>
<title>Welcome to nginx!</title>
<style>
html { color-scheme: light dark; }
body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
</style>
</head>
<body>
<h1>Welcome to nginx!</h1>
<p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p>
<p>For online documentation and support please refer to <a href="http://nginx.org/">nginx.org</a>.<br/>Commercial support is available at <a href="http://nginx.com/">nginx.com</a>.</p>
<p><em>Thank you for using nginx.</em></p>
</body>
</html>`; },

  get setup() { return `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Set Panel Password</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#0a0a0a', input: '#121212', border: '#1f1f1f' } }
                }
            }
        }
    </script>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-bold mb-2 text-center text-blue-600 dark:text-blue-400">Set New Password</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">This is your first login to the admin panel. Please set a secure password.</p>
        
        <form onsubmit="handleSetup(event)" class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1.5">Password</label>
                <input type="password" id="password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required minlength="4">
            </div>
            <div>
                <label class="block text-sm font-medium mb-1.5">Confirm Password</label>
                <input type="password" id="confirm-password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required minlength="4">
            </div>
            <p id="error-msg" class="hidden text-sm text-red-500 text-center"></p>
            <button type="submit" id="submit-btn" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition font-bold">Set & Login</button>
        </form>
    </div>

    <script>
        function showError(msg) {
            const el = document.getElementById('error-msg');
            el.textContent = msg;
            el.classList.remove('hidden');
        }

        async function handleSetup(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;
            const btn = document.getElementById('submit-btn');
            document.getElementById('error-msg').classList.add('hidden');

            if (password !== confirmPassword) {
                showError('⚠️ Passwords do not match!');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const res = await fetch('/api/setup-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    window.location.reload();
                } else {
                    showError('Error: ' + (data.error || 'Operation failed'));
                }
            } catch (err) {
                showError('Server connection error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Set & Login';
            }
        }
    </script>
</body>
</html>`; },

  get login() { return `<!DOCTYPE html>
<html lang="fa" dir="rtl" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel Login</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#0a0a0a', input: '#121212', border: '#1f1f1f' } }
                }
            }
        }
    </script>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen flex items-center justify-center p-4">
    <div class="w-full max-w-md bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-6">
        <h2 class="text-xl font-bold mb-2 text-center text-blue-600 dark:text-blue-400">Admin Panel Login</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">Enter your password to access the admin panel.</p>
        
        <form onsubmit="handleLogin(event)" class="space-y-4">
            <div>
                <label class="block text-sm font-medium mb-1.5">Password</label>
                <input type="password" id="password" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono" required>
            </div>
            <p id="error-msg" class="hidden text-sm text-red-500 text-center"></p>
            <button type="submit" id="submit-btn" class="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition font-bold">Login</button>
        </form>
    </div>

    <script>
        async function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const btn = document.getElementById('submit-btn');
            const errorEl = document.getElementById('error-msg');
            errorEl.classList.add('hidden');

            btn.disabled = true;
            btn.textContent = 'Checking...';

            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (res.ok && data.success) {
                    window.location.reload();
                } else {
                    errorEl.textContent = res.status === 429 ? data.error : '❌ Incorrect password!';
                    errorEl.classList.remove('hidden');
                }
            } catch (err) {
                errorEl.textContent = 'Server connection error';
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Login';
            }
        }
    </script>
</body>
</html>`; },

  get panel() { return `
<!DOCTYPE html>
<html lang="en" dir="ltr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>∞ Nexus</title>
    <script>
        const originalWarn = console.warn;
        console.warn = (...args) => {
            if (typeof args[0] === 'string' && args[0].includes('cdn.tailwindcss.com')) return;
            originalWarn(...args);
        };
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
    <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" type="text/css" />
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    fontFamily: { sans: ['Vazirmatn', 'sans-serif'] },
                    colors: { amoled: { bg: '#000000', card: '#0a0a0a', input: '#121212', border: '#1f1f1f' } }
                }
            }
        }
    </script>
    <style>body { font-family: 'Vazirmatn', sans-serif; }</style>
</head>
<body class="bg-gray-50 text-gray-900 dark:bg-amoled-bg dark:text-zinc-100 min-h-screen transition-colors duration-200">

    <header class="border-b border-gray-200 dark:border-amoled-border bg-white dark:bg-amoled-card px-4 py-3">
        <div class="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <!-- Left: logo + version -->
            <div class="flex items-center gap-2 min-w-0" dir="ltr">
                <div class="w-8 h-8 flex-shrink-0 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
                    <svg class="w-5 h-5" viewBox="0 0 50 25" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                            <linearGradient id="infGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stop-color="#60a5fa"/>
                                <stop offset="100%" stop-color="#a78bfa"/>
                            </linearGradient>
                        </defs>
                        <path d="M25 12.5C25 12.5 20 2 12.5 2C6.1 2 2 7 2 12.5C2 18 6.1 23 12.5 23C20 23 25 12.5 25 12.5ZM25 12.5C25 12.5 30 2 37.5 2C43.9 2 48 7 48 12.5C48 18 43.9 23 37.5 23C30 23 25 12.5 25 12.5Z" stroke="url(#infGrad)" stroke-width="3.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <span class="font-bold text-gray-900 dark:text-zinc-100 text-base leading-none">Nexus</span>
                <span class="text-[10px] px-1.5 py-0.5 font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md leading-none">v1.0</span>
            </div>

            <!-- Right: actions -->
            <div class="flex items-center gap-1.5 flex-shrink-0">
                <!-- Social links -->
                <a href="https://github.com/AG-Morgan/Zeus-Panel" target="_blank" rel="noopener noreferrer" title="GitHub"
                   class="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                    <svg class="w-4.5 h-4.5 w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z"/>
                    </svg>
                </a>
                <a href="https://t.me/ag_morgan" target="_blank" rel="noopener noreferrer" title="Telegram"
                   class="w-9 h-9 flex items-center justify-center rounded-xl text-sky-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition">
                    <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.94-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/>
                    </svg>
                </a>

                <div class="w-px h-5 bg-gray-200 dark:bg-zinc-700 mx-0.5"></div>

                <!-- Theme toggle -->
                <button id="theme-toggle" title="Toggle theme"
                        class="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                    <svg id="sun-icon" class="w-[18px] h-[18px] hidden dark:block text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M14 12a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
                    <svg id="moon-icon" class="w-[18px] h-[18px] block dark:hidden text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
                </button>

                <!-- Settings -->
                <button onclick="toggleSettingsModal(true)" title="Settings"
                        class="w-9 h-9 flex items-center justify-center rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                    <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                </button>

                <!-- Add user — primary CTA -->
                <button onclick="openCreateModal()" title="New User"
                        class="w-9 h-9 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md transition-all duration-200">
                    <svg class="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
                </button>
            </div>
        </div>
    </header>

    <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-indigo-400 dark:hover:border-indigo-500/50 transition duration-300 relative overflow-hidden group flex flex-col gap-3">
                <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-indigo-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400">Total Users</span>
                    <div class="p-2 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                    </div>
                </div>
                <div class="relative z-10">
                    <div class="text-3xl font-black text-gray-900 dark:text-zinc-100" id="stat-total-users">0</div>
                    <span class="text-xs text-indigo-500 dark:text-indigo-400 flex items-center gap-1 font-medium mt-1">
                        <span class="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping"></span>
                        Registered
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-500/50 transition duration-300 relative overflow-hidden group flex flex-col gap-3">
                <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-emerald-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400">Online Now</span>
                    <div class="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                </div>
                <div class="relative z-10">
                    <div class="text-3xl font-black text-emerald-600 dark:text-emerald-400" id="stat-active-users">0</div>
                    <span class="text-xs text-emerald-500 dark:text-emerald-400 flex items-center gap-1 font-medium mt-1">
                        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        Connected
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-500/50 transition duration-300 relative overflow-hidden group flex flex-col gap-3">
                <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400">Traffic (30d)</span>
                    <div class="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                    </div>
                </div>
                <div class="relative z-10">
                    <div class="text-3xl font-black text-blue-600 dark:text-blue-400" id="stat-total-usage">0 GB</div>
                    <span class="text-xs text-blue-500 dark:text-blue-400 flex items-center gap-1 font-medium mt-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path></svg>
                        All users
                    </span>
                </div>
            </div>

            <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-500/50 transition duration-300 relative overflow-hidden group flex flex-col gap-3 cursor-pointer" onclick="sortTableBy('last_active')" title="Click to sort by last active">
                <div class="absolute -right-3 -bottom-3 w-20 h-20 bg-amber-500/10 rounded-full blur-xl group-hover:scale-150 transition duration-500"></div>
                <div class="flex items-center justify-between relative z-10">
                    <span class="text-xs font-semibold text-gray-500 dark:text-zinc-400">Last Active</span>
                    <div class="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                </div>
                <div class="relative z-10">
                    <div class="text-2xl font-black text-amber-600 dark:text-amber-400 truncate" id="stat-top-user">-</div>
                    <span class="text-xs text-amber-500 dark:text-amber-400 flex items-center gap-1 font-medium mt-1" id="stat-top-user-usage">Never seen</span>
                </div>
            </div>
        </div>

        <div id="loading-state" class="text-center py-16">
            <div class="inline-flex flex-col items-center gap-3">
                <svg class="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span class="text-sm text-gray-400 dark:text-zinc-500">Loading users...</span>
            </div>
        </div>
        
        <div id="users-table-container" class="hidden">
            <div class="flex items-center justify-between mb-4 gap-3">
                <h2 class="text-lg font-bold text-gray-800 dark:text-zinc-200 flex-shrink-0">User List</h2>
                <div class="relative max-w-xs w-full">
                    <svg class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0"></path></svg>
                    <input id="user-search" type="text" placeholder="Search users..." class="w-full pl-9 pr-3 py-2 text-sm bg-white dark:bg-amoled-input border border-gray-200 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-zinc-200" oninput="filterUsersTable(this.value)">
                </div>
            </div>
            <div id="users-tbody" class="flex flex-col gap-3"></div>
        </div>

        <div id="empty-state" class="hidden p-12 border border-dashed border-gray-300 dark:border-amoled-border rounded-2xl text-center">
            <svg class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-zinc-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            <p class="text-gray-500 dark:text-zinc-400 mb-4">No users yet.</p>
            <button onclick="openCreateModal()" class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                Create First User
            </button>
        </div>
    </main>

    <div id="user-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full max-w-lg bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl overflow-hidden transition-all transform duration-300 opacity-0 scale-95 ease-out flex flex-col max-h-[92vh]">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-amoled-border flex justify-between items-center flex-shrink-0">
                <h3 id="modal-title" class="font-bold text-gray-900 dark:text-zinc-100">Create New User</h3>
                <button onclick="toggleModal(false)" class="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 transition">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <form id="create-user-form" class="p-6 space-y-5 overflow-y-auto flex-1" onsubmit="handleFormSubmit(event)">
                <!-- Username -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Username</label>
                    <input type="text" id="input-name" placeholder="e.g. john_vpn" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" required>
                </div>

                <!-- Data limit + Expiry -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Data Limit (GB)</label>
                        <input type="number" id="input-limit" min="0" step="any" placeholder="Unlimited" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Validity (days)</label>
                        <input type="number" id="input-expiry" min="0" placeholder="Unlimited" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                    </div>
                </div>

                <!-- Ports -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Connection Ports <span class="normal-case font-normal text-gray-400 dark:text-zinc-500">(select any mix — TLS auto-detected per port)</span></label>
                    <div class="rounded-xl border border-gray-200 dark:border-amoled-border overflow-hidden">
                        <!-- TLS row -->
                        <div class="flex items-center gap-2 px-3 py-2.5 bg-blue-50/60 dark:bg-blue-950/20 border-b border-gray-200 dark:border-amoled-border">
                            <span class="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">TLS</span>
                            <div id="tls-port-pills" class="flex flex-wrap gap-1.5"></div>
                        </div>
                        <!-- Plain row -->
                        <div class="flex items-center gap-2 px-3 py-2.5 bg-amber-50/60 dark:bg-amber-950/20">
                            <span class="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">Plain</span>
                            <div id="plain-port-pills" class="flex flex-wrap gap-1.5"></div>
                        </div>
                    </div>
                </div>

                <!-- Fingerprint -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">TLS Fingerprint</label>
                    <div class="relative">
                        <select id="fingerprint-select" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm appearance-none cursor-pointer">
                            <option value="chrome">🌐 Chrome (recommended)</option>
                            <option value="firefox">🦊 Firefox</option>
                            <option value="safari">🧭 Safari</option>
                            <option value="ios">📱 iOS</option>
                            <option value="android">🤖 Android</option>
                            <option value="edge">🌀 Edge</option>
                            <option value="360">🔒 360 Browser</option>
                            <option value="qq">💬 QQ Browser</option>
                            <option value="random">🎲 Random</option>
                            <option value="randomized">🎭 Randomized</option>
                        </select>
                        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>
                </div>

                <!-- Clean IPs -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Clean IPs <span class="normal-case font-normal text-gray-400 dark:text-zinc-500">(optional — one per line)</span></label>
                    <textarea id="input-ips" rows="2" placeholder="104.16.0.1" class="w-full px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-mono resize-none"></textarea>
                </div>

                <!-- Config Tag -->
                <div>
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">Config Tag <span class="normal-case font-normal text-gray-400 dark:text-zinc-500">(optional — replaces ⁿᵉˣᵘˢ prefix)</span></label>
                    <input type="text" id="input-tag" placeholder="Type normally, converts to superscript..." class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono">
                    <div id="tag-preview" class="mt-2 text-xs text-gray-400 dark:text-zinc-500 hidden">
                        Preview: <span id="tag-preview-text" class="text-blue-500 dark:text-blue-400 font-mono"></span>
                    </div>
                </div>

                <!-- Weather Toggle -->
                <div class="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg">
                    <div>
                        <p class="text-sm font-medium text-gray-800 dark:text-zinc-200">Show Weather in Config</p>
                        <p class="text-xs text-gray-400 dark:text-zinc-500">Adds live city + temp when user refreshes sub</p>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer ml-3 flex-shrink-0">
                        <input type="checkbox" id="toggle-weather" class="sr-only peer" onchange="toggleWeatherCityField(this.checked)">
                        <div class="w-10 h-6 bg-gray-300 dark:bg-zinc-600 peer-checked:bg-blue-600 rounded-full transition peer-focus:ring-2 peer-focus:ring-blue-500"></div>
                        <div class="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition peer-checked:translate-x-4"></div>
                    </label>
                </div>

                <!-- Weather City (shown when weather toggle is on) -->
                <div id="weather-city-row" class="hidden">
                    <label class="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-zinc-400 mb-2">City for Weather <span class="normal-case font-normal text-gray-400 dark:text-zinc-500">(leave empty to auto-detect by IP)</span></label>
                    <input type="text" id="input-weather-city" placeholder="e.g. Tehran, London, New York" class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-300 dark:border-amoled-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                </div>

                <!-- Actions -->
                <div class="flex gap-3 pt-1">
                    <button type="button" onclick="toggleModal(false)" class="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-lg text-sm transition">Cancel</button>
                    <button type="submit" id="submit-btn" class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition shadow-sm shadow-blue-500/20">Create User</button>
                </div>
            </form>
        </div>
    </div>

    <div id="qr-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full max-w-sm bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl overflow-hidden p-6 text-center transition-all transform duration-300 opacity-0 scale-95 ease-out">
            <h3 id="qr-modal-title" class="font-bold text-gray-900 dark:text-zinc-100 mb-4">Scan QR Code</h3>
            <div class="bg-white p-3 rounded-xl inline-block mb-4 border border-gray-100">
                <div id="qrcode-box" class="flex justify-center items-center w-48 h-48 mx-auto"></div>
            </div>
            <button onclick="toggleQRModal(false)" class="w-full py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-lg text-sm transition text-gray-900 dark:text-zinc-100">Close</button>
        </div>
    </div>

    <div id="settings-modal" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300 ease-out">
        <div class="w-full sm:max-w-lg bg-white dark:bg-amoled-card sm:border border-gray-200 dark:border-amoled-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden transition-all transform duration-300 opacity-0 scale-95 ease-out flex flex-col max-h-[92vh]">

            <!-- Header -->
            <div class="px-5 pt-5 pb-0 flex-shrink-0">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2.5">
                        <div class="w-8 h-8 rounded-xl bg-blue-600/10 dark:bg-blue-500/10 flex items-center justify-center">
                            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></circle></svg>
                        </div>
                        <h3 class="font-bold text-gray-900 dark:text-zinc-100 text-base">Settings</h3>
                    </div>
                    <button onclick="toggleSettingsModal(false)" class="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <!-- Tab bar -->
                <div class="flex gap-0.5 bg-gray-100 dark:bg-zinc-800/80 rounded-xl p-1" role="tablist">
                    <button id="stab-pool" onclick="switchSettingsTab('pool')" role="tab"
                        class="settings-tab flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-150 bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>
                        <span>Proxy Pool</span>
                        <span id="stab-pool-badge" class="hidden text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 rounded-full px-1.5 leading-4"></span>
                    </button>
                    <button id="stab-location" onclick="switchSettingsTab('location')" role="tab"
                        class="settings-tab flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-150 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>Location</span>
                    </button>
                    <button id="stab-fragment" onclick="switchSettingsTab('fragment')" role="tab"
                        class="settings-tab flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all duration-150 text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"></path></svg>
                        <span>Fragment</span>
                    </button>
                </div>
            </div>

            <!-- Tab panels -->
            <div class="flex-1 overflow-y-auto">

                <!-- ── Tab: Proxy Pool ── -->
                <div id="spanel-pool" class="settings-panel">

                    <!-- Status strip: paused state + stat counts in one compact row -->
                    <div class="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-3 flex-wrap">
                        <span id="pool-paused-banner" class="hidden items-center gap-1.5 text-[11px] font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">
                            <span class="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0"></span>Paused
                        </span>
                        <span id="pool-paused-divider" class="hidden w-px h-3 bg-gray-200 dark:bg-zinc-700 flex-shrink-0"></span>
                        <div id="pool-stats-row" class="hidden flex items-center gap-3 text-[11px] font-mono flex-wrap">
                            <span><span id="stat-healthy" class="font-bold text-green-600 dark:text-green-400">—</span> <span class="text-green-700/70 dark:text-green-500/70">healthy</span></span>
                            <span><span id="stat-untested" class="font-bold text-yellow-600 dark:text-yellow-400">—</span> <span class="text-yellow-700/70 dark:text-yellow-500/70">untested</span></span>
                            <span><span id="stat-dead" class="font-bold text-red-600 dark:text-red-400">—</span> <span class="text-red-700/70 dark:text-red-500/70">dead</span></span>
                            <span><span id="stat-disabled" class="font-bold text-gray-500 dark:text-zinc-400">—</span> <span class="text-gray-400 dark:text-zinc-500">disabled</span></span>
                        </div>
                        <div class="flex-1"></div>
                        <!-- Clear dead (shown only when dead IPs exist) -->
                        <button id="pool-clear-dead-btn" onclick="clearDeadProxyIps()" title="Remove all dead IPs"
                            class="hidden text-[11px] font-semibold text-red-500 hover:text-red-400 flex-shrink-0">
                            Clear dead
                        </button>
                        <!-- Pause/Resume entire pool -->
                        <button id="pool-pause-all-btn" onclick="togglePauseAllProxyPool()" title="Pause/resume the entire pool"
                            class="text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-500 flex-shrink-0">
                            <span id="pool-pause-all-label">Pause All</span>
                        </button>
                        <!-- Connection order: direct-first (default) vs pool-first -->
                        <button id="connect-mode-btn" onclick="toggleConnectMode()" title="Try pool candidates before the real destination, or vice versa"
                            class="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-500 flex-shrink-0">
                            <span id="connect-mode-label">Prioritize Pool</span>
                        </button>
                    </div>

                    <!-- Unified toolbar: add IPs + sort + utility actions -->
                    <div class="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 space-y-2.5">
                        <div class="flex gap-2">
                            <input type="text" id="proxy-pool-input" placeholder="Add IPs — comma or newline separated" dir="ltr"
                                class="flex-1 min-w-0 px-3 py-2 bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-200 placeholder-gray-400 dark:placeholder-zinc-600"
                                onkeydown="if(event.key==='Enter'){event.preventDefault();addProxyIp();}">
                            <button id="proxy-pool-add-btn" onclick="addProxyIp()"
                                class="flex-shrink-0 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-sm">
                                Add
                            </button>
                        </div>
                        <div id="pool-toolbar-default" class="flex items-center gap-2 text-gray-400 dark:text-zinc-500 flex-wrap">
                            <input type="checkbox" id="pool-select-all" onchange="toggleSelectAllProxyIps(this.checked)" title="Select all"
                                class="w-3.5 h-3.5 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer">
                            <select id="pool-sort-select" onchange="applyPoolSort(this.value)"
                                class="text-[11px] font-medium bg-transparent border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-gray-500 dark:text-zinc-400 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500">
                                <option value="latency">Sort: Latency</option>
                                <option value="status">Sort: Status</option>
                                <option value="added">Sort: Added</option>
                            </select>
                            <div class="flex-1"></div>
                            <button id="pool-check-btn" onclick="checkAllProxyPool()" title="Run health check now"
                                class="text-[11px] font-medium text-gray-400 dark:text-zinc-500 hover:text-emerald-600 dark:hover:text-emerald-400 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                                <span id="pool-check-label">Check all</span>
                            </button>
                            <button id="pool-refresh-btn" onclick="refreshProxyPool()" title="Refresh list from DB"
                                class="text-[11px] font-medium text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition">
                                <span id="pool-refresh-icon-label">Refresh</span>
                            </button>
                        </div>
                        <!-- Bulk action bar: replaces the toolbar above while 1+ rows are selected -->
                        <div id="pool-toolbar-bulk" class="hidden items-center gap-3 text-[11px] flex-wrap">
                            <input type="checkbox" id="pool-select-all-bulk" onchange="toggleSelectAllProxyIps(this.checked)" title="Select all"
                                class="w-3.5 h-3.5 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer">
                            <span id="pool-selected-count" class="font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">0 selected</span>
                            <div class="flex-1"></div>
                            <button onclick="bulkProxyAction('bulk-enable')" title="Enable selected" class="font-medium text-gray-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400">Enable</button>
                            <button onclick="bulkProxyAction('bulk-disable')" title="Disable selected" class="font-medium text-gray-600 dark:text-zinc-300 hover:text-orange-600 dark:hover:text-orange-400">Disable</button>
                            <button onclick="bulkProxyAction('bulk-pin')" title="Pin selected" class="font-medium text-gray-600 dark:text-zinc-300 hover:text-yellow-600 dark:hover:text-yellow-400">Pin</button>
                            <button onclick="bulkProxyAction('bulk-unpin')" title="Unpin selected" class="font-medium text-gray-600 dark:text-zinc-300 hover:text-gray-800 dark:hover:text-zinc-100">Unpin</button>
                            <button onclick="bulkDeleteProxyIps()" title="Delete selected" class="font-medium text-red-500 hover:text-red-400">Delete</button>
                            <button onclick="toggleSelectAllProxyIps(false)" title="Clear selection" class="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200">✕</button>
                        </div>
                    </div>

                    <!-- Pool list -->
                    <div id="proxy-pool-list" class="divide-y divide-gray-100 dark:divide-zinc-800 max-h-56 overflow-y-auto">
                        <p class="text-xs text-gray-400 dark:text-zinc-500 text-center py-6">Loading…</p>
                    </div>
                </div>


                <!-- ── Tab: Location ── -->
                <div id="spanel-location" class="settings-panel p-5 space-y-4 hidden">
                    <div class="rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 p-3 flex gap-2.5">
                        <svg class="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <p class="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">Picks an IP from the nearest Cloudflare PoP for the selected city. Saved as a <strong>fallback</strong> — only used when the Proxy Pool is empty or all IPs are dead.</p>
                    </div>

                    <div>
                        <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Cloudflare Location</label>
                        <div class="relative">
                            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-zinc-500">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                            </div>
                            <select id="location-select"
                                class="w-full pl-9 pr-4 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-zinc-200 cursor-pointer appearance-none">
                                <option value="">Loading…</option>
                            </select>
                            <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 dark:text-zinc-500">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                        <p class="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">🌐 Default = auto, resolved by Cloudflare edge at runtime.</p>
                    </div>

                    <!-- Currently active IP — reflects whichever source is actually serving connections right now -->
                    <div id="location-active-ip-row" class="hidden">
                        <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Currently Using</label>
                        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border">
                            <span id="location-active-ip-dot" class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></span>
                            <code id="location-active-ip" class="text-xs font-mono text-gray-700 dark:text-zinc-200 flex-1 truncate"></code>
                            <span id="location-active-ip-source" class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0"></span>
                        </div>
                        <p class="text-[11px] text-gray-400 dark:text-zinc-500 mt-1.5">The IP actually serving connections right now. Pool takes priority over the fallback below.</p>
                    </div>

                    <!-- Current fallback IP display -->
                    <div id="location-current-ip-row" class="hidden">
                        <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Current Fallback IP</label>
                        <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border">
                            <span class="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"></span>
                            <code id="location-current-ip" class="text-xs font-mono text-gray-700 dark:text-zinc-200 flex-1 truncate"></code>
                        </div>
                    </div>
                </div>

                <!-- ── Tab: Fragment ── -->
                <div id="spanel-fragment" class="settings-panel p-5 space-y-4 hidden">
                    <div class="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 p-3 flex gap-2.5">
                        <svg class="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        <p class="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">Fragmentation splits the TLS ClientHello across multiple packets to evade DPI. Applied to all generated configs.</p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Length</label>
                            <input type="text" id="frag-length" placeholder="20-30" dir="ltr"
                                class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono text-gray-700 dark:text-zinc-200 placeholder-gray-400 dark:placeholder-zinc-600">
                            <p class="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 text-center">bytes range</p>
                        </div>
                        <div>
                            <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-1.5">Interval</label>
                            <input type="text" id="frag-interval" placeholder="1-2" dir="ltr"
                                class="w-full px-3 py-2.5 bg-gray-50 dark:bg-amoled-input border border-gray-200 dark:border-amoled-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-center font-mono text-gray-700 dark:text-zinc-200 placeholder-gray-400 dark:placeholder-zinc-600">
                            <p class="text-[10px] text-gray-400 dark:text-zinc-500 mt-1 text-center">ms range</p>
                        </div>
                    </div>

                    <!-- Presets -->
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">Presets</label>
                        <div class="grid grid-cols-3 gap-2">
                            <button onclick="applyFragPreset('10-20','1-1')"
                                class="px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-amoled-input hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition text-center">
                                <div class="text-xs font-bold text-gray-700 dark:text-zinc-200">Aggressive</div>
                                <div class="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">10-20 / 1-1</div>
                            </button>
                            <button onclick="applyFragPreset('20-30','1-2')"
                                class="px-3 py-2 rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10 hover:border-blue-400 dark:hover:border-blue-500 transition text-center">
                                <div class="text-xs font-bold text-blue-700 dark:text-blue-300">Default</div>
                                <div class="text-[10px] text-blue-500 dark:text-blue-400 font-mono">20-30 / 1-2</div>
                            </button>
                            <button onclick="applyFragPreset('50-100','3-5')"
                                class="px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-amoled-input hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition text-center">
                                <div class="text-xs font-bold text-gray-700 dark:text-zinc-200">Relaxed</div>
                                <div class="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">50-100 / 3-5</div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="px-5 pb-5 pt-3 border-t border-gray-100 dark:border-zinc-800 flex-shrink-0 flex gap-2.5">
                <button type="button" onclick="toggleSettingsModal(false)"
                    class="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-semibold rounded-xl text-sm transition text-gray-700 dark:text-zinc-200">
                    Cancel
                </button>
                <button type="button" onclick="saveSettings()" id="save-settings-btn"
                    class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl text-sm transition shadow-sm">
                    Save Settings
                </button>
            </div>
        </div>
    </div>

    <!-- Toast notification container -->
    <div id="toast-container" class="fixed bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[9999] pointer-events-none"></div>

    <!-- Confirm dialog modal -->
    <div id="confirm-modal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[9998] opacity-0 pointer-events-none transition-opacity duration-200">
        <div class="bg-white dark:bg-amoled-card border border-gray-200 dark:border-amoled-border rounded-2xl shadow-xl p-6 w-80 max-w-sm mx-4">
            <p id="confirm-message" class="text-sm text-gray-800 dark:text-zinc-200 text-center mb-5"></p>
            <div class="flex gap-3">
                <button id="confirm-cancel" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 font-medium rounded-lg text-sm transition">Cancel</button>
                <button id="confirm-ok" class="flex-1 py-2 text-white font-medium rounded-lg text-sm transition">Confirm</button>
            </div>
        </div>
    </div>

    <script>
        // ---- Superscript conversion map ----
        const SUPERSCRIPT_MAP = {
            'a':'ᵃ','b':'ᵇ','c':'ᶜ','d':'ᵈ','e':'ᵉ','f':'ᶠ','g':'ᵍ','h':'ʰ',
            'i':'ⁱ','j':'ʲ','k':'ᵏ','l':'ˡ','m':'ᵐ','n':'ⁿ','o':'ᵒ','p':'ᵖ',
            'q':'ᵠ','r':'ʳ','s':'ˢ','t':'ᵗ','u':'ᵘ','v':'ᵛ','w':'ʷ','x':'ˣ',
            'y':'ʸ','z':'ᶻ',
            'A':'ᴬ','B':'ᴮ','C':'ᶜ','D':'ᴰ','E':'ᴱ','F':'ᶠ','G':'ᴳ','H':'ᴴ',
            'I':'ᴵ','J':'ᴶ','K':'ᴷ','L':'ᴸ','M':'ᴹ','N':'ᴺ','O':'ᴼ','P':'ᴾ',
            'Q':'ᵠ','R':'ᴿ','S':'ˢ','T':'ᵀ','U':'ᵁ','V':'ᵛ','W':'ᵂ','X':'ˣ',
            'Y':'ʸ','Z':'ᶻ',
            '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹',
            '+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','•':'•','·':'·',' ':' '
        };

        function toSuperscript(str) {
            // Convert each char: if in map use superscript, else keep as-is (emojis, symbols)
            return [...str].map(ch => SUPERSCRIPT_MAP[ch] !== undefined ? SUPERSCRIPT_MAP[ch] : ch).join('');
        }

        function updateTagPreview(tagValue, username) {
            const preview = document.getElementById('tag-preview');
            const previewText = document.getElementById('tag-preview-text');
            if (!preview || !previewText) return;
            const displayUsername = username || document.getElementById('input-name').value || 'username';
            const tag = tagValue ? tagValue : 'ⁿᵉˣᵘˢ';
            let usagePart = '0MB/∞ • ∞';
            const user = window.allUsers && window.allUsers.find(u => u.username === displayUsername);
            if (user) {
                const usedGb = user.used_gb || 0;
                const usedStr = usedGb < 1 ? (usedGb * 1024).toFixed(0) + 'MB' : usedGb.toFixed(2) + 'GB';
                const limitStr = user.limit_gb ? user.limit_gb + 'GB' : '∞';
                usagePart = usedStr + '/' + limitStr;
                if (user.expiry_days) {
                    const created = new Date(user.created_at);
                    const daysLeft = Math.ceil((created.getTime() + user.expiry_days * 86400000 - Date.now()) / 86400000);
                    usagePart += ' • ' + (daysLeft > 0 ? daysLeft + 'd' : 'Expired');
                } else {
                    usagePart += ' • ∞';
                }
            }
            preview.classList.remove('hidden');
            previewText.textContent = tag + ' • ' + displayUsername + ' • ' + usagePart;
        }

        // Wire up the tag input: convert to superscript on input, update preview
        document.addEventListener('DOMContentLoaded', () => {
            const tagInput = document.getElementById('input-tag');
            if (tagInput) {
                tagInput.addEventListener('input', function() {
                    const pos = this.selectionStart;
                    const converted = toSuperscript(this.value);
                    if (converted !== this.value) {
                        this.value = converted;
                        // Restore cursor position after value change
                        this.setSelectionRange(pos, pos);
                    }
                    updateTagPreview(this.value, editingUsername);
                });
            }
        });

        // ---- Toast notification system ----
        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const colors = {
                success: 'bg-green-600 text-white',
                error:   'bg-red-600 text-white',
                warning: 'bg-yellow-500 text-white',
                info:    'bg-zinc-800 text-white dark:bg-zinc-700',
            };
            const toast = document.createElement('div');
            toast.className = 'pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium max-w-sm text-center transition-all duration-300 opacity-0 translate-y-2 ' + (colors[type] || colors.info);
            toast.textContent = message;
            container.appendChild(toast);
            requestAnimationFrame(() => {
                toast.classList.remove('opacity-0', 'translate-y-2');
                toast.classList.add('opacity-100', 'translate-y-0');
            });
            setTimeout(() => {
                toast.classList.remove('opacity-100', 'translate-y-0');
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
        // ---- End toast system ----

        // ---- Confirm dialog ----
        function showConfirm(message, onConfirm, { okLabel = 'Confirm', okStyle = 'bg-red-600 hover:bg-red-700' } = {}) {
            const modal = document.getElementById('confirm-modal');
            document.getElementById('confirm-message').textContent = message;
            const ok = document.getElementById('confirm-ok');
            ok.textContent = okLabel;
            ok.className = 'flex-1 py-2 text-white font-medium rounded-lg text-sm transition ' + okStyle;
            modal.classList.remove('opacity-0', 'pointer-events-none');
            modal.classList.add('opacity-100', 'pointer-events-auto');
            const cancel = document.getElementById('confirm-cancel');
            const close = () => {
                modal.classList.add('opacity-0', 'pointer-events-none');
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                ok.replaceWith(ok.cloneNode(true));
                cancel.replaceWith(cancel.cloneNode(true));
            };
            document.getElementById('confirm-ok').addEventListener('click', () => { close(); onConfirm(); }, { once: true });
            document.getElementById('confirm-cancel').addEventListener('click', close, { once: true });
        }
        // ---- End confirm dialog ----

        window.globalFragLen = "20-30";
        window.globalFragInt = "1-2";

        // Must match PROXY_POOL_MAX_FAILURES on the server — single source of truth for dead-list threshold
        const POOL_MAX_FAILURES = 3;

        const tlsPorts = ['443', '2053', '2083', '2087', '2096', '8443'];
        const nonTlsPorts = ['80', '8080', '8880', '2052', '2082', '2086', '2095'];

        let isEditMode = false;
        let editingUsername = '';

        function renderPortPills(selectedPorts) {
            const defaultSelected = selectedPorts || ['443'];

            const makePill = (port, isTls, container) => {
                const isChecked = defaultSelected.includes(port);
                const checkedSpanClasses = isTls
                    ? 'peer-checked:bg-blue-50 dark:peer-checked:bg-blue-950/25 peer-checked:border-blue-500 dark:peer-checked:border-blue-500/70 peer-checked:text-blue-600 dark:peer-checked:text-blue-400'
                    : 'peer-checked:bg-amber-50 dark:peer-checked:bg-amber-950/25 peer-checked:border-amber-500 dark:peer-checked:border-amber-500/70 peer-checked:text-amber-600 dark:peer-checked:text-amber-400';
                const checkSvgColor = isTls ? 'text-blue-500' : 'text-amber-500';

                const label = document.createElement('label');
                label.className = 'cursor-pointer select-none';

                const input = document.createElement('input');
                input.type = 'checkbox';
                input.name = 'port-cb';
                input.value = port;
                if (isChecked) input.checked = true;
                input.className = 'peer sr-only';

                const span = document.createElement('span');
                span.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-semibold transition-all duration-150 ' +
                    'border-gray-200 dark:border-zinc-800/80 text-gray-700 dark:text-zinc-300 ' +
                    'hover:bg-gray-50 dark:hover:bg-zinc-800/40 shadow-sm ' +
                    checkedSpanClasses;

                const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('class', 'w-3 h-3 hidden peer-checked:block ' + checkSvgColor);
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('viewBox', '0 0 24 24');
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('stroke-width', '2.5');
                path.setAttribute('d', 'M5 13l4 4L19 7');
                svg.appendChild(path);

                span.appendChild(svg);
                span.appendChild(document.createTextNode(port));
                label.appendChild(input);
                label.appendChild(span);
                container.appendChild(label);
            };

            const tlsContainer = document.getElementById('tls-port-pills');
            const plainContainer = document.getElementById('plain-port-pills');
            tlsContainer.innerHTML = '';
            plainContainer.innerHTML = '';
            tlsPorts.forEach(p => makePill(p, true, tlsContainer));
            nonTlsPorts.forEach(p => makePill(p, false, plainContainer));
        }

        function updatePillStyle() { /* no-op: pure CSS peer-checked handles styling */ }

        function getSelectedPorts() {
            const checkboxes = document.querySelectorAll('input[name="port-cb"]:checked');
            const ports = Array.from(checkboxes).map(cb => cb.value);
            return ports.length > 0 ? ports : ['443'];
        }

        let _activeSettingsTab = 'pool';

        function switchSettingsTab(tab) {
            _activeSettingsTab = tab;
            const tabs = ['pool', 'location', 'fragment'];
            tabs.forEach(t => {
                const btn = document.getElementById('stab-' + t);
                const panel = document.getElementById('spanel-' + t);
                if (t === tab) {
                    btn.classList.add('bg-white', 'dark:bg-zinc-700', 'text-gray-900', 'dark:text-zinc-100', 'shadow-sm');
                    btn.classList.remove('text-gray-500', 'dark:text-zinc-400', 'hover:text-gray-700', 'dark:hover:text-zinc-200');
                    panel.classList.remove('hidden');
                } else {
                    btn.classList.remove('bg-white', 'dark:bg-zinc-700', 'text-gray-900', 'dark:text-zinc-100', 'shadow-sm');
                    btn.classList.add('text-gray-500', 'dark:text-zinc-400', 'hover:text-gray-700', 'dark:hover:text-zinc-200');
                    panel.classList.add('hidden');
                }
            });
        }

        function applyFragPreset(len, interval) {
            document.getElementById('frag-length').value = len;
            document.getElementById('frag-interval').value = interval;
            // Highlight the matching preset button
            document.querySelectorAll('#spanel-fragment .grid button').forEach(btn => {
                const mono = btn.querySelector('.font-mono');
                const match = mono && mono.textContent.trim() === len + ' / ' + interval;
                if (match) {
                    btn.classList.add('border-blue-400', 'dark:border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/10');
                    btn.classList.remove('border-gray-200', 'dark:border-zinc-700', 'bg-white', 'dark:bg-amoled-input');
                } else {
                    btn.classList.remove('border-blue-400', 'dark:border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/10');
                    btn.classList.add('border-gray-200', 'dark:border-zinc-700', 'bg-white', 'dark:bg-amoled-input');
                }
            });
        }

        function toggleSettingsModal(show) {
            const modal = document.getElementById('settings-modal');
            const card = modal.querySelector('div');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
                // Always land on Pool tab and refresh data
                switchSettingsTab('pool');
                loadProxyPool();
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        function toggleWeatherCityField(show) {
            const row = document.getElementById('weather-city-row');
            if (show) {
                row.classList.remove('hidden');
            } else {
                row.classList.add('hidden');
                document.getElementById('input-weather-city').value = '';
            }
        }

        function toggleModal(show) {
            const modal = document.getElementById('user-modal');
            const card = modal.querySelector('div');
            if (show) {
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
                isEditMode = false;
                editingUsername = '';
                document.getElementById('modal-title').textContent = 'Create New User';
                document.getElementById('submit-btn').textContent = 'Create User';
                document.getElementById('input-name').disabled = false;
                document.getElementById('create-user-form').reset();
                document.getElementById('tag-preview').classList.add('hidden');
                document.getElementById('toggle-weather').checked = false;
                toggleWeatherCityField(false);
                renderPortPills();
            }
        }

        function openCreateModal() {
            isEditMode = false;
            editingUsername = '';
            document.getElementById('modal-title').textContent = 'Create New User';
            document.getElementById('submit-btn').textContent = 'Create User';
            document.getElementById('input-name').disabled = false;
            document.getElementById('create-user-form').reset();
            renderPortPills();
            document.getElementById('fingerprint-select').value = 'chrome';
            toggleWeatherCityField(false);
            toggleModal(true);
        }

        // Apply saved theme immediately (safe: only touches <html>, not DOM elements)
        if (localStorage.getItem('color-theme') === 'light' || (!('color-theme' in localStorage) && !window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }

        document.addEventListener('DOMContentLoaded', () => {
            // Initialize port pills now that DOM is ready
            renderPortPills();

            const themeToggleBtn = document.getElementById('theme-toggle');
            themeToggleBtn.addEventListener('click', () => {
                if (document.documentElement.classList.contains('dark')) {
                    document.documentElement.classList.remove('dark');
                    localStorage.setItem('color-theme', 'light');
                } else {
                    document.documentElement.classList.add('dark');
                    localStorage.setItem('color-theme', 'dark');
                }
            });
        });

        function timeAgoSimple(ts, now) {
            const diff = Math.floor((now - ts) / 1000);
            if (diff < 60) return diff + 's ago';
            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
            return Math.floor(diff / 86400) + 'd ago';
        }

        let _currentSortKey = null;
        let _currentSortDir = -1; // -1 = desc, 1 = asc
        function sortTableBy(key) {
            if (_currentSortKey === key) {
                _currentSortDir *= -1;
            } else {
                _currentSortKey = key;
                _currentSortDir = -1;
            }
            const users = window.allUsers;
            if (!users) return;
            users.sort((a, b) => {
                const av = a[key] || 0;
                const bv = b[key] || 0;
                return (av > bv ? 1 : av < bv ? -1 : 0) * _currentSortDir;
            });
            renderUsersUI({ users, serverTime: Date.now() });
        }

        let _loadUsersFlight = null;
        /**
         * Fetch users from the server and re-render the table.
         * @param {boolean} silent - When true, skips the loading spinner so the
         *   table refreshes in-place without flickering (used for background polls
         *   and post-mutation reloads). When false (default), shows the full
         *   loading state — used on initial page load and explicit manual refresh.
         */
        async function loadUsers(silent = false) {
            const loadingState = document.getElementById('loading-state');
            const tableContainer = document.getElementById('users-table-container');
            const emptyState = document.getElementById('empty-state');

            // Always show the spinner on a non-silent load, even if a fetch is
            // already in-flight — the user explicitly triggered a full reload.
            if (!silent) {
                loadingState.innerHTML =
                    '<div class="inline-flex flex-col items-center gap-3">' +
                    '<svg class="w-8 h-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">' +
                    '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
                    '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>' +
                    '</svg><span class="text-sm text-gray-400 dark:text-zinc-500">Loading users...</span></div>';
                loadingState.classList.remove('hidden');
                tableContainer.classList.add('hidden');
                emptyState.classList.add('hidden');
            }

            if (_loadUsersFlight) {
                try {
                    const data = await _loadUsersFlight;
                    renderUsersUI(data);
                } catch (err) {
                    if (!silent) {
                        loadingState.innerHTML = '<span class="text-red-500">Error fetching data from server</span>';
                        loadingState.classList.remove('hidden');
                        tableContainer.classList.add('hidden');
                    }
                }
                return;
            }

            const flight = (async () => {
                const res = await fetch('/api/users?t=' + Date.now());
                if (!res.ok) throw new Error();
                return res.json();
            })();
            _loadUsersFlight = flight;

            try {
                const data = await flight;
                renderUsersUI(data);
            } catch (err) {
                if (!silent) {
                    loadingState.innerHTML = '<span class="text-red-500">Error fetching data from server</span>';
                    loadingState.classList.remove('hidden');
                    tableContainer.classList.add('hidden');
                }
            } finally {
                if (_loadUsersFlight === flight) _loadUsersFlight = null;
            }
        }

        function escapeHtml(str) {
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        function renderUsersUI(data) {
            try {
                const loadingState = document.getElementById('loading-state');
                const tableContainer = document.getElementById('users-table-container');
                const emptyState = document.getElementById('empty-state');
                const tbody = document.getElementById('users-tbody');
                
                const users = data.users || [];
                window.allUsers = users;
                
                const serverTime = data.serverTime || Date.now();
                const totalUsersCount = users.length;
                const activeUsersCount = users.filter(u => u.is_online === 1).length;
                const totalGbUsage = users.reduce((sum, u) => sum + (u.used_gb || 0), 0);
                
                document.getElementById('stat-total-users').textContent = totalUsersCount;
                document.getElementById('stat-active-users').textContent = activeUsersCount;
                document.getElementById('stat-total-usage').textContent = totalGbUsage < 1 ? (totalGbUsage * 1024).toFixed(0) + ' MB' : totalGbUsage.toFixed(2) + ' GB';
                
                const recentUser = users.reduce((max, u) => (u.last_active || 0) > (max.last_active || 0) ? u : max, { username: 'None', last_active: 0 });
                document.getElementById('stat-top-user').textContent = recentUser.username;
                const recentTs = recentUser.last_active || 0;
                document.getElementById('stat-top-user-usage').textContent = recentTs
                    ? 'Last seen ' + timeAgoSimple(recentTs, serverTime)
                    : 'Never seen';

                if (users.length === 0) {
                    loadingState.classList.add('hidden');
                    emptyState.classList.remove('hidden');
                    tableContainer.classList.add('hidden');
                } else {
                    emptyState.classList.add('hidden');
                    tbody.innerHTML = users.map(user => {
                        function timeAgo(ts) {
                            if (!ts) return 'Never';
                            const diff = Math.floor((serverTime - ts) / 1000);
                            if (diff < 60) return diff + 's ago';
                            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
                            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
                            if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
                            return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                        }
                        const lastSeenText = user.is_online === 1 ? 'Online now' : timeAgo(user.last_active);
                        const lastSeenColor = user.is_online === 1 ? 'text-emerald-500' : (!user.last_active ? 'text-gray-400 dark:text-zinc-600' : 'text-gray-500 dark:text-zinc-400');
                        let daysRemaining = 'Unlimited';
                        let daysPercent = 100;
                        if (user.expiry_days) {
                            if (user.created_at) {
                                const created = new Date(user.created_at);
                                const expiryDate = new Date(created.getTime() + (user.expiry_days * 24 * 60 * 60 * 1000));
                                const diffDays = Math.ceil((expiryDate - new Date(serverTime)) / (1000 * 60 * 60 * 24));
                                daysRemaining = diffDays > 0 ? diffDays : 0;
                                daysPercent = Math.max(0, Math.min(100, (daysRemaining / user.expiry_days) * 100));
                            } else {
                                daysRemaining = user.expiry_days;
                            }
                        }

                        const isExpired = typeof daysRemaining === 'number' && daysRemaining === 0;
                        const isPaused = user.is_active === 0;
                        const usedGb = user.used_gb || 0;
                        const formattedUsed = usedGb < 1 ? (usedGb * 1024).toFixed(0) + ' MB' : usedGb.toFixed(2) + ' GB';

                        let volumeHtml = '';
                        if (user.limit_gb) {
                            const limitPercent = Math.min((usedGb / user.limit_gb) * 100, 100);
                            const isOverLimit = usedGb >= user.limit_gb;
                            // Clamp hue green→red; use explicit red when fully exhausted.
                            const limitHue = Math.max(0, Math.min(120, 120 - (limitPercent * 1.2)));
                            const limitBarColor = isOverLimit ? '#ef4444' : 'hsl(' + limitHue + ', 80%, 45%)';
                            const limitLabelColor = isOverLimit ? '#ef4444' : 'hsl(' + limitHue + ', 70%, 45%)';
                            const formattedLimit = user.limit_gb < 1 ? (user.limit_gb * 1024).toFixed(0) + ' MB' : user.limit_gb + ' GB';
                            const remainGb = Math.max(0, user.limit_gb - usedGb);
                            const formattedRemain = isOverLimit ? 'Limit reached' : (remainGb < 1 ? (remainGb * 1024).toFixed(0) + ' MB left' : remainGb.toFixed(2) + ' GB left');
                            volumeHtml = '<div class="flex flex-col gap-1.5 w-full">' +
                                '<div class="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Traffic</div>' +
                                '<div class="flex justify-between text-[11px] text-gray-600 dark:text-gray-300 font-medium">' +
                                    '<span>' + formattedUsed + '</span>' +
                                    '<span>' + formattedLimit + '</span>' +
                                '</div>' +
                                '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">' +
                                    '<div class="h-1.5 rounded-full transition-all duration-500" style="width: ' + limitPercent + '%; background-color: ' + limitBarColor + '"></div>' +
                                '</div>' +
                                '<div class="text-[10px] font-semibold" style="color: ' + limitLabelColor + '">' + formattedRemain + '</div>' +
                            '</div>';
                        } else {
                            volumeHtml = '<div class="flex flex-col gap-1.5 w-full">' +
                                '<div class="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Traffic</div>' +
                                '<div class="text-[11px] text-gray-600 dark:text-gray-300 font-medium">' + formattedUsed + ' / ∞</div>' +
                                '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">' +
                                    '<div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style="width: 100%"></div>' +
                                '</div>' +
                                '<div class="text-[10px] font-semibold text-blue-500">Unlimited</div>' +
                            '</div>';
                        }

                        let expiryHtml = '';
                        if (user.expiry_days) {
                            // Clamp hue: green (120) when full, red (0) when expired.
                            // Use explicit red for the expired state so it's never muddy.
                            const expiryHue = Math.max(0, Math.min(120, daysPercent * 1.2));
                            const expiryBarColor = isExpired ? '#ef4444' : 'hsl(' + expiryHue + ', 80%, 45%)';
                            const expiryLabelColor = isExpired ? '#ef4444' : 'hsl(' + expiryHue + ', 70%, 45%)';
                            let expiryDateStr = '';
                            if (user.created_at) {
                                const created = new Date(user.created_at);
                                const expiryDate = new Date(created.getTime() + (user.expiry_days * 24 * 60 * 60 * 1000));
                                expiryDateStr = expiryDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                            }
                            const daysLabel = typeof daysRemaining === 'number'
                                ? (daysRemaining > 0 ? daysRemaining + ' days left' : 'Expired')
                                : 'Unlimited';
                            expiryHtml = '<div class="flex flex-col gap-1.5 w-full">' +
                                '<div class="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Expiry</div>' +
                                '<div class="text-[11px] text-gray-600 dark:text-gray-300 font-medium">' + user.expiry_days + 'd' + (expiryDateStr ? ' · ' + expiryDateStr : '') + '</div>' +
                                '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden flex justify-end">' +
                                    '<div class="h-1.5 rounded-full transition-all duration-500" style="width: ' + (isExpired ? 100 : daysPercent) + '%; background-color: ' + expiryBarColor + '"></div>' +
                                '</div>' +
                                '<div class="text-[10px] font-semibold" style="color: ' + expiryLabelColor + '">' + daysLabel + '</div>' +
                            '</div>';
                        } else {
                            expiryHtml = '<div class="flex flex-col gap-1.5 w-full">' +
                                '<div class="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide">Expiry</div>' +
                                '<div class="text-[11px] text-gray-600 dark:text-gray-300 font-medium">No limit</div>' +
                                '<div class="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">' +
                                    '<div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" style="width: 100%"></div>' +
                                '</div>' +
                                '<div class="text-[10px] font-semibold text-blue-500">Unlimited</div>' +
                            '</div>';
                        }

                        const cardOpacity = isPaused ? 'opacity-50' : '';
                        const cardBorder = isExpired
                            ? 'border-red-300 dark:border-red-800/60'
                            : 'border-gray-200 dark:border-amoled-border';

                        const allPorts = String(user.port_text || user.port || '').split(',').map(p => p.trim()).filter(Boolean);
                        const portPillsHtml = allPorts.map(p => {
                            const isTls = tlsPorts.includes(p);
                            return '<span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ' +
                                (isTls ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300') +
                                '">' + escapeHtml(p) + '</span>';
                        }).join('');

                        const enc = encodeURIComponent(user.username);
                        const uname = escapeHtml(user.username);

                        return '<div class="bg-white dark:bg-amoled-card border ' + cardBorder + ' rounded-2xl shadow-sm transition-all duration-200 ' + cardOpacity + '" data-username="' + uname + '">' +
                            // ── Header row: username + status badges + last seen ──
                            '<div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-zinc-800">' +
                                '<div class="flex items-center gap-2 min-w-0">' +
                                    '<span class="font-bold text-gray-900 dark:text-zinc-100 truncate">' + uname + '</span>' +
                                    (user.is_active === 0
                                        ? '<span class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md">Paused</span>'
                                        : '<span class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md">Active</span>') +
                                    (user.is_online === 1
                                        ? '<span class="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500 text-white rounded-md animate-pulse">● Online</span>'
                                        : '') +
                                '</div>' +
                                '<span class="flex-shrink-0 text-[11px] font-medium ' + lastSeenColor + ' ml-2">' + lastSeenText + '</span>' +
                            '</div>' +
                            // ── Stats: traffic + expiry (2-col) then ports full-width ──
                            '<div class="px-4 py-3 border-b border-gray-100 dark:border-zinc-800 flex flex-col gap-3">' +
                                '<div class="grid grid-cols-2 gap-4">' +
                                    '<div>' + volumeHtml + '</div>' +
                                    '<div>' + expiryHtml + '</div>' +
                                '</div>' +
                                '<div class="flex items-center gap-2 flex-wrap">' +
                                    '<span class="text-[10px] text-gray-400 dark:text-zinc-500 font-medium uppercase tracking-wide flex-shrink-0">Ports</span>' +
                                    portPillsHtml +
                                    '<span class="text-[10px] font-mono font-bold text-blue-500 ml-auto">VL' + 'ESS</span>' +
                                '</div>' +
                            '</div>' +
                            // ── Subscription buttons ──
                            '<div class="flex gap-2 px-4 py-2.5 border-b border-gray-100 dark:border-zinc-800">' +
                                '<button onclick="copySubLink(\\'' + enc + '\\')" class="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-xs font-bold transition border border-indigo-200 dark:border-indigo-800/60">' +
                                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>' +
                                    'Text Sub' +
                                '</button>' +
                                '<button onclick="showSubQR(\\'' + enc + '\\')" title="Text Sub QR" class="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition border border-indigo-200 dark:border-indigo-800/60">' +
                                    '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>' +
                                '</button>' +
                            '</div>' +
                            // ── Action icon buttons ──
                            '<div class="flex items-center gap-1.5 px-4 py-2.5">' +
                                '<button onclick="copyConfig(\\'' + enc + '\\')" title="Copy Config" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl transition">' +
                                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>' +
                                '</button>' +
                                '<button onclick="editUser(\\'' + enc + '\\')" title="Edit" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 rounded-xl transition">' +
                                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>' +
                                '</button>' +
                                (user.is_active !== 0
                                    ? '<button onclick="togglePause(\\'' + enc + '\\', true)" title="Pause" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-500 dark:text-orange-400 rounded-xl transition"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>'
                                    : '<button onclick="togglePause(\\'' + enc + '\\', false)" title="Resume" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-orange-300 dark:border-orange-700 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400 rounded-xl transition"><svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>'
                                ) +
                                '<button onclick="resetTraffic(\\'' + enc + '\\')" title="Reset traffic" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 text-teal-600 dark:text-teal-400 rounded-xl transition">' +
                                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>' +
                                '</button>' +
                                '<button onclick="extendUser(\\'' + enc + '\\')" title="Extend +30 days" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl transition">' +
                                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>' +
                                '</button>' +
                                '<button onclick="deleteUser(\\'' + enc + '\\')" title="Delete" class="flex-1 flex items-center justify-center py-2 bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-700 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl transition">' +
                                    '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>' +
                                '</button>' +
                            '</div>' +
                        '</div>';
                    }).join('');
                    
                    loadingState.classList.add('hidden');
                    tableContainer.classList.remove('hidden');
                }
            } catch (err) {
                loadingState.innerHTML = '<span class="text-red-500">Error loading page elements</span>';
            }
        }

        async function handleFormSubmit(event) {
            event.preventDefault();
            const submitButton = document.getElementById('submit-btn');
            submitButton.disabled = true;
            submitButton.textContent = isEditMode ? 'Saving changes...' : 'Creating...';

            const username = document.getElementById('input-name').value;
            const limit = document.getElementById('input-limit').value || null;
            const expiry = document.getElementById('input-expiry').value || null;
            const port = getSelectedPorts();
            const fingerprint = document.getElementById('fingerprint-select').value;
            const ips = document.getElementById('input-ips').value;
            const tag = document.getElementById('input-tag').value || null;
            const show_weather = document.getElementById('toggle-weather').checked;
            const weather_city = document.getElementById('input-weather-city').value.trim() || null;

            if (port.length === 0) {
                showToast('⚠️ Select at least one port', 'warning');
                submitButton.disabled = false;
                submitButton.textContent = isEditMode ? 'Save Changes' : 'Create User';
                return;
            }

            const url = isEditMode ? '/api/users/' + encodeURIComponent(editingUsername) : '/api/users';
            const method = isEditMode ? 'PUT' : 'POST';

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, limit_gb: limit, expiry_days: expiry, port, fingerprint, ips, tag, show_weather, weather_city })
                });
                
                if (response.ok) {
                    toggleModal(false);
                    await loadUsers(true);
                } else {
                    const errData = await response.json();
                    showToast('Error: ' + (errData.error || 'Operation failed'), 'error');
                }
            } catch (err) {
                showToast('Server connection error', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = isEditMode ? 'Save Changes' : 'Create User';
            }
        }

        function toggleQRModal(show, link = '', title = 'Scan QR Code') {
            const modal = document.getElementById('qr-modal');
            const card = modal.querySelector('div');
            const qrBox = document.getElementById('qrcode-box');
            const titleEl = document.getElementById('qr-modal-title');
            if (show) {
                titleEl.textContent = title;
                qrBox.innerHTML = '';
                new QRCode(qrBox, {
                    text: link,
                    width: 192,
                    height: 192,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.M
                });
                modal.classList.remove('opacity-0', 'pointer-events-none');
                modal.classList.add('opacity-100', 'pointer-events-auto');
                card.classList.remove('opacity-0', 'scale-95');
                card.classList.add('opacity-100', 'scale-100');
            } else {
                modal.classList.remove('opacity-100', 'pointer-events-auto');
                modal.classList.add('opacity-0', 'pointer-events-none');
                card.classList.remove('opacity-100', 'scale-100');
                card.classList.add('opacity-0', 'scale-95');
            }
        }

        function getVlessLink(username) {
            const user = window.allUsers.find(u => u.username === username);
            if (!user) return '';
            const host = window.location.hostname;
            const fp = user.fingerprint || 'chrome';
            let cleanIp = host;
            if (user.ips) {
                const ips = user.ips.split('\\n').map(ip => ip.trim()).filter(ip => ip.length > 0);
                if (ips.length > 0) cleanIp = ips[0];
            }
            // Use per-port TLS derivation, first port only for single-link display
            const firstPort = user.port_text
                ? user.port_text.split(',')[0].trim()
                : String(user.port || '443');
            const tlsVal = tlsPorts.includes(firstPort) ? 'tls' : 'none';
            return 'vle' + 'ss://' + (user.uuid || '') + '@' + cleanIp + ':' + firstPort + '?path=%2F&security=' + tlsVal + '&encryption=none&insecure=0&host=' + host + '&fp=' + fp + '&type=ws&allowInsecure=0&sni=' + host + '#' + encodeURIComponent(username);
        }

        function getSubLink(username) {
            // Prefer sub_token once the account has been reset via
            // reset-link; accounts that haven't been reset yet have
            // sub_token = NULL and keep resolving via username.
            const user = window.allUsers.find(u => u.username === username);
            const identifier = (user && user.sub_token) ? user.sub_token : username;
            return 'https://' + window.location.host + '/feed/' + encodeURIComponent(identifier);
        }

        function copySubLink(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            navigator.clipboard.writeText(getSubLink(username)).then(() => {
                showToast('✅ Text sub link copied!', 'success');
            }).catch(() => {
                showToast('Error copying sub link', 'error');
            });
        }

        function showSubQR(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            toggleQRModal(true, getSubLink(username), 'Text Sub QR');
        }

        function copyConfig(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const link = getVlessLink(username);
            if (!link) return;
            navigator.clipboard.writeText(link).then(() => {
                showToast('✅ VLESS config copied!', 'success');
            }).catch(() => {
                showToast('Error copying config', 'error');
            });
        }

        function editUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const user = window.allUsers.find(u => u.username === username);
            if (!user) {
                showToast('User not found', 'error');
                return;
            }

            isEditMode = true;
            editingUsername = username;

            document.getElementById('modal-title').textContent = 'Edit User: ' + username;
            document.getElementById('submit-btn').textContent = 'Save Changes';

            const nameInput = document.getElementById('input-name');
            nameInput.value = username;
            nameInput.disabled = true;

            document.getElementById('input-limit').value = user.limit_gb || '';
            document.getElementById('input-expiry').value = user.expiry_days || '';
            document.getElementById('input-ips').value = user.ips || '';
            document.getElementById('fingerprint-select').value = user.fingerprint || 'chrome';

            // Populate tag field
            const tagInput = document.getElementById('input-tag');
            tagInput.value = user.tag || '';
            updateTagPreview(user.tag || '', username);

            // Populate weather toggle and city
            const showWeather = !!user.show_weather;
            document.getElementById('toggle-weather').checked = showWeather;
            document.getElementById('input-weather-city').value = user.weather_city || '';
            toggleWeatherCityField(showWeather);

            // Parse stored ports (port_text may be comma-separated, fallback to port)
            const storedPorts = user.port_text
                ? user.port_text.split(',').map(p => p.trim()).filter(Boolean)
                : (user.port ? [String(user.port)] : ['443']);
            renderPortPills(storedPorts);
            toggleModal(true);
        }

        function filterUsersTable(query) {
            const q = query.trim().toLowerCase();
            const cards = document.querySelectorAll('#users-tbody [data-username]');
            cards.forEach(card => {
                const name = (card.dataset.username || '').toLowerCase();
                card.style.display = (!q || name.includes(q)) ? '' : 'none';
            });
        }

        async function resetTraffic(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            showConfirm('Reset traffic for ' + username + '? This cannot be undone.', async () => {
                try {
                    const response = await fetch('/api/users/' + encodeURIComponent(username) + '?action=reset-traffic', { method: 'PATCH' });
                    if (response.ok) {
                        showToast('✅ Traffic reset for ' + username, 'success');
                        await loadUsers(true);
                    } else {
                        showToast('Error resetting traffic', 'error');
                    }
                } catch (err) {
                    showToast('Server connection error', 'error');
                }
            }, { okLabel: 'Reset', okStyle: 'bg-teal-600 hover:bg-teal-700' });
        }

        async function extendUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            const input = prompt('Add how many days for ' + username + '?', '30');
            if (input === null) return; // user cancelled
            const days = parseInt(input, 10);
            if (isNaN(days) || days <= 0) {
                showToast('⚠️ Please enter a positive number of days', 'warning');
                return;
            }
            try {
                const response = await fetch('/api/users/' + encodeURIComponent(username) + '?action=extend', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ days })
                });
                if (response.ok) {
                    showToast('✅ +' + days + ' days added for ' + username, 'success');
                    await loadUsers(true);
                } else {
                    const errData = await response.json().catch(() => ({}));
                    showToast('Error: ' + (errData.error || 'Operation failed'), 'error');
                }
            } catch (err) {
                showToast('Server connection error', 'error');
            }
        }

        async function deleteUser(encodedUsername) {
            const username = decodeURIComponent(encodedUsername);
            showConfirm('Delete user ' + username + '?', async () => {
                try {
                    const response = await fetch('/api/users/' + encodeURIComponent(username), { method: 'DELETE' });
                    if (response.ok) {
                        showToast('✅ User deleted.', 'success');
                        await loadUsers(true);
                    } else {
                        const errData = await response.json();
                        showToast('Error: ' + (errData.error || 'Operation failed'), 'error');
                    }
                } catch (err) {
                    showToast('Server connection error', 'error');
                }
            });
        }

        async function togglePause(encodedUsername, pause) {
            const username = decodeURIComponent(encodedUsername);
            try {
                const response = await fetch('/api/users/' + encodeURIComponent(username) + '?action=toggle', { method: 'PATCH' });
                if (response.ok) {
                    const data = await response.json();
                    // Use the server-returned is_active as the source of truth so the
                    // toast label is always correct even if the UI state was stale.
                    const isNowActive = data.is_active === 1;
                    showToast(isNowActive ? '▶ ' + username + ' resumed.' : '⏸ ' + username + ' paused.', isNowActive ? 'success' : 'warning');
                    await loadUsers(true);
                } else {
                    const errData = await response.json();
                    showToast('Error: ' + (errData.error || 'Operation failed'), 'error');
                }
            } catch (err) {
                showToast('Server connection error', 'error');
            }
        }

        function getFlagEmoji(countryCode) {
            if (!countryCode) return '🌐';
            const codePoints = countryCode.toUpperCase().split('').map(char => 127397 + char.charCodeAt(0));
            try {
                return String.fromCodePoint(...codePoints);
            } catch (e) {
                return '🌐';
            }
        }

        function renderLocationsUI(locations, activeIata) {
            const select = document.getElementById('location-select');
            locations.sort((a, b) => (a.cca2 || '').localeCompare(b.cca2 || ''));

            // Clear and rebuild using DOM methods to avoid XSS from untrusted loc.city/loc.iata values
            select.innerHTML = '';
            const defaultOpt = document.createElement('option');
            defaultOpt.value = '';
            defaultOpt.textContent = '🌐 Default (Auto Location)';
            select.appendChild(defaultOpt);

            locations.forEach(loc => {
                if (loc.iata && loc.city) {
                    const opt = document.createElement('option');
                    opt.value = loc.iata;
                    opt.textContent = getFlagEmoji(loc.cca2) + ' ' + loc.city + ' (' + loc.iata + ')';
                    if (loc.iata.toUpperCase() === activeIata.toUpperCase()) opt.selected = true;
                    select.appendChild(opt);
                }
            });
        }

        // TTL for the localStorage locations list cache (1 hour).
        // The server-side cache is 10 min; this is longer since the browser
        // can serve it instantly on panel open without an extra round-trip.
        const LOCATIONS_LS_TTL = 60 * 60 * 1000;

        async function loadLocations() {
            const select = document.getElementById('location-select');
            const cachedActiveIata = localStorage.getItem('cached_active_iata') || '';
            let hasCachedLocs = false;

            try {
                const raw = localStorage.getItem('cached_locations_list');
                const ts  = parseInt(localStorage.getItem('cached_locations_ts') || '0');
                if (raw && (Date.now() - ts) < LOCATIONS_LS_TTL) {
                    const parsedLocs = JSON.parse(raw);
                    if (Array.isArray(parsedLocs) && parsedLocs.length > 0) {
                        renderLocationsUI(parsedLocs, cachedActiveIata);
                        hasCachedLocs = true;
                    }
                }
            } catch(e) {}
            
            try {
                const statusRes = await fetch('/api/proxy-ip');
                let activeIata = '';
                if (statusRes.ok) {
                    const statusData = await statusRes.json();
                    activeIata = statusData.iata || '';
                    localStorage.setItem('cached_active_iata', activeIata);

                    // Show current fallback IP in Location tab
                    const ipRow = document.getElementById('location-current-ip-row');
                    const ipEl = document.getElementById('location-current-ip');
                    if (ipRow && ipEl && statusData.proxy_ip) {
                        ipEl.textContent = statusData.proxy_ip;
                        ipRow.classList.remove('hidden');
                    }

                    // Show the IP actually in use right now (pool > fallback > default)
                    const activeRow = document.getElementById('location-active-ip-row');
                    const activeIpEl = document.getElementById('location-active-ip');
                    const activeDotEl = document.getElementById('location-active-ip-dot');
                    const activeSourceEl = document.getElementById('location-active-ip-source');
                    if (activeRow && activeIpEl && statusData.active_ip) {
                        activeIpEl.textContent = statusData.active_ip;
                        const sourceMeta = {
                            pool:     { label: 'Pool',     dot: 'bg-green-400',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
                            default:  { label: 'Default',  dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-600 dark:bg-zinc-800 dark:text-zinc-400' },
                        };
                        const meta = sourceMeta[statusData.active_source] || sourceMeta.default;
                        if (activeDotEl) activeDotEl.className = 'w-2 h-2 rounded-full flex-shrink-0 ' + meta.dot;
                        if (activeSourceEl) {
                            activeSourceEl.textContent = meta.label;
                            activeSourceEl.className = 'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex-shrink-0 ' + meta.badge;
                        }
                        activeRow.classList.remove('hidden');
                    }
                    
                    if(statusData.frag_len) {
                        window.globalFragLen = statusData.frag_len;
                        document.getElementById('frag-length').value = statusData.frag_len;
                        // Highlight matching preset if applicable
                        if(statusData.frag_int) applyFragPreset(statusData.frag_len, statusData.frag_int);
                    }
                    if(statusData.frag_int) {
                        window.globalFragInt = statusData.frag_int;
                        document.getElementById('frag-interval').value = statusData.frag_int;
                    }
                    connectMode = statusData.connect_mode === 'pool-first' ? 'pool-first' : 'direct-first';
                    renderConnectModeState();
                }

                const res = await fetch('/locations');
                if (!res.ok) throw new Error();
                const locations = await res.json();

                localStorage.setItem('cached_locations_list', JSON.stringify(locations));
                localStorage.setItem('cached_locations_ts', String(Date.now()));
                renderLocationsUI(locations, activeIata);
            } catch (err) {
                if (!hasCachedLocs) {
                    select.innerHTML = '<option value="">⚠️ Error loading locations</option>';
                }
            }

            // Load proxy IP pool separately
            await loadProxyPool();
        }

        // ---- Proxy IP Pool Management ----
        let proxyPoolData = [];
        let poolPaused = false;
        let connectMode = 'direct-first'; // 'direct-first' (default) | 'pool-first'
        let _poolSortMode = 'latency'; // 'latency' | 'status' | 'added'
        let selectedProxyIps = new Set();

        async function loadProxyPool() {
            try {
                const res = await fetch('/api/proxy-ip-pool');
                if (!res.ok) return;
                const data = await res.json();
                proxyPoolData = data.pool || [];
                poolPaused = !!data.pool_paused;
                // Drop any selected IPs that no longer exist in the pool
                // (e.g. removed by another tab/admin since the last load).
                const liveIps = new Set(proxyPoolData.map(r => r.ip));
                for (const ip of selectedProxyIps) {
                    if (!liveIps.has(ip)) selectedProxyIps.delete(ip);
                }
                renderPoolPausedState();
                renderProxyPool();
            } catch (e) {}
        }

        // Reflect poolPaused in the status strip + toggle link.
        function renderPoolPausedState() {
            const banner = document.getElementById('pool-paused-banner');
            const divider = document.getElementById('pool-paused-divider');
            const btn = document.getElementById('pool-pause-all-btn');
            const label = document.getElementById('pool-pause-all-label');
            if (banner) banner.classList.toggle('hidden', !poolPaused);
            if (banner) banner.classList.toggle('flex', poolPaused);
            if (divider) divider.classList.toggle('hidden', !poolPaused);
            if (label) label.textContent = poolPaused ? 'Resume All' : 'Pause All';
            if (btn) {
                btn.classList.toggle('text-orange-600', !poolPaused);
                btn.classList.toggle('dark:text-orange-400', !poolPaused);
                btn.classList.toggle('hover:text-orange-500', !poolPaused);
                btn.classList.toggle('text-green-600', poolPaused);
                btn.classList.toggle('dark:text-green-400', poolPaused);
                btn.classList.toggle('hover:text-green-500', poolPaused);
            }
        }

        // Pause or resume the entire pool with one click. While paused, every
        // connection bypasses the pool (regardless of per-IP disabled state)
        // and falls back to the legacy/default proxy IP.
        async function togglePauseAllProxyPool() {
            const btn = document.getElementById('pool-pause-all-btn');
            if (!btn || btn.disabled) return;
            const nextAction = poolPaused ? 'resume-all' : 'pause-all';
            btn.disabled = true;
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: nextAction })
                });
                if (res.ok) {
                    const data = await res.json();
                    poolPaused = !!data.pool_paused;
                    renderPoolPausedState();
                    renderProxyPool();
                    showToast(poolPaused ? '⏸ Proxy pool paused — all IPs bypassed' : '▶ Proxy pool resumed', poolPaused ? 'warning' : 'success');
                } else {
                    showToast('Failed to update pool state', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        // Reflect connectMode in the "Prioritize Pool" toggle button.
        function renderConnectModeState() {
            const btn = document.getElementById('connect-mode-btn');
            const label = document.getElementById('connect-mode-label');
            const poolFirst = connectMode === 'pool-first';
            if (label) label.textContent = poolFirst ? 'Direct-First (default)' : 'Prioritize Pool';
            if (btn) {
                btn.classList.toggle('text-blue-600', !poolFirst);
                btn.classList.toggle('dark:text-blue-400', !poolFirst);
                btn.classList.toggle('hover:text-blue-500', !poolFirst);
                btn.classList.toggle('text-purple-600', poolFirst);
                btn.classList.toggle('dark:text-purple-400', poolFirst);
                btn.classList.toggle('hover:text-purple-500', poolFirst);
            }
        }

        // Flip connection order live, no redeploy: 'direct-first' (original —
        // try the real destination first, pool is a failure fallback) vs
        // 'pool-first' (try pool candidates first, direct destination is the
        // last resort). Meant for temporarily testing pool-first routing,
        // then flipping back.
        async function toggleConnectMode() {
            const btn = document.getElementById('connect-mode-btn');
            if (!btn || btn.disabled) return;
            const nextMode = connectMode === 'pool-first' ? 'direct-first' : 'pool-first';
            btn.disabled = true;
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'set-connect-mode', mode: nextMode })
                });
                if (res.ok) {
                    const data = await res.json();
                    connectMode = data.connect_mode || 'direct-first';
                    renderConnectModeState();
                    showToast(
                        connectMode === 'pool-first'
                            ? '🔀 Pool-first — proxy pool tried before the real destination'
                            : '↩️ Direct-first (default) restored',
                        connectMode === 'pool-first' ? 'warning' : 'success'
                    );
                } else {
                    showToast('Failed to update connection order', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        // Re-fetch from DB and re-render — lightweight, no health check.
        async function refreshProxyPool() {
            const btn = document.getElementById('pool-refresh-btn');
            const label = document.getElementById('pool-refresh-icon-label');
            const list = document.getElementById('proxy-pool-list');
            if (btn) btn.disabled = true;
            if (label) label.textContent = 'Refreshing…';
            if (list) list.style.opacity = '0.4';
            try {
                await loadProxyPool();
                showToast('Pool refreshed', 'success');
            } catch(e) {
                showToast('Refresh failed', 'error');
            } finally {
                if (btn) btn.disabled = false;
                if (label) label.textContent = 'Refresh';
                if (list) list.style.opacity = '';
            }
        }

        // Trigger a real TCP health check on all IPs server-side, then reload.
        // The server runs the same logic as the cron job and returns fresh rows.
        async function checkAllProxyPool() {
            const btn = document.getElementById('pool-check-btn');
            const label = document.getElementById('pool-check-label');
            if (!btn || btn.disabled) return;
            btn.disabled = true;
            if (label) label.textContent = 'Checking…';
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'check-all' })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.pool) {
                        proxyPoolData = data.pool;
                        renderProxyPool();
                        showToast('✅ Health check complete', 'success');
                    }
                } else {
                    showToast('Health check failed', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            } finally {
                btn.disabled = false;
                if (label) label.textContent = 'Check all';
            }
        }

        // Remove all dead-listed IPs in one shot.
        async function clearDeadProxyIps() {
            const deadCount = proxyPoolData.filter(r => r.consecutive_failures >= POOL_MAX_FAILURES).length;
            if (deadCount === 0) return;
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clear-dead' })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.pool) {
                        proxyPoolData = data.pool;
                        renderProxyPool();
                        showToast('🗑️ Cleared ' + deadCount + ' dead IP(s)', 'success');
                    }
                } else {
                    showToast('Error clearing dead IPs', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            }
        }

        // Client-side sort without re-fetching — purely cosmetic reorder.
        function applyPoolSort(mode) {
            _poolSortMode = mode;
            renderProxyPool();
        }

        function getSortedPoolData() {
            const data = proxyPoolData.slice();
            if (_poolSortMode === 'status') {
                // Order: healthy → untested → dead
                const rank = r => r.consecutive_failures >= POOL_MAX_FAILURES ? 2 : r.last_checked == null ? 1 : 0;
                data.sort((a, b) => rank(a) - rank(b) || (a.latency_ms || 999999) - (b.latency_ms || 999999));
            } else if (_poolSortMode === 'added') {
                data.sort((a, b) => (a.id || 0) - (b.id || 0));
            } else {
                // Default: pinned first, then latency (mirrors server ordering)
                data.sort((a, b) => (b.is_pinned || 0) - (a.is_pinned || 0) || (a.latency_ms || 999999) - (b.latency_ms || 999999));
            }
            return data;
        }

        function renderProxyPool() {
            const container = document.getElementById('proxy-pool-list');
            if (!container) return;

            // Update stats counters
            const statsRow = document.getElementById('pool-stats-row');
            const badge = document.getElementById('stab-pool-badge');
            const clearDeadBtn = document.getElementById('pool-clear-dead-btn');

            if (proxyPoolData.length === 0) {
                if (statsRow) { statsRow.classList.add('hidden'); statsRow.classList.remove('flex'); }
                if (badge) { badge.textContent = ''; badge.classList.add('hidden'); }
                if (clearDeadBtn) clearDeadBtn.classList.add('hidden');
                container.innerHTML = '<p class="text-xs text-gray-400 dark:text-zinc-500 text-center py-6">No IPs in pool. Add one above.</p>';
                selectedProxyIps.clear();
                renderPoolSelectionBar();
                return;
            }
            let countHealthy = 0, countUntested = 0, countDead = 0, countDisabled = 0;
            proxyPoolData.forEach(row => {
                if (row.is_disabled) { countDisabled++; return; }
                if (row.consecutive_failures >= POOL_MAX_FAILURES) countDead++;
                else if (row.last_checked == null) countUntested++;
                else countHealthy++;
            });
            if (statsRow) {
                statsRow.classList.remove('hidden');
                statsRow.classList.add('flex');
                document.getElementById('stat-healthy').textContent = countHealthy;
                document.getElementById('stat-untested').textContent = countUntested;
                document.getElementById('stat-dead').textContent = countDead;
                document.getElementById('stat-disabled').textContent = countDisabled;
            }
            if (badge) {
                badge.textContent = proxyPoolData.length;
                badge.classList.remove('hidden');
            }
            // Show "Clear dead" only when there's something to clear
            if (clearDeadBtn) {
                if (countDead > 0) clearDeadBtn.classList.remove('hidden');
                else clearDeadBtn.classList.add('hidden');
            }

            const sorted = getSortedPoolData();
            container.innerHTML = sorted.map(row => {
                const isDisabled = !!row.is_disabled;
                const isDead = !isDisabled && row.consecutive_failures >= POOL_MAX_FAILURES;
                const isHealthy = !isDisabled && !isDead && row.last_success != null;
                const isUntested = !isDisabled && row.last_checked == null;

                // Dot: grey when disabled, otherwise health-based colour
                const dotColor = isDisabled ? 'bg-gray-300 dark:bg-zinc-600'
                    : isDead ? 'bg-red-500'
                    : isUntested ? 'bg-gray-400'
                    : isHealthy ? 'bg-green-500' : 'bg-yellow-500';
                const dotTitle = isDisabled ? 'Disabled — not used in connections'
                    : isDead ? 'Dead-listed (3+ failures)'
                    : isUntested ? 'Not yet checked'
                    : isHealthy ? 'Healthy' : 'Degraded';
                const statusDot = '<span title="' + dotTitle + '" class="w-2 h-2 rounded-full ' + dotColor + ' flex-shrink-0"></span>';

                const latency = row.latency_ms != null ? row.latency_ms + 'ms' : '—';
                const latencyColor = isDisabled ? 'text-gray-300 dark:text-zinc-600'
                    : row.latency_ms == null ? 'text-gray-400 dark:text-zinc-500'
                    : row.latency_ms < 100 ? 'text-green-600 dark:text-green-400'
                    : row.latency_ms < 300 ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-500 dark:text-red-400';

                const pinIcon = row.is_pinned
                    ? '<span class="text-yellow-500 text-xs font-bold">★</span>'
                    : '<span class="text-gray-300 dark:text-zinc-600 text-xs opacity-0 group-hover:opacity-100 transition">☆</span>';

                // Disable/enable toggle button — pause icon when active, play icon when disabled
                const disableIcon = isDisabled
                    ? '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'
                    : '<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                const disableTitle = isDisabled ? 'Enable — include in connections' : 'Disable — exclude from connections';
                const disableBtnClass = isDisabled
                    ? 'text-emerald-500 hover:text-emerald-400'
                    : 'text-gray-300 dark:text-zinc-600 hover:text-orange-400 dark:hover:text-orange-400 opacity-0 group-hover:opacity-100';

                const enc = encodeURIComponent(row.ip);
                // Row dims when individually disabled, OR when the whole pool is
                // globally paused (every IP is bypassed regardless of its own state).
                const rowOpacity = (isDisabled || poolPaused) ? ' opacity-50' : '';
                // While globally paused, every row gets a small badge clarifying that
                // it's currently bypassed even if its dot/latency still look healthy.
                const bypassedBadge = (poolPaused && !isDisabled)
                    ? '<span class="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex-shrink-0">Bypassed</span>'
                    : '';
                const isSelected = selectedProxyIps.has(row.ip);
                const rowBg = isSelected ? ' bg-blue-50/60 dark:bg-blue-900/10' : '';
                const checkbox = '<input type="checkbox" onchange="toggleSelectProxyIp(\\'' + enc + '\\', this.checked)" ' + (isSelected ? 'checked' : '') +
                    ' class="w-3.5 h-3.5 rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 flex-shrink-0 cursor-pointer">';
                return '<div class="flex items-center gap-2.5 px-5 py-2.5 group hover:bg-gray-50 dark:hover:bg-zinc-800/40 transition' + rowOpacity + rowBg + '">' +
                    checkbox +
                    statusDot +
                    '<span class="font-mono text-xs flex-1 min-w-0 truncate ' + (isDisabled ? 'text-gray-400 dark:text-zinc-500 line-through' : 'text-gray-800 dark:text-zinc-200') + '" title="' + escapeHtml(row.ip) + '">' + escapeHtml(row.ip) + '</span>' +
                    bypassedBadge +
                    '<span class="text-[11px] font-mono font-semibold flex-shrink-0 ' + latencyColor + '">' + escapeHtml(latency) + '</span>' +
                    '<button onclick="togglePinProxy(\\'' + enc + '\\',' + (row.is_pinned ? 0 : 1) + ')" title="' + (row.is_pinned ? 'Unpin' : 'Pin') + '" class="text-gray-400 hover:text-yellow-500 transition flex-shrink-0">' + pinIcon + '</button>' +
                    '<button onclick="toggleDisableProxy(\\'' + enc + '\\')" title="' + disableTitle + '" class="transition flex-shrink-0 ' + disableBtnClass + '">' + disableIcon + '</button>' +
                    (isDead ? '<button onclick="resetProxyFailures(\\'' + enc + '\\')" title="Reset failures" class="text-[11px] font-bold text-blue-500 hover:text-blue-400 flex-shrink-0">↺</button>' : '') +
                    '<button onclick="removeProxyIp(\\'' + enc + '\\')" title="Remove" class="text-gray-300 hover:text-red-500 dark:text-zinc-600 dark:hover:text-red-400 transition flex-shrink-0 opacity-0 group-hover:opacity-100 px-0.5">✕</button>' +
                    '</div>';
            }).join('');

            renderPoolSelectionBar();
        }

        // ---- Bulk selection ----

        // Swap between the default toolbar and the contextual bulk-action bar,
        // and keep both "select all" checkboxes (one lives in each bar) in sync.
        function renderPoolSelectionBar() {
            const defaultBar = document.getElementById('pool-toolbar-default');
            const bulkBar = document.getElementById('pool-toolbar-bulk');
            const countLabel = document.getElementById('pool-selected-count');
            const selectAllTop = document.getElementById('pool-select-all');
            const selectAllBulk = document.getElementById('pool-select-all-bulk');

            const total = proxyPoolData.length;
            const selectedCount = selectedProxyIps.size;
            const allSelected = total > 0 && selectedCount === total;

            if (defaultBar) defaultBar.classList.toggle('hidden', selectedCount > 0);
            if (bulkBar) {
                bulkBar.classList.toggle('hidden', selectedCount === 0);
                bulkBar.classList.toggle('flex', selectedCount > 0);
            }
            if (countLabel) countLabel.textContent = selectedCount + ' selected';
            if (selectAllTop) selectAllTop.checked = allSelected;
            if (selectAllBulk) selectAllBulk.checked = allSelected;
        }

        function toggleSelectProxyIp(encodedIp, checked) {
            const ip = decodeURIComponent(encodedIp);
            if (checked) selectedProxyIps.add(ip);
            else selectedProxyIps.delete(ip);
            renderProxyPool();
        }

        function toggleSelectAllProxyIps(checked) {
            if (checked) proxyPoolData.forEach(row => selectedProxyIps.add(row.ip));
            else selectedProxyIps.clear();
            renderProxyPool();
        }

        // Shared by all bulk pin/unpin/disable/enable actions.
        async function bulkProxyAction(action) {
            const ips = Array.from(selectedProxyIps);
            if (ips.length === 0) return;
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action, ips })
                });
                if (res.ok) {
                    const labels = {
                        'bulk-enable': '▶ Enabled', 'bulk-disable': '⏸ Disabled',
                        'bulk-pin': '★ Pinned', 'bulk-unpin': '☆ Unpinned'
                    };
                    showToast((labels[action] || 'Updated') + ' ' + ips.length + ' IP(s)', 'success');
                    selectedProxyIps.clear();
                    await loadProxyPool();
                } else {
                    showToast('Bulk action failed', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            }
        }

        function bulkDeleteProxyIps() {
            const ips = Array.from(selectedProxyIps);
            if (ips.length === 0) return;
            showConfirm(
                'Remove ' + ips.length + ' selected IP(s) from the pool? This cannot be undone.',
                async () => {
                    try {
                        const res = await fetch('/api/proxy-ip-pool', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ips })
                        });
                        if (res.ok) {
                            showToast('🗑️ Removed ' + ips.length + ' IP(s)', 'success');
                            selectedProxyIps.clear();
                            await loadProxyPool();
                        } else {
                            showToast('Failed to remove selected IPs', 'error');
                        }
                    } catch (e) {
                        showToast('Server connection error', 'error');
                    }
                },
                { okLabel: 'Delete', okStyle: 'bg-red-600 hover:bg-red-700' }
            );
        }

        async function addProxyIp() {
            const input = document.getElementById('proxy-pool-input');
            const rawVal = (input.value || '').trim();
            if (!rawVal) return;
            // Accept comma or newline separated IPs
            const ips = rawVal.split(/[\\n,]+/).map(s => s.trim()).filter(Boolean);
            if (ips.length === 0) return;

            const btn = document.getElementById('proxy-pool-add-btn');
            btn.disabled = true;
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ips, source: 'custom' })
                });
                if (res.ok) {
                    input.value = '';
                    showToast('✅ Added ' + ips.length + ' IP(s) to pool', 'success');
                    await loadProxyPool();
                } else {
                    showToast('Error adding IPs', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        async function removeProxyIp(encodedIp) {
            const ip = decodeURIComponent(encodedIp);
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip })
                });
                if (res.ok) {
                    showToast('Removed ' + ip, 'success');
                    await loadProxyPool();
                } else {
                    showToast('Error removing IP', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            }
        }

        async function togglePinProxy(encodedIp, newPinned) {
            const ip = decodeURIComponent(encodedIp);
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, action: newPinned ? 'pin' : 'unpin' })
                });
                if (res.ok) {
                    await loadProxyPool();
                } else {
                    showToast('Error updating IP', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            }
        }

        async function resetProxyFailures(encodedIp) {
            const ip = decodeURIComponent(encodedIp);
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, action: 'reset-failures' })
                });
                if (res.ok) {
                    showToast('✅ Reset failures for ' + ip, 'success');
                    await loadProxyPool();
                } else {
                    showToast('Error resetting', 'error');
                }
            } catch (e) {
                showToast('Server connection error', 'error');
            }
        }

        async function toggleDisableProxy(encodedIp) {
            const ip = decodeURIComponent(encodedIp);
            // Optimistically flip is_disabled in local data so the UI reacts instantly
            // without waiting for the round-trip, then confirm with a real fetch.
            const row = proxyPoolData.find(r => r.ip === ip);
            const wasDisabled = row ? !!row.is_disabled : false;
            if (row) row.is_disabled = wasDisabled ? 0 : 1;
            renderProxyPool();
            try {
                const res = await fetch('/api/proxy-ip-pool', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ip, action: 'toggle-disabled' })
                });
                if (res.ok) {
                    showToast(wasDisabled ? '✅ ' + ip + ' enabled' : '⏸ ' + ip + ' disabled', 'success');
                    // Re-fetch to get the authoritative server state
                    await loadProxyPool();
                } else {
                    // Roll back the optimistic update on failure
                    if (row) row.is_disabled = wasDisabled ? 1 : 0;
                    renderProxyPool();
                    showToast('Error toggling IP', 'error');
                }
            } catch (e) {
                if (row) row.is_disabled = wasDisabled ? 1 : 0;
                renderProxyPool();
                showToast('Server connection error', 'error');
            }
        }

        async function saveSettings() {
            const select = document.getElementById('location-select');
            const fragLen = document.getElementById('frag-length').value || "20-30";
            const fragInt = document.getElementById('frag-interval').value || "1-2";
            const iata = select.value;
            const btn = document.getElementById('save-settings-btn');
            
            btn.disabled = true;
            btn.textContent = 'Saving...';
            
            try {
                const response = await fetch('/api/proxy-ip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ iata: iata ? iata.toUpperCase() : '', frag_len: fragLen, frag_int: fragInt })
                });

                if (response.ok) {
                    const data = await response.json();
                    const resolvedIp = data.proxy_ip || '';
                    window.globalFragLen = fragLen;
                    window.globalFragInt = fragInt;
                    let extra = '';
                    if (iata && resolvedIp) {
                        extra = ' Proxy: ' + resolvedIp;
                    }
                    showToast('✅ Settings saved.' + extra, 'success');
                    // Re-fetch so "Currently Using" / "Current Fallback IP" reflect
                    // the newly resolved IP immediately, instead of going stale
                    // until the modal is closed and reopened.
                    await loadLocations();
                    toggleSettingsModal(false);
                } else {
                    showToast('Error saving settings', 'error');
                }
            } catch (err) {
                showToast('Server connection error', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Save Settings';
            }
        }

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            // Walk the modal stack in priority order and close the first one that is open.
            // confirm-modal uses pointer-events-none to signal "closed"; the others use opacity-0.
            const confirmModal = document.getElementById('confirm-modal');
            if (confirmModal.classList.contains('opacity-100')) {
                confirmModal.classList.add('opacity-0', 'pointer-events-none');
                confirmModal.classList.remove('opacity-100', 'pointer-events-auto');
                return;
            }
            const modalDismissers = [
                { id: 'settings-modal', fn: () => toggleSettingsModal(false) },
                { id: 'qr-modal',       fn: () => toggleQRModal(false) },
                { id: 'user-modal',     fn: () => toggleModal(false) },
            ];
            for (const { id, fn } of modalDismissers) {
                const el = document.getElementById(id);
                if (!el.classList.contains('opacity-0')) { fn(); return; }
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            loadUsers();
            loadLocations();
            const pollInterval = setInterval(() => {
                if (document.hidden) return;
                // Don't re-render the table while the user has a modal open —
                // it would reset form state and feel jarring.
                const anyModalOpen = ['user-modal', 'settings-modal', 'qr-modal', 'confirm-modal']
                    .some(id => !document.getElementById(id).classList.contains('opacity-0') &&
                                !document.getElementById(id).classList.contains('pointer-events-none'));
                if (!anyModalOpen) loadUsers(true);
            }, 60000);
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) loadUsers(true);
            });
        });
    </script>
</body>
</html>`; }
};
export { HTML_TEMPLATES };
