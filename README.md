# PASTA HOUSE 룸서비스 (v2)

호텔 뮤제오 객실 QR 룸서비스 주문 시스템의 새 버전입니다. 기존 사이트(`bottega-room-service`)와 **같은 Supabase DB**를 씁니다.

| 화면 | 주소 |
|---|---|
| 손님 주문 | https://hotel-museo.github.io/room-service-v2-cloude/ |
| 관리자 주문판 | https://hotel-museo.github.io/room-service-v2-cloude/admin/ |

- 객실 번호를 미리 넣으려면 `?room=1208`, 언어를 고정하려면 `?lang=en` (ko·en·ja·zh)
- `main` 브랜치에 올리면 GitHub Actions가 자동으로 빌드해서 배포합니다.

## 폴더 구조

```
src/
  lib/       Supabase 연결, 공용 타입, 메뉴·품절·시간 규칙
  i18n/      손님 화면 4개 국어 문구
  guest/     손님 주문 화면 (메뉴, 세트 구성, 주문서, 주문 현황)
  admin/     관리자 주문판 (로그인, 접수·완료·거절, 품절, 영업 상태, 주방 영수증)
  styles/    화면별 스타일
```

카페·하우스키핑 같은 새 서비스는 `src/` 아래에 같은 방식으로 폴더를 추가해 확장합니다.

## 개발

```
npm install
npm run dev
npm run build
```
