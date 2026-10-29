---
type: project
tags: [moveseye, handoff, pc-migration, git-bundle, worktree, remaining-work]
created: 2026-10-28
updated: 2026-10-28
status: active
---

# 2026-10-28 — PC 교체 인계: 문서·진행 중 작업·남은 일

- 프로젝트: [[moveseye]] · 직전 기록 [[2026-10-28-zabbix-proxy-management]] · [[2026-10-28-runtime-verification-and-actor-fix]]
- 옮긴 것 전부: `projects/moveseye/_pc-migration-2026-10-28/` (32MB)
- 🔴 **이 Vault에 넣지 않은 것**(비밀값) — 새 PC로 **따로** 옮겨야 한다: 아래 §3.

## 1. 옮긴 것

| 폴더 | 내용 |
|---|---|
| `workspace/` | `C:\solutions\_workspace` 문서 905개(설계·계약·검수·QA·계획). `_archive`는 md·txt만. 빌드 산출물·2MB 넘는 파일·`obsidian-consolidation-20261028`은 뺐다 |
| `repo-root/` | 루트 `CLAUDE.md`·`COLLAB.md`·`AGENTS.md`·개발자 온보딩·신규 입사자 제품 소개 |
| `git/` | 커밋 안 한 작업 패치 2개 + 원격에 없는 커밋 번들 7개(§2) |
| `archives/moveseye-docs-worktree.zip` | `moveseye-docs` 작업 트리 그대로(다른 세션의 미커밋 이름 바꾸기 포함). zip으로 둔 이유: 안의 `guides/features/*.md` 11개가 기능 지도 노트와 이름이 같아 위키링크가 꼬인다 |
| `archives/claude-memory.zip` | Claude 메모리 135개(`~/.claude/projects/C--solutions/memory`) |
| `tools/` | BE 기동 스크립트 2개, Zabbix JSON-RPC·런타임 실측 스크립트(`zbx.py`·`rt_proxy.py`·`rt_common.py`·`rt_api.py`) |

- 사본 안의 개발용 비밀번호는 `<dev-pw>`·`<dev-admin-pw>`로 가렸다. 실측 스크립트는 `MOVESEYE_DEV_PW` 환경변수를 읽는다. `zbx.py`는 Zabbix 접속 정보를 dev DB 설정에서 읽는다.
- 원격(Bitbucket·GitHub)에 이미 있는 코드는 넣지 않았다 — 새 PC에서 clone한다.

## 2. 코드 상태와 복원 방법

### 원격에 없는 것 (2026-10-28 17시 기준)

| 저장소 | 브랜치 | 상태 | 파일 |
|---|---|---|---|
| moveseye-be-spring | `master` | `df1b39f` 1개 미푸시(행위자 이름 수정) | `be-master-unpushed.bundle` |
| moveseye-be-spring | `zabbix-proxy` | `master` 위에 **미커밋** 변경 27건(프록시 BE) | `zbx-proxy-be.uncommitted.patch` |
| moveseyee_fe | `zabbix-proxy` | `edf667c` 위에 **미커밋** 변경 16건(프록시 FE) | `zbx-proxy-fe.uncommitted.patch` |
| moveseye-be-spring | `ZM-172` | 11커밋(DB 모니터링, 다른 세션) | `be-ZM-172.bundle` |
| moveseye-license-issuer | `ZM-172` | 2커밋(`047f30c`·`16cfa81`) | `license-issuer-ZM-172.bundle` |
| moveseye-be-spring | `codex/apm-deep-diagnostics-20261028` | `b92311a` 등 2커밋(Codex 세션 APM 심층 진단) | `apm-deep-be-branch.bundle` |
| moveseyee_fe | 같은 이름 | `060ad4d` 1커밋 | `apm-deep-fe-branch.bundle` |
| moveseye-otel-extension | 같은 이름 | `cfef319` 1커밋 | `otel-extension-apm-deep.bundle` |
| moveseye-docs | `main` | **원격이 없는 로컬 전용 저장소**(21커밋) + 미커밋 56건 | `moveseye-docs-all.bundle` + `archives/moveseye-docs-worktree.zip` |

