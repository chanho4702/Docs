너는 독립 검수자다. 코드를 수정하지 말고 읽기만 한다. 파일은 UTF-8 로 읽어라. 답은 한국어로.

## 대상

두 Forge 앱의 **커밋되지 않은 변경**(각 리포에서 `git status`·`git diff` 로 확인, 새 파일 포함):
- `moves-approval-jira/` — 승인 앱
- `moves-workforce/` — 워크포스 앱

변경 내용: 두 앱 사이의 연동을 Jira entity property(서명 문서 게시·읽기)에서 **dynamic webtrigger + Ed25519 서명 RPC** 로 바꿨다. 첫 연결은 연결 코드 붙여넣기(페어링). 요청은 그것을 일으킨 사람(actor) 기준으로 처리하고, 받는 쪽은 서명 검증 후 actor 의 Jira 권한을 asApp `user/permission/search` 로 다시 확인한다. 워크포스에는 외부용 apiRoute 샘플(`GET /v1/organization/users`)도 추가했다.

## 먼저 읽을 것

- `moves-approval-jira/_workspace/workforce-channel-rest/00_input/requirement.md` (결정 D1~D6, Q1~Q6)
- `.../01_architect_design.md` (§2 계약, §2.2 수신 단계, §2.5 권한 재확인, §13 불변식, §15)
- `.../04_spike_todo.md` (플랫폼 실측 결과 — webtrigger 는 플랫폼 인증이 없고 principal null, 서명 헤더 전달 OK 등)
- `.../03_verify_report.md` (내부 검증에서 이미 찾은 것 — **중복 보고하지 말고**, 해소됐다고 적힌 항목이 실제로 해소됐는지만 확인)
- `moves-approval-jira/CLAUDE.md` 의 "절대 깨면 안 되는 불변식" 1~10, `AGENTS.md`

## 중점

1. **보안 (가장 중요)**: webtrigger URL 이 유출됐다고 가정한 공격자 관점.
   - 서명 우회·혼동(도메인 접두, 정규화, 헤더/본문 분리, 응답 서명과 요청 nonce 결속), 재전송(iat 창, nonce, 멱등 키), 다른 사이트·다른 linkId·방향 뒤집기, 작업 허용 목록 우회, 크기 상한, 예외로 인한 정보 노출.
   - **SQL·KVS 접근 전에** 위조가 걸러지는가(DoS·비용 공격).
   - actor 사칭: actor 가 서버 context 에서만 오는가, 받는 쪽 권한 재확인이 빠지는 경로(SYSTEM 작업, 캐시, 묶음 상한 초과, 시간 초과 시 fail-open)가 있는가.
   - 페어링: 연결 코드 탈취·재사용·만료, 한쪽 붙여넣기로 양방향 완성될 때 중간자, 재연결·해제·URL 회전의 경쟁 상태.
   - 키 관리: keyring, dev/stg/prd 분리, 개인키가 코드·로그·응답에 새는지.
   - apiRoute `UsersReadApi`: 신원(principal) 외 입력을 신원으로 쓰는지, 권한이 custom scope 로 늘어나는지, 민감 필드.
2. **정합성**: 두 앱이 같은 계약을 같은 뜻으로 구현했는가(공유 파일 `src/integration/channel/*` 은 바이트 동일). 상대 장애 시 fail-close(사용자 결정 Q3), 옛 property 정리·팀장 설정 이관 순서가 데이터를 잃지 않는가.
3. **불변식 위반**: 특히 8(asUser 기본, asApp 사용 조건), 9, 7(데이터 범위), 1·4·5(CAS·dedupe).
4. 유휴 SQL·호출량 폭증 가능성.

## 출력

마크다운으로:
- `## 요약` — 출시(dev 배포 후 실측) 전에 꼭 고칠 것이 있는지 한 줄 결론.
- `## 발견` — 표: `# | 심각도(높음/중/낮음) | 리포 | 파일:줄 | 문제 | 공격·재현 시나리오 | 고치는 방법`. 확신이 낮으면 심각도 옆에 "(추정)".
- `## 확인했지만 문제없음` — 중점 항목 중 직접 확인해서 괜찮았던 것을 짧게(근거 파일:줄).
- `## 실측으로만 판단 가능` — 코드만으로 결론 못 내는 것.
추측으로 채우지 말고, 직접 읽은 코드에 근거해라.
