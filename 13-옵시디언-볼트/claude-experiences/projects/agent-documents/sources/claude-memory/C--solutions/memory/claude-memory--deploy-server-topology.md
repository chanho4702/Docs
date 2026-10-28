---
name: deploy-server-topology
description: 실서버 배포 구조(FE 아파치 서버 / BE+AI 도커 서버 분리)와 로컬에선 절대 재현 안 되는 함정 4가지
metadata: 
  node_type: memory
  type: project
  originSessionId: 2718fc4c-a2e9-4233-a08b-cf43cd7cbf51
  modified: 2026-08-31T01:12:29.449Z
---

2026-08-27 첫 실서버 배포에서 확인한 구조와 함정. **전부 로컬에서 재현되지 않는 것들**이라 증상만 보고는 오진하기 쉽다.

## 구조 (서버 2대, HTTP only, :443 없음)
- **FE 서버**(`moveseye-fe`, Rocky Linux): 아파치 80이 `/var/www/html`의 Vite dist를 정적 서빙. **VirtualHost 없음·ProxyPass 없음** — 아파치는 프록시를 전혀 안 한다.
- **BE 서버**: 도커. BE 컨테이너 `-p 80:3000`(`--env-file /home/.env`). AI는 여기에 `moves-ai` :3100으로 추가.
- 브라우저는 **빌드 시점 주입 URL로 BE에 직접** 붙는다(크로스 오리진). `VITE_API_URL`·`VITE_AI_URL`을 비트버킷 레포 시크릿 → `npm run build` 앞에 붙여 주입.
- 배포는 비트버킷 파이프라인 self-hosted 러너. **러너가 레포별로 각 서버에** 있다 → AI를 BE 서버에 올리려면 BE 서버에 AI 레포용 러너를 따로 등록해야 한다(repository runner면 공유 안 됨).

## 🔴 함정 4가지 (전부 이번에 실제로 당함)
1. **`COOKIE_SECURE` 기본 true** — dev 프로파일만 false다(`application-dev.yml`). HTTP 배포에서 브라우저가 Secure 쿠키를 조용히 버려 **로그인 200인데 이후 전부 401 INVALID_TOKEN**. `localhost`는 http여도 Secure 쿠키가 허용돼 로컬에선 영영 안 나온다. → `.env`에 `COOKIE_SECURE=false`.
2. **토큰 없음도 `INVALID_TOKEN`으로 로깅**된다(`ApiAuthenticationEntryPoint:30`) — "토큰 깨짐"으로 오진 금지. 로그인 실패라면 `WRONG_USER_OR_PASSWORD`가 떠야 한다.
3. **admin(userRole=ADMIN)은 매 요청 Zabbix 로그인**을 한다(`JwtAuthFilter.resolveAuthToken`, Redis 캐시 TTL 60초). 배포 DB에 `Setting(ZABBIX)`가 없고 env 폴백도 없으면 `ZABBIX_SASMIN_LOGIN_FAILED` → **my-profile 실패 → authId 없음 → `/me/permissions` 쿼리가 `enabled:false`로 아예 안 나감 → `permissions` null → 사이드바 메뉴 전멸**(`useAuth.ts`). "사이드바가 안 나온다"의 진짜 원인이 Zabbix 미설정인 경로.
4. 라이선스 미등록 = `NONE(LOCKED)` → 스케줄러 스킵 로그가 1분마다. 정상 동작이다. 단 `/features`·`/my-profile`·`/me/permissions`는 `@LicenseExempt`라 잠금 중에도 열린다.

