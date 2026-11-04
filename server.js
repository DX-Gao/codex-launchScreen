/**
 * Dragon Splash Boot — 启动动画播放器 + 切换面板
 *
 * 用法：
 *   node server.js            启动控制面板（默认 http://127.0.0.1:7788）
 *   node server.js --play     直接播放当前选中的启动画面，播完退出
 *   node server.js --no-open  启动服务但不自动打开浏览器
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { URL } = require('url');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'launcher.json');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');

const ARGS = new Set(process.argv.slice(2));
const PLAY_ONLY = ARGS.has('--play');
const NO_OPEN = ARGS.has('--no-open');

/* ------------------------------- 配置 ------------------------------- */

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

let config = loadConfig();
const PORT = Number(process.env.PORT || config.port || 7788);
let activePort = PORT;

/* ------------------------------ 浏览器 ------------------------------ */

const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
];

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return null;
}

let splashProc = null;
let splashGuard = null;

function killSplash() {
  if (splashGuard) {
    clearTimeout(splashGuard);
    splashGuard = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!splashProc) return;
  const pid = splashProc.pid;
  splashProc = null;
  try {
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {});
  } catch (_) {}
}

/* --------------------------- 运行状态机 --------------------------- */

const state = {
  phase: 'idle',      // idle | playing | closing
  videoDone: false,
  appReady: false,
  appLaunched: false,
  shouldClose: false,
  timedOut: false,
  startedAt: 0,
};

let pollTimer = null;

function resetState() {
  state.phase = 'playing';
  state.videoDone = false;
  state.appReady = false;
  state.appLaunched = false;
  state.shouldClose = false;
  state.timedOut = false;
  state.startedAt = Date.now();
}

function appEnabled() {
  const app = config.appLaunch || {};
  return !!app.enabled && (!!app.target || !!app.path);
}

/** 拉起目标程序（只拉一次） */
function launchApp() {
  const app = config.appLaunch || {};
  if (!app.enabled || state.appLaunched) return;
  state.appLaunched = true;

  // 商店应用（MSIX）：只能通过 AppsFolder 协议拉起，不能直接跑 exe
  if (app.mode === 'appsFolder' && app.target) {
    try {
      spawn('explorer.exe', [`shell:AppsFolder\\${app.target}`], {
        detached: true,
        stdio: 'ignore',
      }).unref();
      console.log(`[dragon-splash] 已请求启动应用: ${app.target}`);
    } catch (e) {
      console.error('[warn] 启动应用失败:', e.message);
    }
    return;
  }

  if (app.path) {
    try {
      spawn(app.path, app.args || [], { detached: true, stdio: 'ignore' }).unref();
      console.log(`[dragon-splash] 已请求启动程序: ${app.path}`);
    } catch (e) {
      console.error('[warn] 启动程序失败:', e.message);
    }
    return;
  }

  console.log('[warn] 开启了自动启动，但没填应用 ID 或路径。');
}

let procSeenAt = 0;

/** 判断进程是否已经出现「有标题的窗口」，作为启动完成的标志 */
function checkAppReady() {
  if (state.appReady) return;

  const name = (config.appLaunch && config.appLaunch.processName) || 'ChatGPT.exe';

  execFile(
    'tasklist',
    ['/FI', `IMAGENAME eq ${name}`, '/V', '/FO', 'CSV', '/NH'],
    { windowsHide: true },
    (err, stdout) => {
      if (err || !stdout) return;

      const rows = stdout.split(/\r?\n/).filter((line) => line.indexOf('","') >= 0);
      if (!rows.length) {
        procSeenAt = 0;
        return;
      }

      if (!procSeenAt) procSeenAt = Date.now();

      // 窗口标题列：ASCII 标题视为已出窗口；
      // 中文系统下的 "暂缺" 之类会因为编码变成替换字符，这里排除掉
      const titled = rows.some((line) => {
        const cols = line.split('","');
        const title = cols[cols.length - 1].replace(/"/g, '').trim();
        return title.length >= 2 && title !== 'N/A' && title.indexOf('\uFFFD') < 0;
      });

      // 兜底：进程活够 2.5 秒也认为起来了（防止标题为中文时永远判不出来）
      const graceOver = procSeenAt > 0 && Date.now() - procSeenAt > 2500;

      if (titled || graceOver) {
        state.appReady = true;
        console.log('[dragon-splash] 应用已就绪，准备收起动画');
        evaluate();
      }
    }
  );
}

/** 计算现在能不能收场 */
function evaluate() {
  if (!state.startedAt || state.shouldClose) return;

  const waitOn = PLAY_ONLY && config.waitForApp !== false && appEnabled();
  const overTime = Date.now() - state.startedAt > (config.maxWaitMs || 60000);

  if (overTime && !state.timedOut) {
    state.timedOut = true;
    console.log('[dragon-splash] 等待应用启动超时，先收起动画');
  }

  if (!waitOn) {
    state.shouldClose = state.videoDone;
  } else {
    state.shouldClose = state.timedOut || (state.videoDone && state.appReady);
  }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    evaluate();
    if (state.shouldClose) {
      clearInterval(pollTimer);
      pollTimer = null;
      return;
    }
    checkAppReady();
  }, 500);
}