- FE `master`·license-issuer `main`·moveseye-ai `main`은 원격과 같다. ZM-155 후속·알람 A5/B12/B13-① 커밋은 이미 원격에 있다.
- 번들은 `git bundle verify`, 패치는 `git apply --check`로 모두 확인했다.

### 복원 순서 (새 PC, `M`=이 폴더의 `git` 경로)

```powershell
# 1) 원격에서 clone (C:\solutions 아래 같은 이름으로 두면 문서의 경로가 그대로 맞는다)
#    moveseye-be-spring · moveseyee_fe · moveseye-license-issuer · moveseye-ai · moveseye-otel-extension · Docs

# 2) 원격에 없는 커밋 붙이기 — 각 저장소에서
git fetch $M\be-master-unpushed.bundle master:master          # be-spring (master를 체크아웃하지 않은 상태에서)
git fetch $M\be-ZM-172.bundle ZM-172:ZM-172
git fetch $M\apm-deep-be-branch.bundle codex/apm-deep-diagnostics-20261028:codex/apm-deep-diagnostics-20261028
#   FE: apm-deep-fe-branch.bundle / license-issuer: license-issuer-ZM-172.bundle / otel: otel-extension-apm-deep.bundle (같은 형식)

# 3) 프록시 작업 되살리기 (워크트리 권장)
git -C moveseye-be-spring worktree add C:\worktrees\zbx-proxy-be -b zabbix-proxy master   # master = df1b39f
git -C C:\worktrees\zbx-proxy-be apply $M\zbx-proxy-be.uncommitted.patch
git -C moveseyee_fe worktree add C:\worktrees\zbx-proxy-fe -b zabbix-proxy edf667c
git -C C:\worktrees\zbx-proxy-fe apply $M\zbx-proxy-fe.uncommitted.patch
#   FE 워크트리 node_modules는 정션: New-Item -ItemType Junction ... (지울 땐 정션부터 rmdir)

# 4) 로컬 전용 문서 저장소
git clone $M\moveseye-docs-all.bundle moveseye-docs   # 그다음 worktree.zip 내용을 덮어써 미커밋 변경 복원
```

## 3. Vault에 없는 것 — 직접 옮기기

