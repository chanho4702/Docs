---
name: vault-secrets-management
description: "2026-08-06 Vault 미사용 확정 — 시크릿 정본은 .env(운영은 OS 환경변수), Spring 연동 주석은 되살리지 말 것. 08-12 설정 자격증명 암호화(ZM-105) 완료, JWT_SECRET 교체만 잔여"
metadata:
  node_type: memory
  type: project
  originSessionId: 36d12d5f-5c20-4a98-86a9-5a78c203ea40
  modified: 2026-08-12T04:33:33.956Z
---

🔴 **2026-08-06 사용자 결정: Vault 안 쓴다.** 시크릿 정본은 `.env`(`C:\solutions\moveseye-be\.env`), 운영은 OS 환경변수다.

- **코드는 이미 볼트를 안 탄다(2026-08-06 실측).** `application.yml`의 `spring.config.import: optional:vault://`와 `spring.cloud.vault.*` 블록, `build.gradle.kts`의 `spring-cloud-starter-vault-config`·Spring Cloud BOM이 **전부 주석 처리**돼 있다 → 기동은 `.env`를 셸에 export하는 경로다([[dev-runtime-startup]]).
- **되살리지 말 것.** 주석을 "정리"한다고 지우지도, 다시 켜지도 않는다. 결정이 바뀌면 그때 다시 판단한다.
- `C:\solutions\vault\`(docker-compose·README·config)와 `dmove-vault` 컨테이너는 **미사용 잔존물**이다. 제거 여부 미결.

**시크릿 관련 남은 과제 — Vault 전제를 걷어낸 형태**

- `JWT_SECRET` 교체: Vault가 아니라 **`.env`/운영 환경변수**로 한다. 256bit 미만이면 기동 실패(`JwtTokenProvider` 부팅 검증). 교체 시 전원 재로그인. **아직 미교체**(운영 접근 필요).
- ~~Zabbix·AWS 비밀번호 jsonb 평문 저장~~ → **2026-08-12 ZM-105로 해소**(커밋 `2839aed`). `SettingSecretCodec` AES-256-GCM, 접두어 `enc:v1:`(평문/암호문 판별 → 마이그레이션 배치 없음, 다음 저장 때 승격). 키는 `CREDENTIAL_ENCRYPTION_KEY` 환경변수, **설치본마다 다른 값**(같은 키를 전 고객사에 쓰면 한 번의 유출이 전체 유출) — 라이선스 키와 무관하다. **없으면 기동 실패**(평문 폴백 금지). 막는 것은 DB 덤프 유출이지 서버 침해가 아니다.
  - 🔴 **읽는 쪽 2곳**(`SettingBackedZabbixConnectionResolver`·`AwsServiceImpl`)이 `decrypt`를 거쳐야 한다. 복호화 호출을 지워도 **기존 테스트가 전부 통과했다**(평문만 넣고 있어서) → 양쪽에 "암호문 넣고 평문 나오는지" 테스트 신설. 새 소비자가 생기면 같은 함정.
  - 🔴 **배포 시 `.env`에 키 추가 안 하면 기동 실패한다.** dev용 키는 `C:\solutions\moveseye-be\.env`에 이미 있음.

ℹ️ 2026-07-06~08-05의 Vault 도입 내역(컨테이너·KV v2 경로·`no-token-fallback` 더미 토큰 폴백 함정 등)은 더 이상 유효하지 않아 지웠다.
