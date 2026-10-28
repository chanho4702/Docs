# Confluence Approval DC 배치 8a 전자서명·PIN 백엔드

- C9에 전자서명 설정, `APR_SIGN`/`APR_PIN` AO entity 및 저장소, PBKDF2 기반 PIN 잠금 정책을 추가했다.
- 서명 데이터와 PIN은 REST `@FormParam`으로만 받고, 승인 결정 시 서명 PIN 의무 설정을 서버에서 검증한다.
- AO unique 컬럼은 신규 행 생성 시 `DBParam`으로 값을 주입해야 한다.
- 설정 키가 늘어나면 `ApprovalRegionMacroSettingsCacheTest`의 설정 조회 횟수도 실제 읽기 키 수에 맞게 조정해야 한다.
