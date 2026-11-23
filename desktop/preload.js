// 관리자 웹페이지 ↔ 윈도우 프로그램 연결. 웹페이지는 window.phDesktop.setPending(건수)만 쓸 수 있어요.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('phDesktop', {
  isDesktop: true,
  setPending: (n) => ipcRenderer.send('ph:pending', Number(n) || 0),
});
