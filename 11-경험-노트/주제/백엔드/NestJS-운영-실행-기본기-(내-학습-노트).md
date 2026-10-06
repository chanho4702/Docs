---
type: topic
tags: [topic, nestjs, backend, operations, deployment, logging, learning]
created: 2026-06-02
updated: 2026-06-02
---

# NestJS 운영·실행 기본기 (내 학습 노트)

> NestJS 백엔드를 빌드·실행·배포·로깅할 때 반복적으로 필요한 기본기. 학습용 레퍼런스.
> 사례: [[moveseye]] (Zabbix 모니터링 BE).

## 0. 핵심 멘탈 모델
- NestJS는 **TypeScript 소스(`src/`)** 로 개발하고, **빌드하면 `dist/`** 에 순수 JS가 떨어진다.
- 개발 중엔 소스를 즉석 컴파일해서 돌리고, **운영에선 미리 빌드한 `dist/`를 node로 직접 실행**한다 — 이 둘을 헷갈리면 안 된다.
- 모든 실행 명령은 `package.json`의 **`scripts`** 에 정의된다. `npm run <이름>`은 거기서 같은 키를 찾아 실행.

## 1. 실행 스크립트 구분 (제일 중요)
| 명령 | 실제 실행 | tsc 컴파일? | 용도 |
|------|-----------|:---:|------|
| `npm start` / `npm run start` | `nest start` | O (매번) | 개발 — 소스 즉석 실행 |
| `npm run start:dev` | `nest start --watch` | O (watch) | 개발 — 저장 시 자동 재시작 |
| `npm run start:debug` | `nest start --debug --watch` | O | 디버거 attach |
| `npm run build` | `nest build` | O → `dist/` | 운영 산출물 생성 |
| `npm run start:prod` | `node dist/main` | X (이미 빌드됨) | **운영 실행** |
| `npm run start:pm2` | `pm2 start dist/main.js` | X | **운영 + 프로세스 관리** |

⚠️ **함정: `npm start`는 운영용이 아니다.** `nest start`는 `dist/`를 무시하고 소스를 다시 컴파일한다.
→ 서버에 `dist`만 올리고 `npm start` 하면 의미 없음(+ `@nestjs/cli`·`ts-node` 같은 devDependencies까지 필요).
→ 운영은 반드시 **`node dist/main`**(= `start:prod`) 또는 PM2.

## 2. 빌드 동작 (`nest build`)
- `tsconfig.build.json` 기준으로 컴파일 → `dist/`. (`tsconfig.json`을 확장하되 test/spec 제외)
- **path alias**(`@/*` → `src/*`)는 빌드 시 `tsconfig-paths`가 상대경로로 변환해줌 → dist에선 alias 안 남음.
- nest build는 항상 clean이 아님. 깔끔히 하려면: `dist/` 삭제 후 빌드.
- 빌드는 곧 **타입체크** 역할도 함 — 타입 에러 있으면 빌드 실패.

## 3. `nest-cli.json` 의 역할
- `nest start`/`nest build`의 동작을 제어하는 설정 파일.
- `sourceRoot`(보통 `src`), `entryFile`(보통 `main`), `compilerOptions.assets`(빌드 시 `dist`로 복사할 비-TS 파일: hbs 뷰·json 등), `deleteOutDir` 등.
- **운영에서 정적파일/뷰가 누락되면 여길 의심** — `assets`에 안 넣으면 `dist`로 안 복사됨.

## 4. 운영 배포 체크리스트 (리눅스 서버)
`dist/`만 올리면 안 된다. main.ts가 참조하는 것들을 함께 챙긴다:

| 필요 | 이유 |
|------|------|
| `dist/` | 빌드 산출물 |
| `node_modules` | 서버에서 `npm ci --omit=dev`로 설치(운영 의존성만) |
| `package.json` / `package-lock.json` | 스크립트 + 의존성 잠금 |
| `.env` (운영값) | `ConfigService`가 읽음. **DB/Redis 호스트를 운영값으로** (localhost 아님) |
| `public/`, `views/` | `app.useStaticAssets()`, `setBaseViewsDir()`가 참조(hbs) |
| `log/` 쓰기 권한 | winston이 파일 기록 |

```bash
# 서버에서
npm ci --omit=dev      # 운영 의존성만
# .env 운영값 배치
node dist/main         # 또는: pm2 start dist/main.js --name <svc>
```
- **마이그레이션 자동 실행 주의:** `main.ts`에서 부팅 시 `runMigrations`를 호출하면 운영 DB 스키마가 자동 변경된다. 첫 배포/스키마 변경 시 인지 필수.
- 운영은 `node dist/main` 생짜보다 **PM2**(죽으면 자동 재시작·로그 관리) 권장.

