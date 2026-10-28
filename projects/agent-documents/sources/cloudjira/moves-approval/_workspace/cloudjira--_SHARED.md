# 모든 태스크 공통 규칙 (스펙 앞에 반드시 읽을 것)

## 저장소 문서
루트 `CLAUDE.md`(아키텍처·불변식 9개·플랫폼 함정), `AGENTS.md`(작업 규칙).

## UI 규칙 — Atlassian Design System 준수 (어기면 재작업)

1. **컴포넌트는 `@atlaskit` 을 쓴다.** 버튼·표·모달·폼을 직접 만들지 않는다 —
   접근성(포커스 관리·aria·키보드)을 다시 구현해야 하고 Marketplace 심사에서 먼저 지적된다.
   설치된 것: button, textfield, textarea, select, checkbox, toggle, datetime-picker, form,
   modal-dialog, section-message, banner, flag, lozenge, badge, avatar, tooltip, tabs,
   dynamic-table, pagination, empty-state, skeleton, heading, primitives, tokens, icon,
   dropdown-menu, menu, side-navigation, page-layout.
2. **색·간격·타이포를 하드코딩하지 않는다.** `@atlaskit/tokens` 의 `token()` 과
   primitives(`Box`/`Stack`/`Inline`)의 `space`/`padding`/`backgroundColor` prop 만 쓴다.
   하드코딩하면 다크 모드에서 그 부분만 라이트로 남는다.
3. **레이아웃은 `src/app/AppShell.jsx` 를 쓴다.** 좌측 사이드바 + 본문 셸이 이미 있다.
   화면마다 사이드바를 새로 만들지 말 것.
4. **로딩은 스피너가 아니라 스켈레톤**(`@atlaskit/skeleton`). 레이아웃 점프를 막는다.
5. 상태는 색만으로 구분하지 않는다 — `Lozenge` 에 **텍스트를 함께** 넣는다(색각 접근성).

## 프론트 호출 규약

```js
import { invokeApproval } from '../api/invokeApproval';
const content = await invokeApproval('fnName', payload);  // 실패 시 ApprovalError throw
```
`res.success` 확인은 `invokeApproval` 안에 있다. 직접 `invoke` 를 부르지 말 것.
분기는 `error.name` 이 아니라 **`error.code`** 로 한다.

## 서버 규약

- resolver 등록 3단계: `guardedDefine` → `PermissionMap` → `CONTROLLER_REGISTRARS`.
  하나라도 빠지면 런타임에서만 죽는다. 계약 테스트가 이 셋을 대조한다.
- 응답: `{ content: ... }` 를 반환하면 래퍼가 `{success:true, content}` 로 감싼다.
- **서버는 사람이 읽을 문구를 만들지 않는다.** 에러는 코드, 알림은 `{templateKey, vars}`.
- `'SELF'` 로 등록한 것은 서비스가 `principal.accountId` 로 범위를 좁힐 책임이 있다.
  **`payload` 의 actorKey 를 신뢰하지 말 것.**

## i18n

문구는 `locales/kr/<네임스페이스>.json` 과 `locales/en/<같은 파일>` **양쪽에** 넣는다.
한쪽만 넣으면 `npm run merge` 가 종료 코드 1 로 실패한다.
프론트에서는 `useI18nStore` 의 `t(key)` 를 쓴다.

## 공용 파일 충돌 방지 (중요)

여러 태스크가 병렬로 돈다. **다른 태스크가 만든 파일이 워크트리에 나타나도 건드리지 말 것.**
`src/permission/PermissionMap.js` 와 `src/index.js` 는 여러 태스크가 함께 쓰므로,
**자기 항목만 추가**하고 남의 줄을 지우거나 재정렬하지 않는다.

## 검증

```
npx jest --runInBand      # 기존 테스트가 깨지면 안 된다
npm run build:ui
npx forge lint
```
커밋·푸시는 하지 않는다. 통합은 사람이 한다.
