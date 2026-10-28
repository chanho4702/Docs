# 코드 점검 및 운영 보완 기록 (2026-09-01)

## 범위와 결론

이번 점검은 `src/`, `static/ui/src/`, `manifest.yml` 및 고객 가이드를 대상으로 했다. 승인 상태 전이, CAS 갱신, resolver 권한 선언, 페이지 가시성 재검증, 알림·스케줄 처리의 구현을 읽고 자동 테스트를 실행했다.

도메인 상태 전이는 외부 I/O와 현재 시각을 인자로 분리하고, 결정과 시스템 종료 모두 `approval_request.rev`를 이용한 CAS로 갱신한다. 목록 조회도 알림에서 `filterVisiblePages`를 적용한다. 이 두 경계는 승인 데이터의 정합성과 노출 방지에 적절하다.

다만 현재 상태는 Marketplace 또는 운영 환경에 배포하기에 안전하지 않다. 아래 P0 항목을 먼저 제거하거나 운영 기능 수준으로 보호해야 한다.

## 조치가 필요한 발견 사항

### P0 — 진단용 `spike` 모듈과 공개 resolver가 배포 경로에 남아 있다

근거:

- `manifest.yml`에 `approval-spike` global page와 `spike.html` resource entry가 등록되어 있다.
- `src/index.js`가 `registerSpikeController`를 등록한다.
- `src/permission/PermissionMap.js`의 `spike*` resolver는 모두 `PUBLIC`이다.
- `spikeCreateRegionPage`, `spikeProbeBulkPages`, `spikeEchoContext` 등은 진단·검증을 위해 만들어졌으며, 코드 주석도 검증 뒤 삭제하도록 명시한다.

영향:

- 로그인한 일반 사용자가 진단 기능을 호출할 수 있다. 특히 페이지 생성 경로와 resolver context 반환은 운영 기능으로 제공하면 안 된다.
- 진단 코드가 권한·데이터 노출의 별도 공격 표면이 되고, 유지보수 시 실제 기능과 구분하기도 어렵다.

권장 조치:

1. `src/resolver/spike/`, `static/ui/src/entries/spike.jsx`, `static/ui/public/spike.html`을 제거한다.
2. `src/index.js`, `PermissionMap.js`, `manifest.yml`, `static/ui/craco.config.js`에서 연계 등록을 함께 제거한다.
3. 제거 뒤 `rg -n "spike|approval-spike|Spike" manifest.yml src static/ui/src` 결과가 비어 있는지 확인하고 `forge lint`를 실행한다.

삭제가 당장 불가능하다면 최소한 Confluence 관리자 전용으로 바꾸고, 페이지 생성과 context echo resolver는 배포에서 제외한다. 그러나 진단 모듈은 권한을 강화해도 제품 기능이 아니므로 삭제가 기준이다.

### P1 — 고객/운영 문서에 출시 전 진단 모듈 제거 확인이 없다

고객 가이드는 설치·사용·운영 절차를 잘 다루지만, 관리자가 배포 산출물에 진단 화면이 없는지 확인할 수 있는 릴리스 체크가 없다. 위 P0의 재발을 막으려면 배포 담당자가 확인할 항목을 운영 문서에 포함해야 한다.

권장 체크:

- `approval-spike` 페이지와 `spike` resource가 manifest에 없는지 확인한다.
- `PermissionMap`에서 제품 기능 이외에 `PUBLIC` resolver가 없는지 확인한다.
- scope·모듈 변경 시 `forge install --upgrade`를 수행한다.

## 구현상 확인한 운영 동작

다음 동작은 사용자 가이드·장애 대응 시의 기준으로 사용한다.

| 영역 | 현재 동작 | 운영상 의미 |
| --- | --- | --- |
| 페이지 수정 | 페이지 전체 결재는 수정만으로 종료되지 않고 최신 버전으로 재요청할 때 이전 요청이 대체된다. 결재 영역은 macro가 제거되면 시스템 취소된다. | 문서 수정만으로 요청이 사라졌다고 안내하면 안 된다. |
| 결재·취소 | 승인·반려·취소는 `PENDING` 상태와 revision을 함께 조건으로 갱신한다. | 동시 결정은 마지막 요청이 덮어쓰지 않으며, 사용자에게 새 상태를 다시 조회하도록 안내할 수 있다. |
| 기한/리마인더 | 5분 sweep이 기한 만료, 기한 임박, 미처리 리마인더를 처리하며 lease로 중복 실행을 막는다. | 알림은 즉시가 아닐 수 있다. sweep 실패는 로그와 다음 실행 주기를 확인한다. |
| 알림 | 앱 내 알림은 생성 뒤 수신자의 페이지 보기 권한을 다시 확인한다. 댓글 알림은 정책에서 별도로 켠 경우에만 생성한다. | 페이지 권한을 잃은 사용자가 과거 알림을 통해 제목·상태를 보지 않도록 한다. |
| 라이선스 | 라이선스는 상태 정합성 작업을 멈추지 않고 사용자 알림 생성만 게이트한다. | 라이선스 문제로 만료·취소 처리 자체가 멈추지는 않는다. |

## 검증 결과

2026-09-01에 다음 자동 테스트를 실행했다.

```text
npm.cmd test -- --runInBand
# 24 suites, 171 tests passed

npm.cmd run test:ui -- --runInBand
# 6 suites, 13 tests passed
```

UI production build는 실행하지 않았다. `forge lint`는 실행을 시도했지만 Forge CLI가 로그인되어 있지 않고 현재 실행 환경의 Atlassian 네트워크 연결이 차단되어 완료하지 못했다. P0 정리로 manifest와 UI entry가 변경된 뒤에는 Forge 인증이 가능한 환경에서 프로젝트 검증 순서에 따라 backend test, UI test, UI build, `forge lint`를 모두 다시 실행한다.