function launchSplash(id) {
  killSplash();

  const target = config.animations.find((a) => a.id === id) ||
                 config.animations.find((a) => a.id === config.current) ||
                 config.animations[0];
  if (!target) return { ok: false, error: '配置里没有任何动画' };

  // 优先用 WPF 播放器（更稳、能真透明淡出）；没有则退回浏览器 kiosk
  const exePath = path.join(ROOT, 'app', 'CodexSplash.exe');
  if (fs.existsSync(exePath)) {
    const args = ['--preview'];
    // 通过环境变量把要预览的动画 id 传过去
    spawn(exePath, args, {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, SPLASH_PREVIEW_ID: target.id },
    }).unref();
    return { ok: true, id: target.id, name: target.name, player: 'wpf' };
  }

  const browser = findBrowser();
  if (!browser) return { ok: false, error: '没找到 Edge 或 Chrome，请先安装其一' };

  resetState();

  const page = `http://127.0.0.1:${activePort}/splash?id=${encodeURIComponent(target.id)}`;

  splashProc = spawn(browser, [
    '--kiosk',
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-features=Translate',
    `--user-data-dir=${PROFILE_DIR}`,
    page,
  ], { detached: false, stdio: 'ignore' });

  splashProc.on('exit', () => { splashProc = null; });
  splashProc.on('error', () => { splashProc = null; });

  // 保险：异常时最多 150 秒也要收回来
  splashGuard = setTimeout(killSplash, 150000);

  if (PLAY_ONLY) {
    // 动画先起来，再拉起 Codex，让它俩并行
    setTimeout(launchApp, 250);
    startPolling();
  }

  return { ok: true, id: target.id, name: target.name };
}

/* ------------------------------- HTTP ------------------------------- */

