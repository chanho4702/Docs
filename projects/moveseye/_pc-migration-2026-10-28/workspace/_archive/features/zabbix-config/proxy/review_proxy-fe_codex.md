**판정: 반려 — 🔴 2건, 🟡 2건**

미커밋 변경과 새 파일을 계약·BE 구현에 대조했습니다. 파일은 수정하지 않았습니다.

**결함**

1. **🔴 최신 상세 응답을 무시해 암호화를 이전 상태로 되돌릴 수 있음**  
   위치: [ProxyFormDrawer.tsx:193](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:193), [ProxyGroupFormDrawer.tsx:44](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyGroupFormDrawer.tsx:44)

   실패 시나리오: Drawer를 다시 열 때 이전 캐시로 폼을 채우면 `filledFor`가 확정되어, 뒤이어 도착한 최신 상세를 무시합니다. **사용자가 아직 입력하지 않았어도 발생합니다.** 재현에서는 최신 상세가 `tlsAccept=2`·PSK 활성 상태인데 제출 요청은 이전 `tls_accept=1`이었습니다. 저장하면 암호화가 꺼지고 저장된 PSK도 사라질 수 있습니다. 그룹 역시 최신 설정을 이전 값으로 덮어쓸 수 있습니다.

   고치는 방향: 현재 열기에서 최신 상세를 확보한 뒤 최초 채움을 완료하거나, 사용자가 변경하기 전까지 최신 응답을 반영해야 합니다. 기존 테스트는 **편집 중 재조회 보호**만 검증하므로, **이전 캐시 → 최신 응답 → 입력 없이 저장** 케이스가 필요합니다.

2. **🔴 생성 화면에 이전 입력과 PSK가 남아 다른 프록시에 재사용됨**  
   위치: [ProxyFormDrawer.tsx:51](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:51), [ProxyFormDrawer.tsx:196](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:196)

   실패 시나리오: 생성 진입 시 `setFieldsValue(CREATE_DEFAULTS)`로 병합하지만, 기본값에 설명·허용 주소·PSK 등이 없습니다. `destroyOnClose` 이후에도 바깥의 Form 인스턴스는 유지됩니다. **편집 후 생성에서 이전 설명·허용 주소가 요청에 포함되는 현상**과, **생성을 취소한 뒤 다시 생성하면 이전 PSK 식별자·32자 키가 재입력 없이 제출되는 현상**을 재현했습니다.

   고치는 방향: 생성 세션마다 Form store를 완전히 초기화하고 기본값을 적용하거나, 세션별 Form 인스턴스를 사용해야 합니다. 기존 테스트는 첫 생성만 검사하므로 취소·재진입 및 편집→생성 전환을 추가해야 합니다.

3. **🟡 수정 화면에서 비운 값을 생략해 기존 값이 조용히 유지됨**  
   위치: [ProxyFormDrawer.tsx:123](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:123), [ProxyFormDrawer.tsx:129](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:129), [ProxyGroupFormDrawer.tsx:63](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyGroupFormDrawer.tsx:63)

   실패 시나리오: 기존 프록시의 `port`·`local_port`, 그룹의 `failover_delay`·`min_online`을 비우고 저장하면 `|| undefined`로 요청에서 빠집니다. BE는 이를 “변경하지 않음”으로 처리하므로 화면에서 비운 값과 저장 결과가 달라집니다. 포트와 그룹 두 필드의 요청 누락을 재현했습니다. 계약 §3·§6의 **수정 시 빈 값은 그대로 전달하여 거부** 규칙과 불일치합니다.

   고치는 방향: 생성과 수정의 직렬화를 구분하고, 수정에서는 빈 문자열을 전달하거나 필수 검증으로 저장을 막아야 합니다. 기존 테스트에는 빈 값으로 수정하는 케이스가 없습니다.

4. **🟡 모드를 왕복 전환하면 기존 TLS 다중 선택이 손실됨**  
   위치: [ProxyFormDrawer.tsx:94](/C:/worktrees/zbx-proxy-fe/src/pages/zabbix-management/proxy/ProxyFormDrawer.tsx:94)

   실패 시나리오: 액티브의 `[없음, PSK, 인증서]`를 패시브로 바꾸면 PSK 하나로 축약되고, 다시 액티브로 돌아와도 `[PSK]`만 남습니다. 최종 모드는 원래와 같아 모드 변경 경고도 사라집니다. 그대로 저장하면 인증서 연결 허용 등이 제거됩니다. 변환 함수를 연속 적용해 손실을 확인했습니다.

   고치는 방향: 모드별 사용자 선택을 보존하고 돌아올 때 복원해야 합니다. 기존 테스트는 단방향 변환만 확인하므로 왕복 전환 후 최종 요청을 검증해야 합니다.

**중점 확인 6개 결과**

| 항목 | 결과 |
|---|---|
| ① 모드 전환·PSK·요청 변환 | 🔴 결함 1·3·4. 기존 PSK 유지와 신규 PSK 필수 판정의 기본 경로는 구현 확인 |
| ② 채움·대상 전환·재진입 | 🔴 결함 1·2. 다른 ID의 상세를 채우지 않는 방어는 구현 확인 |
| ③ 로딩 중 비활성·숨은 탭 검증 | 🟢 `disabled`, `forceRender`, `handleFailed`의 필드별 탭 이동 구현 확인 |
| ④ URL 필터·탭 전환·그룹 `"0"` | 🟢 코드상 정상. 탭 전환 시 필터 삭제, `"0"` 유지 및 그룹 없음 필터링 확인 |
| ⑤ 캐시 무효화 | 🟢 모든 mutation에서 `PROXY_QUERY_KEY` 전체와 `HOST_MANAGE_QUERY_KEY.PROXIES` 무효화 확인 |
| ⑥ i18n | 🟢 프록시 네임스페이스 kr/en **156개 키와 보간 변수 일치** |

메모리 내 컴포넌트·변환 함수 실행으로 위 실패 경로를 확인했고, `git diff --check`는 통과했습니다. 기존 Jest 16개는 캐시 쓰기 `EPERM`으로 재실행하지 못했습니다. 전체 TypeScript 검사는 장시간 종료되지 않아 중단했습니다. 실제 브라우저 표시와 BE 연동 결과는 **확인 불가**입니다.