## AI 서버 배포 (커밋 `80bc019`, FE `f199689`, 미푸시)
- `moveseye-ai/Dockerfile`+`bitbucket-pipelines.yml` 신설(BE 것과 동일 구조).
- env 파일은 BE와 **공유**(`/home/.env`) — DB·Redis·`INTERNAL_API_TOKEN`이 같은 값이라 두 벌이면 비번 교체 때 한쪽만 고치는 사고가 난다.
  🔴 충돌하는 건 `PORT` 하나뿐(BE는 3000) → `-e PORT=3100`로 덮어쓴다(`-e`가 `--env-file`보다 우선).
  `BE_BASE_URL`·`AI_CORS_ALLOWED_ORIGINS`는 `/home/.env`에 추가(BE는 안 읽으니 무해).
  🔴 **AI는 BE의 `.env`를 읽지 않는다** — 로컬은 `application-dev.yml` 하드코딩 기본값(포트 3100·DB localhost:5433/qwe123·BE localhost:3000)으로 돈다. AI 레포엔 `.env`가 아예 없다. 값이 BE dev와 같아서 "BE env를 읽는 것처럼" 보일 뿐. Spring은 `.env`를 자동 로드하지 않는다.
- `--add-host=host.docker.internal:host-gateway` + `BE_BASE_URL=http://host.docker.internal:80` (컨테이너 안 localhost는 자기 자신).
- `-p 3100:3100` (localhost 바인딩 불가 — 브라우저가 직접 붙는다), `AI_CORS_ALLOWED_ORIGINS`에 FE 오리진 필수, `INTERNAL_API_TOKEN`은 BE와 동일값.
- 쿠키는 포트를 구분하지 않으므로 AI가 BE와 같은 호스트면 `accessToken`(Path=/)이 그대로 실린다 — AI를 BE 서버에 올리는 이유.

### 🔴 AI 산출물(엑셀) 유실 — 2026-08-31 커밋 `d9918ba`
**메타와 본문의 수명이 다르다.** 엑셀 본문은 컨테이너 안 `/tmp/moveseye-ai/artifacts`, 메타(`ai_artifact`)는
**BE와 공유하는 Postgres**(TTL 24h). 파이프라인이 배포마다 `docker rm` 하므로 본문만 사라지고 메타는 남는다
→ 배포 후 채팅 기록의 링크를 누르면 조회는 성공하고 `NoSuchFileException`으로 **500**(만료 안내가 아니라 서버 오류).
- 조치: `-v /home/moves-ai/artifacts` + `-e AI_ARTIFACTS_DIR`, `ArtifactStore.read`→`Optional`로 **404**.
- 🔴 **공유 스토리지가 아니다** — BE는 디스크에 파일을 쓰지 않고(`Files.write` 0건) 응답으로 흘려보내며,
  다운로드도 브라우저가 3100에 직접 붙는다. 그 볼륨을 읽는 건 AI 컨테이너 하나뿐.
- ⚠️ AI를 여러 대로 늘리면 깨진다 → 그때 답은 NFS가 아니라 **본문을 Postgres로**(스토리지가 이미 공유돼 있다).
- CORS `exposedHeaders("Content-Disposition")`는 이미 있다(크로스 오리진이라 없으면 한글 파일명이 죽는다).

관련: [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--dev-runtime-startup|dev-runtime-startup]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--architecture-onprem-scaleout-audit|architecture-onprem-scaleout-audit]] · [[projects/agent-documents/sources/claude-memory/C--solutions/memory/claude-memory--ai-assistant-design|ai-assistant-design]]


## 인덱스 상세 이관 (2026-09-02)

인덱스 압축으로 옮겨온 요약 — 본문과 중복될 수 있으며 본문이 우선.

실서버 배포 구조·함정 — 2026-08-27 첫 배포. FE(아파치 80·정적만)/BE+AI(도커) **서버 2대**·HTTP·빌드시 URL 주입(크로스 오리진)·러너는 레포별 각 서버. 🔴COOKIE_SECURE 기본 true라 HTTP에서 로그인 후 전부 401(localhost는 예외라 로컬 재현 불가) · 토큰 없음도 INVALID_TOKEN 로깅 · **admin은 매 요청 Zabbix 로그인** → 미설정 시 my-profile 실패→permissions 쿼리 disabled→사이드바 전멸 · AI 도커 배포 커밋 80bc019·FE f199689(미푸시), env는 BE `/home/.env` 공유+`-e PORT=3100`만 덮어씀(AI는 BE .env를 읽지 않는다 — 로컬은 dev yml 기본값)
