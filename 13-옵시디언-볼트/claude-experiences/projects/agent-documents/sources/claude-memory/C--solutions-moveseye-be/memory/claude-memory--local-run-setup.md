---
name: local-run-setup
description: moveseye-be(be-auth-service) 백엔드를 도커 대신 로컬에서 실행하는 방법과 .env 전환 포인트
metadata: 
  node_type: memory
  type: project
  originSessionId: e98d0bdc-2866-4602-b4ad-df6d640f27a2
---

moveseye-be(`be-auth-service`, NestJS 10)를 도커 대신 로컬에서 직접 실행하는 셋업. (사용자가 도커는 로그 보기 불편하다고 로컬 실행 선호)

**사전 준비**
- 로컬 PostgreSQL(5432) + Redis(6379) 실행. psql 경로: `C:\Program Files\PostgreSQL\18\bin\psql.exe`
- 로컬 postgres 계정: user=`postgres`, password=`qwe123`
- DB `dmove` 생성 필요(`CREATE DATABASE dmove;`). 테이블은 앱 부팅 시 자동 마이그레이션(`database.module.ts`의 `migrationsRun: true`, `synchronize: false`)
- ConfigService는 NODE_ENV 무관하게 루트 `.env` 하나만 읽음(`common.module.ts`의 `new ConfigService('.env')`)

**`.env` 도커→로컬 전환 포인트 (4곳)**
- `REDIS_HOST=redis` → `localhost`
- `DB_HOST=postgres` → `localhost`
- `DB_USER=dmove`/`DB_PASS=dmove2024` → `postgres`/`qwe123` (로컬 계정 기준)
- ⚠️ 이 `.env` 변경은 도커/배포 환경 값(`postgres`/`redis` 호스트, dmove 계정)이므로 **절대 커밋 금지**

**실행**
- `npm run start:dev` (watch). 앱은 3000 포트 listen
- 도커 컨테이너 `dmove-qa`가 3000을 점유하므로 로컬 실행 전 `docker stop dmove-qa` 필수 (안 그러면 EADDRINUSE)

관련: [[projects/agent-documents/sources/claude-memory/C--solutions-moveseye-be/memory/claude-memory--dependency-fixes-2026-06|dependency-fixes-2026-06]]
