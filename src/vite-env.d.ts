/// <reference types="vite/client" />

/** 윈도우 프로그램(desktop/)에서 열었을 때만 있습니다 */
interface Window {
  phDesktop?: { isDesktop: true; setPending: (n: number) => void };
}
