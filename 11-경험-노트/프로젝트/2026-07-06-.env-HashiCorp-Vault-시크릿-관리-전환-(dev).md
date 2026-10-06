---
tags: [moveseye, vault, secrets, spring, infra]
updated: 2026-07-06
---

# 2026-07-06 — .env → HashiCorp Vault 시크릿 관리 전환 (dev)

## 무엇을 했나
- 로컬 Vault 컨테이너 `dmove-vault` 구성 (`C:\solutions\vault\docker-compose.yml`, hashicorp/vault:1.18).
  - dev 모드가 아닌 **파일 스토리지 서버 모드** — 재시작해도 시크릿 유지, 대신 재시작 후 unseal 필요.
  - init 키 1개(1/1), 루트 토큰과 함께 `C:\solutions\vault\.vault-init.json` 보관. 운영 명령은 `C:\solutions\vault\README.md`.
- `.env`의 시크릿/설정 27키를 `secret/moveseye`(KV v2)로 이관. **키 이름을 .env 키 그대로** 유지한 것이 핵심 — Spring `application.yml`의 `${DB_PASS}` 플레이스홀더가 무수정으로 Vault PropertySource에서 해석된다.
- Spring 연동: `spring-cloud-dependencies:2023.0.5` BOM + `spring-cloud-starter-vault-config`, `spring.config.import: optional:vault://` + `kv.default-context: moveseye`.

## 검증 결과
- `.env` export 없이 `VAULT_TOKEN`(+`SPRING_FLYWAY_ENABLED=false`)만으로 bootRun 기동 성공 — Hikari DB 연결·Swagger 200·보호 라우트 401 확인. 기존 "bootRun 전 .env 수동 export" 함정이 사라짐.
- 폴백 검증: VAULT_TOKEN 없이 기존 .env export 방식도 기동 성공(Vault 403 WARN 후 계속 진행).

## 교훈
1. **`token: ${VAULT_TOKEN:}` 빈 기본값은 기동을 죽인다** — TOKEN 인증은 빈 토큰이면 config-data 로딩 단계에서 예외(optional·fail-fast=false로도 못 막음). 더미 기본값(`no-token-fallback`)을 줘서 "인증 초기화는 통과, 조회는 403 → fail-fast=false가 흡수" 경로로 폴백시킨다.
2. PowerShell에서 `vault kv put ... @file.json`의 `@`는 splatting으로 파싱됨 → `"@/tmp/s.json"` 따옴표 필수.
3. 시크릿 일괄 등록은 특수문자 지옥을 피해 **JSON 파일 + docker cp + `kv put @file`**이 정석. 멀티라인 PEM(FIREBASE_PRIVATE_KEY)도 JSON `\n`으로 안전.
4. OS 환경변수 > Vault 값 (Spring PropertySource 우선순위) → `$env:PORT='3001'` 식 개별 오버라이드가 그대로 됨.
5. `secret/be-auth-service` not resolvable/403 로그는 spring.application.name 경로 추가 조회 기본동작 — 무해.

## 미완 / 다음 단계
- 루트 토큰 사용 중 → 운영 전환 시 read-only policy + AppRole.
- 평문 .env로 존재했던 시크릿 로테이션(AWS 키·Zabbix Admin·JWT) 미실시.
- Nest(참조용)는 여전히 .env 직접 사용. `.env`는 폴백용으로 존치 — Vault가 정본.
- 확장 후보: DB 동적 시크릿(database engine), AWS STS(aws engine), actuator refresh 런타임 반영.

관련: [[2026-06-10-spring-conversion]], [[2026-06-01-runtime-environment]]
