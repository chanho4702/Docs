# 설정 화면이 통째로 죽은 하루 — 키 매핑 누락, 잔존 tunnel, lazy 청크

날짜: 2026-08-31 · 프로젝트: [[moves-approval]] · 관련: [[2026-08-31-first-e2e-timestamp-byline]]

세 가지가 겹쳐서 원인 추적이 오래 걸렸다. 순서대로 적는다 — **틀린 가설을 세운 과정도 기록한다.**

## 1. 진짜 원인: 정책 기본값과 KVS 키 맵의 불일치

`DEFAULT_APPROVAL_SETTINGS`(= `POLICY_KEYS`)에는 있는데 `SETTINGS_KEYS` 에 없는 키가 둘 있었다
(`restrictAccess`, `approverSpaceCheck` — 승인자 등록제 때 한쪽에만 추가). `getPolicy` 가
`store.get(undefined)` 를 호출해 **정책 조회 전체**가 `UNKNOWN_ERROR` 로 죽었고,
화면에는 "정책을 불러오지 못했습니다"만 떴다.

- 증상이 "방금 만진 기능"이 아니라 **설정 화면 전부**였다. 변경 파일만 보면 안 보인다.
- `forge logs` 는 이번에도 비어 있었다. 실패 지점은 스파이크에 넣은 `probeSettings`
  (getPolicy / 그룹 / 승인자 / 관리자 / 단건 getValue 를 각각 잡아 본다)가 잡았다.
  **개별 읽기는 모두 성공, getPolicy 만 실패** — 이 대비가 답이었다.
- 방어: 모듈 로드 시 매핑 없는 키가 있으면 즉시 던진다 + 계약 테스트로 두 집합을 대조.

### 내가 세운 틀린 가설

키를 하나 늘리자 죽었기에 "KVS 동시 요청 한도"라고 판단하고 `mapInChunks`(5개씩)를 넣었다.
증상은 그대로였다. **"키를 늘리자 죽었다"는 개수가 아니라 그 키 자체를 의심할 근거였다.**
청크 처리는 해롭지 않아 남겼지만, 원인 설명으로는 틀렸다(커밋 메시지도 나중에 정정).

## 2. 잔존 `forge tunnel` 세션이 배포본을 가린다

배포 후 화면이 계속 비어 있었다. 원인은 앱이 아니라 iframe `src` — `http://localhost:8000/inbox.html`.
오전에 띄워 둔 터널 세션이 살아 있어 Confluence 가 로컬 리소스를 가리켰고, dev 서버는 없었다.

- 진단은 스크린샷이 아니라 DOM: `[...document.querySelectorAll('iframe')].map(f => f.src)`.
- 프로세스를 강제 kill 해도 서버 쪽 세션은 곧바로 안 풀린다(정상 종료가 통지 경로).
- **배포 검증 전에 `cloudflared`/`forge tunnel` 프로세스부터 본다.**

## 3. lazy 청크는 배포 직후 백지를 만든다

설정 화면은 `React.lazy`. 배포로 청크 파일명이 바뀌면 캐시된 옛 문서가 사라진 청크를 요청하고,
로드 실패는 Suspense 아래 트리를 통째로 언마운트해 **흰 화면**이 된다(업무함은 메인 번들이라 멀쩡).
청크 로드 실패 시 한 번만 `location.reload()` 하도록 감쌌다.

## 함께 들어간 기능

- 설정 변경 이력(`approval_settings_audit`, append-only, 기록 실패가 저장을 되돌리지 않는다)
- 결재 위임/대리 결재(`approval_delegation`) — 순서표에는 원 결재자, `delegateKey` 에 실제 결정자.
  정책을 끄면 등록돼 있어도 활성 위임 조회가 빈 배열이라 **즉시** 효력이 사라진다.
- 업무함 스페이스 이름: 스냅샷 `space_key` 에 숫자 id 가 섞여 이름 조회가 빗나갔다.
  키·id 양쪽으로 찾고, 목록 API 에 없는 스페이스는 건별 조회로 채운다.
- 타이틀(Heading) 외 볼드 전량 제거(사용자 요청).
