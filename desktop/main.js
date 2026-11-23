// 호텔 뮤제오 룸서비스 윈도우 프로그램 (하나의 코드로 두 가지를 만듭니다)
// - admin: PASTA HOUSE 주문 (보테가 관리자) — 새 주문이 오면 창을 자동으로 띄우고 30초마다 다시 알립니다
// - front: HOTEL MUSEO 프런트 — 객실 반영 확인할 건이 생기면 아이콘 숫자·깜빡임·알림만 (창 자동 띄우기는 메뉴에서 켤 수 있습니다)
// 공통: 웹페이지를 그대로 띄워서 웹을 고치면 다시 설치할 필요 없습니다. 창을 닫아도 트레이에 계속 떠 있습니다.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, dialog, shell, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

const SITE = 'https://hotel-museo.github.io/room-service-v2-cloude/';
const VARIANTS = {
  admin: {
    appId: 'kr.hotelmuseo.pastahouse.admin',
    title: 'PASTA HOUSE 주문',
    url: SITE + 'admin/#orders',
    popupDefault: true,
    remind: true,
    countTitle: (n) => `(${n}) 새 주문 · PASTA HOUSE`,
    tip: (n) => (n ? `PASTA HOUSE 주문 · 새 주문 ${n}건` : 'PASTA HOUSE 주문 · 새 주문 없음'),
    note: (n) => ({ title: `새 주문 ${n}건`, body: '룸서비스 주문이 들어왔습니다. 주문판에서 접수해 주십시오.' }),
    quitWarn: '종료하면 새 주문 알림을 받지 못합니다.',
    pages: [['주문판 열기', '#orders'], ['메뉴 관리', '#menu'], ['매출 · 정산', '#sales']],
  },
  front: {
    appId: 'kr.hotelmuseo.front.roomservice',
    title: 'HOTEL MUSEO 프런트',
    url: SITE + 'front/',
    popupDefault: false,
    remind: false,
    countTitle: (n) => `(${n}) 객실 반영 확인 · 프런트`,
    tip: (n) => (n ? `프런트 · 객실 반영 확인 ${n}건` : '프런트 · 확인할 건 없음'),
    note: (n) => ({ title: `객실 반영 확인 ${n}건`, body: '보테가에서 WINGS 입력을 마친 룸서비스 후불 건입니다. 틈날 때 확인해 주십시오.' }),
    quitWarn: '종료하면 확인할 건이 생겨도 알림을 받지 못합니다.',
    pages: [['프런트 화면 열기', '']],
  },
};
const VARIANT = require('./package.json').phVariant === 'front' || process.argv.includes('--front') ? 'front' : 'admin';
const V = VARIANTS[VARIANT];

// PH_ADMIN_URL은 개발 중 시험용 (평소엔 비워 둡니다)
const BASE = process.env.PH_ADMIN_URL || V.url.split('#')[0];
const START = process.env.PH_ADMIN_URL || V.url;
const ORIGIN = new URL(BASE).origin;
const APP_ID = V.appId;
const BLINK_MS = 450; // 트레이 깜빡임 속도
const REMIND_MS = 30_000; // (관리자) 접수 대기가 남아 있는데 창을 닫아두면 30초마다 다시 띄웁니다
const ICON = path.join(__dirname, 'build', `icon-${VARIANT}.png`);
const UPDATE_CHECK_MS = 3 * 60_000; // 3분마다 웹 화면이 새로 올라왔는지 확인

// 설정 (창 자동 띄우기 켬/끔) — 사용자 폴더에 저장
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function writeSettings(patch) {
  try { fs.writeFileSync(settingsFile(), JSON.stringify({ ...readSettings(), ...patch })); } catch { /* 무시 */ }
}
const popupOn = () => readSettings().popup ?? V.popupDefault;

app.setAppUserModelId(APP_ID);
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let tray = null;
let pending = 0;
let blinkTimer = null;
let blinkOn = false;
let remindTimer = null;
let quitting = false;
let toldAboutTray = false;

