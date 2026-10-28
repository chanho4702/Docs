---
type: project
tags: [moveseye, environment, devops, docker, gitlab-ci, deployment]
created: 2026-06-01
updated: 2026-06-01
status: active
---

# MovesEye 실행 환경 정리

> 상위: [[projects/moveseye/moveseye|moveseye]] · 온보딩: [[projects/moveseye/moveseye-overview|moveseye-overview]]
> 분석 기준: 레포의 Dockerfile · docker-compose · .gitlab-ci.yml · .env.* · vite.config 직접 확인.

## 환경 구분 (3단계)

| 환경 | 브랜치 | FE 도메인 | 비고 |
|------|--------|-----------|------|
| **local** | (개발자 PC) | `localhost:5174` | docker-compose로 BE+DB+Redis 기동 |
| **dev** | `dev` | `https://dmove-dev.savvycom.xyz` | GitLab CI 자동 배포 |
| **qa** | `qa` | `https://dmove-qa.savvycom.xyz` | GitLab CI 자동 배포 |

- **prod 환경 정의는 레포에 없음** (dev/qa만 CI 룰에 존재).
- 호스팅: `savvycom.xyz` 도메인 — 외주/협력사(Savvycom) 인프라로 추정.
- CI Runner 태그: `owner-sv` (양쪽 레포 공통).

## 포트 맵

| 서비스 | 컨테이너 내부 | 호스트 노출 |
|--------|--------------|------------|
| BE (NestJS) | 3000 | 3000 |
| PostgreSQL | 5432 | **3410** |
| Redis | 6379 | **3411** |
| FE dev server (Vite) | — | 5174 (로컬만) |

---

## 백엔드 실행 환경

### 로컬 (docker-compose)
- `.env.example` → `.env` 복사 후 `docker-compose up -d`.
- 컨테이너 3종: `postgres:latest`, `redis:latest`, `app`(자체 Dockerfile 빌드).
- `app` 컨테이너: 소스 전체를 볼륨 마운트(`./:/usr/src/app`, node_modules는 익명 볼륨), `NODE_ENV=development`.
- `depends_on` + `links`로 postgres·redis 먼저 기동.
- 최초 계정 `admin / <마스킹>`.

### Dockerfile
- `FROM node:20`, WORKDIR `/usr/src/app`.
- `npm install` → 소스 복사 → `rimraf` 전역 + `bcrypt` 재설치(네이티브 빌드 보정).
- `EXPOSE 3000`, `CMD npm run start:dev`.
- ⚠️ **운영에서도 `start:dev`(nest watch)로 구동** — 프로덕션 빌드(`dist`) 미사용. 즉 컨테이너 안에서 TS 소스를 watch 모드로 실행하는 구조.

### 기동 시 동작 (main.ts)
- Swagger `/api` (Bearer 인증).
- **시작 시 TypeORM 마이그레이션 자동 실행** (`databaseModule.runMigrations`).
- CORS 전면 허용, 정적 파일(`public/`), hbs 뷰 엔진(`views/`).
- 전역 `ResponseInterceptor`(Redis 주입) + `TransformInterceptor`.

### 배포 (GitLab CI — `.gitlab-ci.yml`)
- 단일 stage `deploy`. `dev`/`qa` 브랜치 push 시에만 트리거.
- 스크립트:
  ```
  cd /home/dev/Dmove/$CI_COMMIT_BRANCH/dmove-be
  git checkout $BRANCH && git pull
  cp .env.$ENV .env          # 환경별 env 교체
  docker restart dmove-$ENV  # 컨테이너 재시작
  ```
- 빌드 단계 없이 **git pull + env 교체 + 컨테이너 재시작**만. (watch 모드라 재시작으로 반영)

### 환경 변수 파일
- `.env.example`(템플릿+로컬), `.env.dev`, `.env.qa` 3종이 레포에 커밋됨.
- 공통: PORT 3000, DB(dmove/<마스킹>/dmove), Redis, JWT, Zabbix, AWS, Firebase, Twilio, Novu, Mail.
- 환경 차이: `FE_PATH_WEB`(도메인), `CON_NAME`, Zabbix 계정(example: `api_admin/<마스킹>` ↔ dev/qa: `savvycom_sa/<마스킹>`), Mail 설정(dev만 Gmail SMTP 채워짐).
- ⚠️ dev/qa는 `AES_ALGORITHM_KEY`·`API_KEY_SALT`·RSA 키가 **비어 있음** (example엔 채워짐) — 암호화 관련 기능 동작 차이 가능성.

---

## 프론트엔드 실행 환경

### 로컬
- `yarn install` → `.env` 생성 → `yarn dev` (Vite, 포트 5174).
- env 선택: `.env.server`(`VITE_API_URL=http://localhost:3000`, BE 연동) / `.env.example`(`http://10.220.0.246:3000`, 내부 서버).
- 환경 변수: `VITE_API_URL`, `VITE_MAPTILER_KEY`(지도 타일).

### 빌드 (Vite 4 + SWC)
- `yarn build` = `tsc && vite build` (타입체크 후 빌드, outDir `dist`, base `/`).
- 모드별: `yarn build:dev`(`--mode dev`), `yarn build:qa`(`--mode qa`).
- ⚠️ `.env.dev`/`.env.qa`는 **레포에 없음** — 배포 서버에 별도 존재하는 것으로 보임. (로컬엔 example/server만)

### 배포 (GitLab CI — `.gitlab-ci.yml`)
- 단일 stage `build`. `dev`/`qa` 브랜치 push 시 트리거.
- 스크립트:
  ```
  cd /home/dev/Dmove/$ENV/fe
  git pull && git checkout $BRANCH
  yarn install
  yarn build:$ENV            # 정적 빌드 산출 → dist
  ```
- 컨테이너 없이 **서버에서 정적 빌드**. 빌드 결과(`dist`)를 웹서버가 서빙하는 구조로 추정.

### 패키지 매니저
- **yarn berry** (`.yarnrc.yml`), `yarn.lock`(약 290KB) 커밋됨. Node 버전 핀 파일(.nvmrc) 없음.
- Husky + lint-staged + commitlint (커밋 훅).

---

## 핵심 주의점 (작업 시)
1. **BE는 프로덕션도 watch 모드** — `dist` 빌드 파이프라인 부재. 무거운 의존성/메모리 누수 시 운영 영향 가능.
2. **마이그레이션 자동 실행** — 부팅 시 DB 스키마 변경이 적용됨. 마이그레이션 파일 추가에 주의.
3. **CI는 dev/qa 브랜치만** — `master`(현재 로컬 브랜치)는 자동 배포 대상 아님. 배포하려면 dev/qa로.
4. **시크릿 평문 커밋** — `.env.dev`/`.env.qa`/`.env.example`에 운영 자격증명 그대로 노출. → [[projects/moveseye/moveseye|moveseye]] 열린 항목 참고.
5. FE `VITE_API_URL`이 환경마다 다름 — 로컬에서 BE 붙일 때 `.env.server` 사용.