| 항목 | 위치 | 비고 |
|---|---|---|
| 🔴 BE `.env` | `C:\solutions\moveseye-be-spring\.env` | 정본. `CREDENTIAL_ENCRYPTION_KEY`가 다르면 DB에 저장된 자격증명이 깨진다(Tag mismatch) |
| FE `.env`·`.env.server` | `C:\solutions\moveseyee_fe\` | |
| 🔴 라이선스 개인키 | `C:\solutions\moveseye-license-issuer\keys\private-key.pem` | 잃으면 같은 공개키로 발급 불가 |
| Codex 로그인 | `~/.codex` | 새 PC에서 다시 로그인 |
| Claude 메모리 | `archives/claude-memory.zip` → `~/.claude/projects/<경로 슬러그>/memory/` | 작업 루트가 `C:\solutions`이면 슬러그 `C--solutions` |
| 이 Vault 자체 | `C:\Users\DMOVE\claude-experiences` | git이 아니다 — 폴더째 복사 |
| Claude·Codex 설정(하네스·메모리·훅·허용목록) | Vault `agent-config/` (10-29 추가) | `agent-config/README.md` 복원 표대로 같은 경로에 되돌린다. 비밀값은 뺐고 절대경로 `C:/Users/DMOVE`는 치환 |
| 도커 DB 데이터 | `dmove-postgres-test`(5433, dev 데이터·Zabbix 설정)·`dbm-test-pg16`(5436)·`dmove-postgres-dev74`(5434) | **덤프 안 함**. 필요하면 `pg_dump` 후 새 PC에서 복원(Flyway 시드만으로도 기동은 된다) |
| `_tools` 큰 파일 | `C:\solutions\_tools`(379MB: otel·headless-shot 등) | 기동 스크립트 2개만 넣었다 |
| OTel 에이전트 | `C:\ProgramData\moveseye\otel\` | IDE로 APM 붙여 띄울 때 |

### 새 PC 도구
- JDK 17(`$env:JAVA_HOME` 매번 지정 — 옛 PC 전역 값은 1.8이었다), Node(FE `npm run dev -- --host 0.0.0.0`), Docker, Python, Codex CLI, Git.
- BE 기동: `tools/run_be_3000_dev.ps1`(`.env`를 UTF-8로 읽고 `bootRun -x test --no-daemon`, 약 150초).
- Codex 검수: `codex exec --skip-git-repo-check -s read-only -m gpt-6.1-sol -c model_reasoning_effort='"high"' -c windows.sandbox='"unelevated"' --add-dir C:/solutions/_workspace -o <출력> - < 프롬프트.md` (astra 금지).

## 4. 남은 작업 (위일수록 먼저)

**① 진행 중 — 프록시·프록시 그룹 관리** ([[2026-10-28-zabbix-proxy-management]])
1. FE 2차 Codex 검수 — 메모리 부족으로 중단, 다시 돌리기
2. 런타임 실측 — BE를 `zabbix-proxy` 코드로 띄우고 `tools/rt_proxy.py`. 🔴 dev Zabbix `ZabbixProxyDemo`(proxyid 1) 손대지 말 것, 시험 객체는 `rt-px-*`
3. 커밋 — 티켓 번호 필요
4. 마무리 — master 병합, 워크트리 정리, AI 화면 목록 등록

**② 승인 대기**
5. 푸시 — BE `df1b39f`
6. 문서 커밋 — `moveseye-docs`(다른 세션 미커밋 변경 정리 먼저), ZM-151~156 기능 문서·실측 문서
7. Vault INDEX 끝부분 3줄 정리(다른 세션이 붙인 중복)

**③ 작게 끝나는 것**
8. 콜드 아카이브 계약서 문구 2곳(큰따옴표 규칙, 파일 없을 때 `ok:false`)
9. `ApmExportIT` 2건 실패 원인(수정 전 master에서도 실패)

**④ 방향 결정 필요**
10. APM 독자 알림 창구(B1~B3, B13-②)·알람 원자성 2차(outbox)
11. APM 규칙·서비스 삭제 시 장애 이력 CASCADE
12. 다음 Zabbix 래핑: SLA, 인증(LDAP·SAML), API 토큰, General 설정

**⑤ 실제로 돌려 보지 않은 것**
13. macOS 설치 가이드 탭 · 14. APM 1분 집계 교착 부하 재현 · 15. 콜드 아카이브 NFS·컨테이너 볼륨·BE 2대 · 16. ZM-155 L5·L8·다중 노드·fail-closed

**⑥ 보류**
- APM: 오늘 사용자 수, 셀프 APM, 데이터량 자체 진단, 이해도·AI 백로그
- Zabbix 데이터 아카이빙(설계 초안), ZM-144, ZM-134, Prometheus 스텝 6

**다른 세션이 맡은 것** (이 인계와 별개, 번들만 챙김)
- DB 모니터링 ZM-172 — 10커밋+, 다음은 WS-10 롤업 또는 WS-4 FE. 이력 정본 `workspace/features/premium/db-monitoring/history_zm172-worklog.md`
- APM 심층 진단(Codex) — [[2026-10-28-apm-deep-diagnostics-design]], 브랜치 `codex/apm-deep-diagnostics-20261028` 3개 저장소에 커밋됨
- 문서 일괄 가져오기 계획 `workspace/obsidian-consolidation-20261028/`(5,238건을 `projects/agent-documents`로) — **실행 안 됨**(Vault에 그 폴더 없음). 이번 사본에서는 뺐다

## 지켜 온 규칙 (메모리 요약)
- 커밋은 승인 뒤, **푸시 금지**, `git add -A` 금지, Co-Authored-By 금지, 형식 `#ZM-nnn [FEAT]|[FIX] 요약 -날짜`, 검수 출처 쓰지 않기.
- BE 재기동은 사용자가 말할 때만. 메모리 부족으로 죽은 작업은 묻기 전에 다시 띄우지 않는다.
- IT 스위트 동시 실행 금지(IT DB 공유). 시험 서버 10.220.0.13 금지. 같은 기능 2회 연속 반려면 멈추고 묻기.
- 워크트리 지우기 전에 node_modules 정션부터 끊기.