const asset = (name) => nativeImage.createFromPath(path.join(__dirname, 'assets', VARIANT, name));
const key = (n) => (n > 9 ? '9p' : String(n));

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: V.title,
    icon: ICON,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      // 창을 숨겨도 주문 확인이 멈추지 않게
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL(START);

  // 웹페이지가 제목을 "(2) 새 주문 · …"으로 바꿔도 창 제목은 프로그램 이름 + 건수로
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    updateTitle();
  });

  // X를 눌러도 종료하지 않고 트레이로 숨깁니다
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && tray) {
      toldAboutTray = true;
      tray.displayBalloon({
        iconType: 'info',
        title: V.title,
        content: '창을 닫아도 계속 켜져 있습니다. 새 건이 생기면 아이콘으로 알려 드립니다.\n완전히 끄려면 시계 옆 아이콘 → 종료',
      });
    }
  });

  // F5 / Ctrl+R: 새로 불러오기 (메뉴줄이 없어서 직접 연결)
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || ((input.control || input.meta) && input.key.toLowerCase() === 'r')) {
      e.preventDefault();
      void session.defaultSession.clearCache().then(() => win.webContents.reloadIgnoringCache());
    }
  });

  // 직원이 창을 누르면 작업표시줄 깜빡임은 멈춥니다 (숫자·트레이 깜빡임은 접수할 때까지 유지)
  win.on('focus', () => win.flashFrame(false));

  // 영수증 인쇄 창(about:blank)과 같은 사이트 창은 열어주고, 바깥 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '' || url.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON } };
    }
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) {
      e.preventDefault();
      void shell.openExternal(url);
    }
  });
}

function go(hash) {
  showWindow(true);
  if (hash) win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => undefined);
}

/** 창 띄우기. focus=false면 하던 일(유튜브 등)을 뺏지 않고 맨 앞에만 보여 줍니다 */
function showWindow(focus) {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  if (focus) {
    win.show();
    win.focus();
    return;
  }
  win.setAlwaysOnTop(true, 'screen-saver');
  win.showInactive();
  win.moveTop();
  setTimeout(() => win && win.setAlwaysOnTop(false), 1500);
}

function updateTitle() {
  if (!win) return;
  win.setTitle(pending ? V.countTitle(pending) : V.title);
}

function trayIdle() {
  tray.setImage(asset('tray.png'));
  tray.setToolTip(V.tip(0));
}

function startBlink() {
  if (blinkTimer) return;
  blinkOn = true;
  blinkTimer = setInterval(() => {
    blinkOn = !blinkOn;
    tray.setImage(asset(blinkOn ? `tray-${key(pending)}.png` : 'tray-blank.png'));
  }, BLINK_MS);
}

function stopBlink() {
  if (blinkTimer) clearInterval(blinkTimer);
  blinkTimer = null;
}

function alertNewOrders(n) {
  if (popupOn()) showWindow(false);
  win.flashFrame(true);
  if (Notification.isSupported()) {
    const note = new Notification({
      ...V.note(n),
      icon: ICON,
      silent: true, // 매장 스피커로 소리가 나가지 않게
    });
    note.on('click', () => go(V.pages[0][1]));
    note.show();
  }
}

function setPending(n) {
  const prev = pending;
  pending = Math.max(0, Math.min(999, Math.floor(Number(n) || 0)));
  updateTitle();
  tray.setToolTip(V.tip(pending));

  if (pending === 0) {
    stopBlink();
    trayIdle();
    win.flashFrame(false);
    win.setOverlayIcon(null, '');
    if (remindTimer) clearInterval(remindTimer);
    remindTimer = null;
    return;
  }

  win.setOverlayIcon(asset(`badge-${key(pending)}.png`), `새 주문 ${pending}건`);
  startBlink();
  if (pending > prev) alertNewOrders(pending);

  // (관리자) 접수 안 하고 창을 닫아두면 30초마다 다시 띄웁니다
  if (V.remind && !remindTimer) {
    remindTimer = setInterval(() => {
      if (pending > 0 && win && (!win.isVisible() || win.isMinimized())) {
        showWindow(false);
        win.flashFrame(true);
      }
    }, REMIND_MS);
  }
}

