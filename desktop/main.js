// PASTA HOUSE 주문 알림 (보테가 관리자용 윈도우 프로그램)
// - 관리자 웹페이지를 그대로 띄웁니다. 웹을 고치면 프로그램은 다시 설치할 필요 없어요.
// - 창을 닫아도 꺼지지 않고, 시계 옆 트레이에 아이콘으로 계속 떠 있어요.
// - 새 주문(접수 대기)이 있으면: 트레이 아이콘에 숫자 + 깜빡임, 작업표시줄 깜빡임·숫자,
//   닫혀 있던 관리자 창이 맨 앞으로 자동으로 떠요. 접수할 때까지 계속돼요.
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification, dialog, shell } = require('electron');
const path = require('path');

// PH_ADMIN_URL은 개발 중 시험용 (평소엔 비워둬요)
const BASE = process.env.PH_ADMIN_URL || 'https://hotel-museo.github.io/room-service-v2-cloude/admin/';
const ORIGIN = new URL(BASE).origin;
const APP_ID = 'kr.hotelmuseo.pastahouse.admin';
const BLINK_MS = 450; // 트레이 깜빡임 속도
const REMIND_MS = 30_000; // 접수 대기가 남아 있는데 창을 닫아두면 30초마다 다시 띄워요

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

const asset = (name) => nativeImage.createFromPath(path.join(__dirname, 'assets', name));
const key = (n) => (n > 9 ? '9p' : String(n));

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'PASTA HOUSE 주문',
    icon: path.join(__dirname, 'build', 'icon.png'),
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
  win.loadURL(BASE + '#orders');

  // 웹페이지가 제목을 "(2) 새 주문 · …"으로 바꿔도 창 제목은 프로그램 이름 + 건수로
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    updateTitle();
  });

  // X를 눌러도 종료하지 않고 트레이로 숨겨요
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && tray) {
      toldAboutTray = true;
      tray.displayBalloon({
        iconType: 'info',
        title: 'PASTA HOUSE 주문',
        content: '창을 닫아도 계속 켜져 있어요. 새 주문이 오면 다시 떠요.\n완전히 끄려면 시계 옆 아이콘 → 종료',
      });
    }
  });

  // 직원이 창을 누르면 작업표시줄 깜빡임은 멈춰요 (숫자·트레이 깜빡임은 접수할 때까지 유지)
  win.on('focus', () => win.flashFrame(false));

  // 영수증 인쇄 창(about:blank)과 같은 사이트 창은 열어주고, 바깥 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '' || url.startsWith(ORIGIN)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png') } };
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
  win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => undefined);
}

/** 창 띄우기. focus=false면 하던 일(유튜브 등)을 뺏지 않고 맨 앞에만 보여줘요 */
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
  win.setTitle(pending ? `(${pending}) 새 주문 · PASTA HOUSE` : 'PASTA HOUSE 주문');
}

function trayIdle() {
  tray.setImage(asset('tray.png'));
  tray.setToolTip('PASTA HOUSE 주문 · 새 주문 없음');
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
  showWindow(false);
  win.flashFrame(true);
  if (Notification.isSupported()) {
    const note = new Notification({
      title: `새 주문 ${n}건`,
      body: '룸서비스 주문이 들어왔어요. 주문판에서 접수해 주세요.',
      icon: path.join(__dirname, 'build', 'icon.png'),
      silent: true, // 매장 스피커로 소리가 나가지 않게
    });
    note.on('click', () => go('#orders'));
    note.show();
  }
}

function setPending(n) {
  const prev = pending;
  pending = Math.max(0, Math.min(999, Math.floor(Number(n) || 0)));
  updateTitle();
  tray.setToolTip(pending ? `PASTA HOUSE 주문 · 새 주문 ${pending}건` : 'PASTA HOUSE 주문 · 새 주문 없음');

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

  // 접수 안 하고 창을 닫아두면 30초마다 다시 띄워요
  if (!remindTimer) {
    remindTimer = setInterval(() => {
      if (pending > 0 && win && (!win.isVisible() || win.isMinimized())) {
        showWindow(false);
        win.flashFrame(true);
      }
    }, REMIND_MS);
  }
}

function autoStartOn() {
  return app.getLoginItemSettings().openAtLogin;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: '주문판 열기', click: () => go('#orders') },
    { label: '메뉴 관리', click: () => go('#menu') },
    { label: '매출 · 정산', click: () => go('#sales') },
    { type: 'separator' },
    { label: '새로 불러오기', click: () => { showWindow(true); win.webContents.reloadIgnoringCache(); } },
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
          title: 'PASTA HOUSE 주문',
          message: '종료하면 새 주문 알림을 받지 못해요.',
          detail: '그래도 종료할까요?',
        });
        if (r.response === 1) {
          quitting = true;
          app.quit();
        }
      },
    },
  ]);
}

// 웹페이지(관리자 주문판)가 접수 대기 건수를 알려줘요
ipcMain.on('ph:pending', (event, n) => {
  const url = event.senderFrame ? event.senderFrame.url : '';
  if (!url.startsWith(ORIGIN)) return; // 우리 사이트에서 온 것만
  setPending(n);
});

app.on('second-instance', () => showWindow(true));

app.whenReady().then(() => {
  // 처음 한 번만: 컴퓨터 켤 때 자동 실행 켜기 (트레이 메뉴에서 끌 수 있어요)
  const flag = path.join(app.getPath('userData'), 'first-run-done');
  const fs = require('fs');
  if (!fs.existsSync(flag)) {
    app.setLoginItemSettings({ openAtLogin: true });
    try { fs.writeFileSync(flag, '1'); } catch { /* 무시 */ }
  }

  tray = new Tray(asset('tray.png'));
  trayIdle();
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => go('#orders'));
  tray.on('balloon-click', () => go('#orders'));

  createWindow();
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => { /* 트레이에 남아 있어요 */ });