const MIME = {
  '.mp4': 'video/mp4',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJSON(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendFile(res, filePath, req) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendJSON(res, 404, { ok: false, error: 'not found' });

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (isNaN(start) || start < 0) start = 0;
      if (isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
      });
      return fs.createReadStream(filePath, { start, end }).pipe(res);
    }

    res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': stat.size,
      'Cache-Control': ext === '.mp4' ? 'public, max-age=3600' : 'no-store',
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        resolve({});
      }
    });
  });
}

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(path.normalize(base)) ? p : null;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(u.pathname);

  // 静态页面
  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    return sendFile(res, path.join(PUBLIC_DIR, 'index.html'), req);
  }
  if (req.method === 'GET' && pathname === '/splash') {
    return sendFile(res, path.join(PUBLIC_DIR, 'splash.html'), req);
  }
  if (req.method === 'GET' && pathname.startsWith('/public/')) {
    const f = safeJoin(PUBLIC_DIR, pathname.slice('/public/'.length));
    if (!f) return sendJSON(res, 400, { ok: false });
    return sendFile(res, f, req);
  }
  if (req.method === 'GET' && pathname.startsWith('/media/')) {
    const f = safeJoin(path.join(ROOT, 'media'), pathname.slice('/media/'.length));
    if (!f) return sendJSON(res, 400, { ok: false });
    return sendFile(res, f, req);
  }

  // API
  if (pathname === '/api/config' && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, config });
  }

  if (pathname === '/api/select' && req.method === 'POST') {
    const body = await readBody(req);
    if (!config.animations.some((a) => a.id === body.id)) {
      return sendJSON(res, 400, { ok: false, error: '未知的动画 id' });
    }
    config.current = body.id;
    saveConfig(config);
    return sendJSON(res, 200, { ok: true, current: config.current });
  }

  if (pathname === '/api/settings' && req.method === 'POST') {
    const body = await readBody(req);
    if (typeof body.volume === 'number') {
      config.volume = Math.min(1, Math.max(0, body.volume));
    }
    if (typeof body.skipWithEsc === 'boolean') config.skipWithEsc = body.skipWithEsc;
    if (body.appLaunch && typeof body.appLaunch === 'object') {
      const prevProc = (config.appLaunch && config.appLaunch.processName) || 'ChatGPT.exe';
      config.appLaunch = {
        enabled: !!body.appLaunch.enabled,
        mode: body.appLaunch.mode === 'exe' ? 'exe' : 'appsFolder',
        target: String(body.appLaunch.target || ''),
        processName: String(body.appLaunch.processName || prevProc),
        path: String(body.appLaunch.path || ''),
        args: Array.isArray(body.appLaunch.args) ? body.appLaunch.args.map(String) : [],
      };
    }
    saveConfig(config);
    return sendJSON(res, 200, { ok: true, config });
  }

  if (pathname === '/api/play' && req.method === 'POST') {
    const body = await readBody(req);
    const r = launchSplash(body.id || config.current);
    return sendJSON(res, r.ok ? 200 : 500, r);
  }

  if (pathname === '/api/state' && req.method === 'GET') {
    return sendJSON(res, 200, {
      ok: true,
      state: {
        phase: state.phase,
        videoDone: state.videoDone,
        appReady: state.appReady,
        appLaunched: state.appLaunched,
        shouldClose: state.shouldClose,
        timedOut: state.timedOut,
        fadeOutMs: config.fadeOutMs || 700,
        elapsed: state.startedAt ? Date.now() - state.startedAt : 0,
      },
    });
  }

  if (pathname === '/api/video-done' && req.method === 'POST') {
    state.videoDone = true;
    evaluate();
    return sendJSON(res, 200, { ok: true, shouldClose: state.shouldClose });
  }

  if (pathname === '/api/open' && req.method === 'POST') {
    launchApp();
    return sendJSON(res, 200, { ok: true, appLaunch: config.appLaunch });
  }

  if (pathname === '/api/done' && req.method === 'POST') {
    state.phase = 'closing';
    killSplash();
    launchApp();
    if (PLAY_ONLY) {
      sendJSON(res, 200, { ok: true });
      setTimeout(() => process.exit(0), 200);
      return;
    }
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 404, { ok: false, error: 'not found' });
});

function onListening(port) {
  activePort = port;
  const base = `http://127.0.0.1:${port}`;
  console.log('');
  console.log('  Dragon Splash Boot');
  console.log('  ----------------------------------------');
  console.log(`  控制面板: ${base}`);
  console.log('  关闭这个窗口即停止服务');
  console.log('');

  if (PLAY_ONLY) {
    const r = launchSplash(config.current);
    console.log(r.ok ? `[dragon-splash] 正在播放: ${r.name}` : `[dragon-splash] 启动失败: ${r.error}`);
    if (!r.ok) process.exit(1);
    return;
  }

  if (!NO_OPEN) {
    execFile('cmd', ['/c', 'start', '', base], () => {});
  }
}

/**
 * 端口被占用时自动往后顺延，最多试 10 个，
 * 避免因为上一次的服务没关就直接崩溃。
 */
function listenWithFallback(port, attempt) {
  attempt = attempt || 0;

  const onError = (err) => {
    server.removeListener('error', onError);

    if (err.code === 'EADDRINUSE') {
      if (attempt >= 10) {
        console.error(`[错误] 端口 ${PORT} 到 ${port} 全被占用，请改 launcher.json 里的 port，或先关掉占用程序。`);
        process.exit(1);
      }
      console.log(`[提示] 端口 ${port} 已被占用，尝试 ${port + 1} ...`);
      setTimeout(() => listenWithFallback(port + 1, attempt + 1), 50);
      return;
    }

    if (err.code === 'EACCES') {
      console.error(`[错误] 没有权限监听端口 ${port}，换一个端口试试。`);
      process.exit(1);
    }

    console.error('[错误] ' + err.message);
    process.exit(1);
  };

  server.removeAllListeners('listening');
  server.once('listening', () => onListening(port));
  server.once('error', onError);
  server.listen(port, '127.0.0.1');
}

listenWithFallback(PORT);

process.on('SIGINT', () => {
  killSplash();
  process.exit(0);
});
