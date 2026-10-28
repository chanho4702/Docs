---
name: forge-frontend-dev
description: "moves-approval-jira 프론트 구현 규약 — static/ui CRA/craco 멀티 엔트리(3곳 동시 수정), invokeApproval 응답 규약, react-query 쿼리키 팩토리, Atlaskit 재사용 컴포넌트, locales/kr·en + merge, iframe 함정(100vh·lazy 청크). frontend-engineer 가 화면·엔트리·번역을 구현·수정할 때 반드시 사용. '프론트만 다시', UI 테스트·빌드 실패 수정에도 사용."
---

# Forge Frontend Dev — static/ui 규약

## 구조

```
static/ui/src/
  entries/<key>.jsx      엔트리(= Forge 화면 하나). mount.jsx 로 AppProviders 를 씌운다
  features/<기능>/        화면·훅
  components/            공용(table/, PersonAvatar, DecisionStamp, skeleton/)
  api/invokeApproval.js  resolver 호출 단일 지점
  utils/queryKey/        쿼리키 팩토리
```

## 엔트리 추가 — 세 곳 동시

1. `static/ui/craco.config.js` `ENTRIES` 에 `key: 'entries/<key>.jsx'`
2. `static/ui/public/<key>.html` (기존 html 복사)
3. `manifest.yml` 모듈의 `resource: main/<key>` 와 `resources[].entry`
하나라도 빠지면 빌드는 되고 화면만 빈다. 무거운 화면(엑셀·PDF·서명 패드)은 `importWithReloadOnce` 로 지연 로드한다 — 배포 직후 사라진 청크 요청 시 1회 reload 로 복구.

## resolver 호출

- `invokeApproval(fnName, payload)` 만 쓴다. 성공이면 `content`, 실패면 `ApprovalError`(code 포함)를 던진다.
- 분기는 `error.code`(서버 `ErrorCodes`) 로. `error.name`·message 문자열 비교 금지.
- 소비 경로는 `02_backend_report.md` 의 실제 shape 에 맞춘다. `invokeApproval` 가 이미 `content` 를 벗겨 준다는 점을 잊지 않는다(`res.content.content` 이중 접근 버그 주의).

## 상태·쿼리

- react-query. 키는 `utils/queryKey/` 팩토리 함수로만(인라인 배열 금지 — 무효화가 어긋난다).
- 결정·제출 후에는 관련 목록 키(내 차례·팀 매트릭스·내 타임시트)를 함께 무효화한다.

## UI 규칙

- 재사용 먼저: `components/table`(CommonTable, CursorPagingTable — 총건수 대신 "더 보기"), `features/approval/ModalLayout`(dismiss/actions 슬롯), `features/request/ApprovalLineEditor`, `features/inbox/BulkApproveBar`, `components/PersonAvatar`.
- 볼드는 제목(Heading)에만. 섹션 라벨로 위계를 만든다.
- 모달 높이는 내용이 정한다 — `100vh`·`calc(100vh - …)` 금지(iframe 되먹임으로 하단 버튼이 잘린다).
- 날짜·시간 표시는 사용자 로캘·타임존. 서버 값은 epoch ms 로 받는다.
- 이미지 자산(아바타)은 절대 URL, 실패 시 이니셜.

## i18n

- `locales/kr/<ns>.json` 과 `locales/en/<ns>.json` 에 같은 키를 동시에 추가 → `npm run merge`(두 언어 키 집합이 다르면 실패). 생성물 `ko-KR.json`·`en-US.json` 은 직접 수정·커밋하지 않는다.
- 화면 문자열 하드코딩 금지. 서버가 준 `{templateKey, vars}` 는 렌더 시점에 번역.
- `error.json` 키는 `ErrorCodes` 값과 정확히 일치.

## 검증

```
npm run merge
npm run test:ui -- --runInBand
npm run build:ui
```
결과(통과·실패 출력)를 `02_frontend_report.md` 에 그대로 적는다.
