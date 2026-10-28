---
type: topic
tags: [topic, frontend, nextjs, app-router, server-actions, sentry, scanner, lesson]
created: 2026-10-28
updated: 2026-10-28
---

# Next.js 16 `InvariantError: Expected RSC response, got text/plain`(E789)는 Server Action 스캐너 프로브가 500으로 새는 것

> 사례: docs.dmove.co.kr Sentry 이슈 DMOVETECH-2 (next 16.2.1, release 464e2bbafad8, 2026-10-27). 6건·1 "사용자"·13시간.

## 증상
- Sentry: `InvariantError: Invariant: Expected RSC response, got text/plain. This is a bug in Next.js.` transaction `POST /_not-found/page`, mechanism `on_request_error`, handled=no.
- 바로 앞 브레드크럼: `Failed to find Server Action "cachefn". This request might be from an older or newer deployment.`
- 요청: `POST /app`, `POST /api`(존재하지 않는 경로), `Accept: text/x-component`, Content-Length 227, 단일 IP(GCP 대만), UA는 Edge로 위장.

## 원인
1. 봇이 **`Next-Action` + `RSC: 1` 헤더를 붙인 POST**를 임의 경로에 뿌린다(React2Shell CVE-2025-55182 이후 전 세계 Next.js 사이트 공통 소음).
2. 액션 ID `cachefn`은 실제 ID(40자 이상 hex 해시)가 아니라 Next의 action 핸들러가 **text/plain "action not found"** 를 돌려준다.
3. 경로가 없어 `/_not-found/page`로 떨어지고, app-page 런타임이 RSC 요청인데 응답이 `text/x-component`가 아니라며 **`cacheComponents` 꺼진 분기에서 throw**(E789) → 500 + Sentry.
4. upstream 수정 PR vercel/next.js#97568은 2026-10 기준 **미병합**. 16.4.x에서도 재현 보고가 있어 **업그레이드로는 안 꺼진다**.

## 해결(선택지)
- **`proxy.ts`(16의 middleware)에서 선차단**: 앱에 Server Action이 없으면 `next-action` 헤더 있는 요청 전부 404. 있으면 ID가 `^[0-9a-f]{40,}$` 아니면 400.
- 리버스 프록시(nginx/Caddy)에서 같은 규칙으로 막아 Node까지 안 오게.
- Sentry `ignoreErrors`/`beforeSend`는 **보조**. 500 자체는 남으니 차단이 본체.
- `experimental.cacheComponents` 켜면 graceful 404 분기로 가지만 사이트 전체 캐시 모델이 바뀌어 이 목적만으로는 비권장.

## 교훈
- Sentry의 "This is a bug in Next.js"는 **입력이 쓰레기인 경우**도 포함한다. 트랜잭션·요청 헤더·브레드크럼의 앞 줄(원인 로그)을 먼저 본다.
- 사용자 1 = IP 1 = 스캐너면 우선순위 High는 과대평가. **차단 + 이슈 Resolve**가 정답이고 코드 버그 찾기로 가면 안 된다.
- `Failed to find Server Action`이 **배포 skew**(진짜 사용자, 긴 hex ID)인지 **프로브**(짧은 ID, 없는 경로)인지는 ID 길이와 경로로 가른다. skew면 `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` 고정이 해법.

## 참고
- https://github.com/vercel/next.js/discussions/87851 (프로브 패턴·프록시 차단 예시)
- https://github.com/vercel/next.js/pull/97568 (upstream 수정, open)
- https://github.com/ethereum/ethereum-org-website/issues/18795 (동일 E789 분석)
- https://nextjs.org/docs/messages/failed-to-find-server-action