## 5. main.ts(부트스트랩) 의 일들
`NestFactory.create()` 이후 전형적으로:
- `app.get(ConfigService)` — DI 컨테이너에서 서비스 꺼내기
- Swagger 셋업 (`SwaggerModule`)
- 전역 인터셉터/필터/파이프 등록 (`app.useGlobalInterceptors(...)`)
- `app.enableCors()`, 정적파일/뷰 디렉토리, viewEngine
- `await app.listen(port)` — 포트 바인딩

## 6. 로깅 운영 — winston + NestJS 내장 로거 "배선"
NestJS엔 **로거가 둘**이다. 이걸 연결 안 하면 운영 로그가 파일에 안 남는다:
1. **NestJS 내장 로거** — 프레임워크가 직접 찍는 시스템(WAS) 로그(`[NestApplication]`, 라우트 매핑, 부트스트랩, 에러). **기본은 콘솔에만** 출력.
2. **커스텀 winston 로거** — 파일(`log/`)에 기록. 코드가 직접 호출한 것만 적힘.

→ **`app.useLogger(winstonLogger)`** 한 줄이 (1)을 (2)로 배선. 이게 없으면 WAS 로그가 콘솔에서 증발하고 파일엔 안 남는다.
```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true }); // 초기 로그도 버퍼
app.useLogger(logger);          // NestJS 내장 로그를 winston(파일)으로
```
- `bufferLogs: true` — useLogger로 교체되기 전 부트스트랩 로그까지 보존.

### winston-daily-rotate-file 운영 포인트
- `level`: winston은 **설정 레벨보다 우선순위 높은 것까지** 통과시킴.
  순서: `error(0) < warn(1) < info(2) < http(3) < verbose(4) < debug(5) < silly(6)`.
  운영은 보통 `info`. `silly`로 두면 전부 떨궈 디스크 폭증.
- **레벨 하드코딩 금지** → `.env`의 `LOG_LEVEL`로. (단, `dotenv.parse()`만 쓰면 `process.env`에 주입 안 됨 → 부트스트랩에서 `ConfigService.logLevel`을 명시적으로 로거에 적용해야 함.)
- **Windows 심볼릭링크 함정:** `createSymlink:true`로 `combined.log`/`error.log` 고정 심링크를 만드는데, Windows는 심링크에 관리자 권한이 필요해 **0바이트 깡통**이 생긴다. → Windows에선 날짜 파일(`combined-YYYY-MM-DD.log`)을 직접 봐야 함. 코드에선 `process.platform !== 'win32'`로 분기.
- **meta 버그:** NestJS 내장 로거는 `log(message, context)` 형태로 **마지막 인자에 context(string)** 를 넘긴다. 이걸 `{...meta}`로 객체에 펼치면 `{"0":"RoutesResolver"}` 같은 인덱스 키가 박힘 → 로그 파싱(ELK) 깨짐. 마지막 string 인자를 context로 분리 처리할 것.

## 7. 트러블슈팅
- **`EADDRINUSE :::3000`** — 이전 dev 서버(watch)가 안 죽고 포트 점유. watch 모드에서 Ctrl+C 누락/터미널 강제 종료 시 자식 node가 남음.
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
  ```
- **운영에서 로그 파일이 거의 비어있음** — `useLogger` 미배선(§6) 또는 Windows 빈 심링크를 보고 있는 것.
- **운영에서 정적파일/뷰 404** — `nest-cli.json`의 `assets` 누락으로 `dist`에 미복사(§3).

## 사례 (어느 프로젝트에서 나왔나)
- [[moveseye]] — 로깅 3종 문제(WAS 로그 미배선·Windows 0바이트 심링크·`{"0":[]}` meta 버그)를 진단·패치. `main.ts`에 `bufferLogs`+`useLogger` 추가, `silly`→`LOG_LEVEL` env화, 콘솔 transport 추가, 심링크 OS 분기. 포트 3000 EADDRINUSE도 좀비 node 정리로 해결.
  - 상세: [[2026-06-01-runtime-environment]], [[2026-06-02-be-codebase-audit]]

## 관련 노트
- [[moveseye-overview]] — NestJS BE 구조/규칙 온보딩
- [[claude-code-basics]] — 세션/하네스 기본기
