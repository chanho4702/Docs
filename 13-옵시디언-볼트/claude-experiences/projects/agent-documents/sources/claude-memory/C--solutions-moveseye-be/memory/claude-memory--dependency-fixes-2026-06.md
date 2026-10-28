---
name: dependency-fixes-2026-06
description: 2026-06 moveseye-be npm install/런타임 깨짐을 고친 의존성 변경 3건과 그 이유
metadata: 
  node_type: memory
  type: project
  originSessionId: e98d0bdc-2866-4602-b4ad-df6d640f27a2
---

2026-06-02 moveseye-be에서 `npm install` 및 앱 부팅이 연쇄적으로 깨진 것을 고친 변경 (peer dependency 정합성 문제).

1. **`nodemailer` `^6.9.11` → `^8.0.10`**: `@nestjs-modules/mailer`가 2.3.5부터 peer로 `nodemailer>=8.0.5`를 요구해 ERESOLVE 발생. (다운그레이드 대신 업그레이드 선택)
2. **`passport` `^0.7.0` 신규 추가**: passport가 `@nestjs/passport`의 peer로만 존재해 도커 클린 install에서 누락 → `Cannot find module 'passport'`. 명시적 dependency로 박아 해결.
3. **mailer adapter import 경로 수정** (`src/email/email.module.ts`): mailer 신버전이 `exports` 맵을 엄격화해 `@nestjs-modules/mailer/dist/adapters/pug.adapter` 내부경로가 `ERR_PACKAGE_PATH_NOT_EXPORTED`로 차단됨. `@nestjs-modules/mailer/adapters/pug.adapter`(dist 제거)로 수정.

**보류 결정**: NestJS 10→11, xlsx, pm2, firebase-admin 등 메이저 업글은 breaking change 위험으로 진행 안 함. 남은 npm audit 취약점 다수는 dev/transitive(webpack SSRF는 빌드도구라 런타임 영향 거의 없음)라 급하지 않음. xlsx는 로직 수정 동반이라 보류.

관련: [[projects/agent-documents/sources/claude-memory/C--solutions-moveseye-be/memory/claude-memory--local-run-setup|local-run-setup]]
