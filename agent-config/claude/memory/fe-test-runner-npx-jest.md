---
name: fe-test-runner-npx-jest
description: moveseyee_fe는 package.json에 test 스크립트가 없어 npx jest로 직접 실행해야 함(CLAUDE.md 문서와 불일치). ⚠️ jest 툴체인 자체가 devDependencies 미등록 — yarn add가 프루닝함
metadata: 
  node_type: memory
  type: project
  originSessionId: 9f56c257-24c7-4cb8-a1ec-51074a6daad5
---

`moveseyee_fe`의 `package.json` scripts에는 **test 관련 스크립트가 없다**(dev/build/build:dev/build:qa/lint/preview/changeset/prettier:write/prepare만 존재). Jest는 devDependency로 설치돼 있으므로 테스트는 **`npx jest`**(특정 파일: `npx jest recentlyViewed RecentlyView`)로 직접 실행한다. 타입체크는 `npx tsc --noEmit`, 빌드는 `npm run build`(tsc && vite build).

**Why:** `moveseyee_fe/CLAUDE.md`는 `npm test` / `npm run test:watch` / `npm run test:coverage`를 문서화하고 있으나 실제 package.json엔 해당 스크립트가 없다(2026-06-19 확인). 문서만 보고 `npm test`를 돌리면 "Missing script" 실패.

**How to apply:** FE 테스트 검증 시 `npx jest`를 쓴다. BE(`moveseye-be`)는 `npm test`가 정상 동작하니 혼동하지 말 것. 관련 BE 검증 루틴은 Spring의 경우 `gradlew test`(JAVA_HOME=jdk-17 필요).

**✅ 2026-07-13 해결됨**: jest 툴체인 전체(jest 30.4.2·ts-jest 29.4.11·@testing-library/react 16.3.2+dom+jest-dom·jest-environment-jsdom·jsdom·identity-obj-proxy)가 devDependencies에 미등록이라 `yarn add`가 통째 프루닝하던 부채를 사용자 승인 하에 **정식 등록**(정확 버전 pin — jest30/ts-jest29 조합이 peer 충돌이라 ^ 금지, 설치 시 `--legacy-peer-deps` 필요). `test`/`test:watch`/`test:coverage` 스크립트도 추가 — **이제 `npm test`가 동작**(위 npx jest 우회는 여전히 유효하나 필수 아님). 잔여: lockfile(yarn.lock+package-lock 둘 다 존재) 동기화 install 1회는 dev 서버 종료 후 필요.