/**
 * 웹 화면 새 버전 자동 적용.
 * 사이트에 새로 올리면 화면 파일 이름(assets/…-해시.js)이 바뀝니다. 지금 띄운 것과 다르면 새로 불러옵니다.
 * 직원이 입력 중일 수 있으니 창이 열려 있고 팝업(.modal)이 떠 있으면 다음 확인 때로 미룹니다.
 */
async function checkWebUpdate() {
  if (!win || win.webContents.isLoading()) return;
  try {
    const res = await net.fetch(BASE + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return;
    const html = await res.text();
    const latest = (html.match(/assets\/[^"']+\.js/) || [])[0];
    if (!latest) return;
    const current = await win.webContents.executeJavaScript(
      "Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src')).join(' ')",
    );
    if (current.includes(latest)) return;
    const busy = await win.webContents.executeJavaScript("!!document.querySelector('.modal, input:focus, textarea:focus')");
    if (busy && win.isVisible()) return;
    await session.defaultSession.clearCache();
    win.webContents.reloadIgnoringCache();
  } catch {
    /* 인터넷이 잠깐 끊겨도 다음에 다시 확인 */
  }
}

function autoStartOn() {
  return app.getLoginItemSettings().openAtLogin;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    ...V.pages.map(([label, hash]) => ({ label, click: () => go(hash) })),
    { type: 'separator' },
    {
      label: '새 건이 오면 창 자동으로 띄우기',
      type: 'checkbox',
      checked: popupOn(),
      click: (item) => writeSettings({ popup: item.checked }),
    },
    { label: '새로 불러오기 (최신 화면)', click: async () => { showWindow(true); await session.defaultSession.clearCache(); win.webContents.reloadIgnoringCache(); } },
    {
      label: '컴퓨터 켤 때 자동 실행',
      type: 'checkbox',
      checked: autoStartOn(),
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    {
      label: '종료',
      click: async () => {
        const r = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['계속 켜두기', '종료'],
          defaultId: 0,
          cancelId: 0,
          title: V.title,
          message: V.quitWarn,
          detail: '그래도 종료하시겠습니까?',
        });
        if (r.response === 1) {
          quitting = true;
          app.quit();
        }
      },
    },
  ]);
}

// 웹페이지(관리자 주문판)가 접수 대기 건수를 알려 줍니다
ipcMain.on('ph:pending', (event, n) => {
  const url = event.senderFrame ? event.senderFrame.url : '';
  if (!url.startsWith(ORIGIN)) return; // 우리 사이트에서 온 것만
  setPending(n);
});

app.on('second-instance', () => showWindow(true));

app.whenReady().then(async () => {
  // 처음 한 번만: 컴퓨터 켤 때 자동 실행 켜기 (트레이 메뉴에서 끌 수 있습니다)
  const flag = path.join(app.getPath('userData'), 'first-run-done');
  if (!fs.existsSync(flag)) {
    app.setLoginItemSettings({ openAtLogin: true });
    try { fs.writeFileSync(flag, '1'); } catch { /* 무시 */ }
  }

  // 켤 때마다 예전 화면 기억을 지우고 최신 화면으로 시작
  await session.defaultSession.clearCache().catch(() => undefined);
  setInterval(() => void checkWebUpdate(), UPDATE_CHECK_MS);

  tray = new Tray(asset('tray.png'));
  trayIdle();
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => go(V.pages[0][1]));
  tray.on('balloon-click', () => go(V.pages[0][1]));

  createWindow();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* 트레이에 남아 있습니다 */ });
