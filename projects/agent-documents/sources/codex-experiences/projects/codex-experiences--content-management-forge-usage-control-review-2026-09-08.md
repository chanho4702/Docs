# 콘텐츠 관리 앱의 Automation·Rovo 사용량 제어 요구사항 및 Forge 구현 타당성 검토

- 작성일·공식 문서 확인일: 2026-09-08
- 대상: Atlassian Cloud의 Forge 기반 콘텐츠 관리 앱
- 검토 수준: 공식 문서 기반 사전 검토. 실제 앱 코드 분석 및 테스트 테넌트에서의 API 호출 검증은 수행하지 않음.
- 상태: MVP 범위 제안. 조직 전체 과금 제어는 공식 API 지원 확인 필요.

## 1. 검토 결론

**Forge 앱에서 자체 워크플로우·AI 작업을 제한하는 기능은 구현할 수 있다. 다만 Atlassian 관리자 페이지에 가지 않고 조직 전체의 추가 과금을 OFF하는 기능은 현재 확인한 공식 API로 구현 가능하다고 확정할 수 없다.**

Atlassian Automation 규칙을 활성화·비활성화하는 공식 API는 존재하지만, Forge·OAuth2 앱의 접근이 명시적으로 제한된다. Rovo·Automation의 조직 전체 추가 사용 설정 및 사용 한도 변경에 대해서는 지원되는 공개 API를 확인하지 못했다.

제품화는 자체 작업의 실행 제한, 공간·프로젝트별 운영 정책, 사용 현황 및 변경 이력을 MVP로 추진하는 것이 타당하다. 조직 전체 과금 OFF 기능을 판매 문구로 약속하는 것은 보류한다.

> ‘공개 API 미확인’은 기술적으로 영구 불가능하다는 의미가 아니다. 현재 조사한 공식 문서에서 제품 기능으로 약속할 수 있는 지원 API와 인증 근거를 확인하지 못했다는 의미다.

## 2. 배경 및 목적

고객이 콘텐츠 관리 앱에서 워크플로우와 Rovo 사용을 제어하여 예상하지 못한 비용 증가에 대응하도록 한다. 관리자 페이지 이동을 줄이고, 콘텐츠 관리 업무 단위의 운영 정책을 제공하는 것이 목적이다.

다음 세 가지 ‘워크플로우’는 구분한다.

| 구분 | 의미 | 검토 범위 |
|---|---|---|
| Atlassian Automation | Jira·Confluence 등의 자동화 흐름 | Automation steps 과금 및 공식 규칙 관리 API |
| Jira 상태 전환 워크플로우 | 이슈의 상태·전환·조건 등 | Automation과 동일한 것으로 취급하지 않음 |
| 우리 앱의 자체 워크플로우 | 콘텐츠 관리 앱이 직접 실행하는 업무 로직 | 앱 서버에서 실행 여부와 자체 한도를 제어 |

Rovo credits와 Rovo Dev credits도 별도 미터다. 본 검토의 AI 제어 대상은 Rovo이며, Rovo Dev는 포함하지 않는다. [공식 Rovo Dev 과금 문서](https://support.atlassian.com/subscriptions-and-billing/docs/how-billing-works-for-rovo-dev-standard)

## 3. 공식 과금 정책 확인

### 3.1 적용 시점과 기본 정책

Rovo credits와 Automation steps의 새 한도·과금 적용일은 **2026년 12월 3일**로 발표되어 있다. [공식 발표](https://www.atlassian.com/blog/company-news/expanded-usage-based-pricing)

Rovo 문서에는 추가 사용이 기본 활성화되며, 조직·청구 관리자에게 기본 제공량의 80% 및 100% 도달 알림을 제공한다고 설명되어 있다. [Rovo 사용량 정책](https://support.atlassian.com/rovo/docs/rovo-usage-limits/)

| 설정 | 의미 |
|---|---|
| 추가 사용 활성화 | 제공량을 초과한 사용을 허용하고 초과분을 청구 |
| 추가 사용 비활성화 | 제공량 소진 후 해당 미터의 추가 사용을 제한 |
| 추가 사용 한도 설정 | 설정한 추가 사용 한도에 도달하면 관련 기능이 제한될 수 있음 |

추가 사용 OFF는 AI 기능 전체를 즉시 끄는 설정과 다르다. OFF 이전에 발생한 초과 사용료는 다음 청구서에 반영된다. 설정 변경은 조직 관리자 또는 청구 관리자가 Atlassian Administration에서 수행한다. [미터별 추가 사용 관리](https://support.atlassian.com/subscriptions-and-billing/docs/manage-extra-usage-for-a-meter/)

### 3.2 Automation 중단 시 업무 영향

Automation은 전체 흐름의 성공 실행 횟수에서 개별 단계 실행 기준으로 변경된다. 트리거·조건·액션·분기·반복 등이 단계에 포함되며, 흐름 내 Rovo 기반 단계는 별도의 Rovo credits를 소비한다.

제공량 소진 및 추가 사용 비활성화로 중단되면 신규 자동화 실행이 멈추지만, 실행 중인 흐름은 완료된다. **중단 중 발생한 이벤트는 저장되거나 사용량 리셋 후 재실행되지 않는다.** 기존 작업 항목과 설정은 유지된다. 따라서 고객 안내에 데이터 보존뿐 아니라 자동화 업무 누락 가능성도 설명해야 한다. [Automation 공식 FAQ](https://www.atlassian.com/licensing/automation)

### 3.3 고객 대응 안내의 표현 범위

- 상위 플랜·Collection 전환, 사용량 팩 구매, 종량 과금과 한도 병행은 고객의 실제 사용 패턴에 맞춰 검토한다.
- Teamwork Collection의 Rovo 제공량은 같은 등급의 단일 Jira·Confluence 앱 대비 최대 10배로 안내되어 있다. 이를 모든 미터에 일반화하지 않는다. [Rovo 공식 FAQ](https://www.atlassian.com/licensing/rovo)
- ‘대부분 고객은 기본 제공량으로 충분하다’는 표현은 고객 사용 데이터 없이 보장하지 않는다.
- 기능 전체 비활성화, 초과 사용만 차단, 자체 앱 실행 중단을 서로 다른 설정으로 설명한다.

## 4. Forge 구현 타당성

| 요구 기능 | 판단 | 제약 및 근거 |
|---|---|---|
| 자체 워크플로우 ON/OFF | 가능 | 앱 설정을 저장하고 서버의 실행 로직에서 검증 |
| 앱에서 시작하는 AI 요청 ON/OFF | 조건부 가능 | AI 요청을 보내기 전에 앱이 실행 여부를 결정할 수 있어야 함 |
| 자체 실행 횟수 제한·알림 | 가능 | 앱 자체 집계이며 조직 전체 청구 사용량과 구분 필요 |
| Atlassian Automation 규칙 ON/OFF | Forge 기본 인증으로 불가 | 공식 API에 Forge·OAuth2 접근 제한 명시 |
| 조직 전체 추가 사용 OFF·한도 변경 | 지원 공개 API 미확인 | 공식 문서는 Administration에서의 변경 절차 안내 |
| 조직 전체 실제 사용량·과금 설정 자동 조회 | 지원 공개 API 미확인 | Platform usage 화면 및 Rovo CSV 내보내기는 제공 |
| Jira·Confluence의 Rovo 기능 전체 비활성화 | Forge 제어 API 미확인 | 조직 관리자가 Rovo access에서 설정 |

Forge 설정 화면과 저장소 구성은 [Confluence global settings](https://developer.atlassian.com/platform/forge/manifest-reference/modules/confluence-global-settings/)로 지원된다. 조직 단위 조회와 설정은 [Platform usage](https://support.atlassian.com/organization-administration/docs/what-is-platform-usage/), [Rovo access 관리](https://support.atlassian.com/organization-administration/docs/manage-rovo-access/), [Organizations REST API](https://developer.atlassian.com/cloud/admin/organization/rest/intro/) 및 미터별 추가 사용 문서를 확인했다. 앱 자체 실행 제어 가능성은 이러한 Forge 기능을 활용한 설계 판단이다.

### 4.1 Automation 규칙 API 제한

규칙 상태 변경 엔드포인트:

```text
PUT /rest/v1/rule/{ruleUuid}/state
```

공식 문서에 다음 제한이 명시되어 있다.

> Forge and OAuth2 apps cannot access this REST resource.

따라서 관리자 사용자의 `asUser()` 호출이나 OAuth scope 추가만으로 해결되지 않는다. [Automation Rule management API](https://developer.atlassian.com/cloud/automation/rest/api-group-rule-management/)

Automation 인증 문서에는 사용자 API token 인증이 있지만, Marketplace 앱은 Atlassian 사용자 API token을 수집·전송·저장하면 안 된다. 고객에게 관리자 token을 입력받는 방식을 일반 배포용 대안으로 채택하지 않는다. Forge Remote를 추가하는 것만으로 이 인증 제약이 해소되지 않는다. [Automation 인증](https://developer.atlassian.com/cloud/automation/security/authentication/), [Marketplace 보안 정책](https://developer.atlassian.com/platform/marketplace/marketplace-security-enforcement-policy/)

### 4.2 Rovo Action 차단과 AI 과금 차단의 차이

Forge 앱의 Rovo Agent 요청도 고객 조직의 Rovo 크레딧을 사용한다. Agent가 호출하는 Forge Action의 compute·storage·logs는 개발사의 Forge 사용량으로 별도 집계된다. [Forge의 Rovo 과금 설명](https://developer.atlassian.com/platform/forge/forge-platform-pricing/)

따라서 Action 함수에서 ‘사용 중지’를 반환하는 것만으로 이미 시작된 AI 요청의 크레딧 소비까지 막았다고 보장할 수 없다. 사용자가 Rovo에서 Agent를 직접 실행하는 경로와 우리 앱이 AI 요청을 시작하는 경로를 구분해야 한다. 이는 공식 과금 구조와 [Rovo Agent 모듈](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-agent/) 구조에 따른 기술적 추론이다.

우리 앱에서 제어 가능한 경로는 **AI 요청 전 서버 검증**을 적용한다. Action 진입 후 검증은 해당 Action의 업무 실행 제한으로 설명한다.

## 5. 기능 요구사항 제안

아래 요구사항은 Atlassian의 기존 기능 설명이 아니라 우리 앱에 구현할 설계 제안이다.

| ID | 요구사항 | 완료 기준 | 우선순위 |
|---|---|---|---|
| FR-01 | 자체 워크플로우 실행 제어 | 관리자가 앱 전체 또는 대상 공간·프로젝트의 신규 실행을 OFF/ON할 수 있음 | MVP |
| FR-02 | 앱에서 시작하는 AI 요청 제어 | OFF이면 AI 요청 전에 서버에서 차단. 버튼·예약 작업·이벤트·재시도 경로에 공통 적용 | MVP, 호출 구조 확인 후 |
| FR-03 | 앱 자체 사용 한도 | 월별 실행 횟수 등 정확히 집계 가능한 단위로 제한하고, 동시 실행의 중복 한도 소비를 방지 | MVP |
| FR-04 | 사용 현황과 알림 | 자체 사용량·한도·기간·갱신 시각 표시. 자체 한도 80% 알림, 100% 신규 실행 차단 | MVP |
| FR-05 | 설정 권한과 변경 이력 | 서버에서 권한 검증. 변경자·시각·대상·이전 값·변경 값 기록 | MVP |
| FR-06 | 중단·재개 정책 | 실행 중 작업과 대기 작업의 처리 방식을 정의하고, 재개 시 중복 실행 방지 | MVP |
| FR-07 | Atlassian 과금 설정 안내 | 관리 화면으로 이동 제공. 조회하지 못한 과금 상태는 ‘확인 필요’로 표시 | MVP |
| FR-08 | 공식 Rovo CSV 분석 | 업로드된 과거 사용량을 분석하고 기준 시각 표시. 실시간 차단 근거로 사용하지 않음 | 후속 |
| FR-09 | 조직 미터 조회·설정 연동 | 공식 API, 지원 인증, 권한 범위 확인 후 설계 | 보류 |
| FR-10 | 기존 Automation 규칙 제어 | 공식 Forge 지원 또는 Atlassian이 승인한 지원 경로 확인 후 설계 | 보류 |

FR-03의 자체 실행 횟수를 Atlassian `Automation steps` 또는 실제 `Rovo credits`와 동일한 값으로 표시하지 않는다. Rovo 사용량 CSV 제공은 [Platform usage 문서](https://support.atlassian.com/organization-administration/docs/what-is-platform-usage/)에서 확인된다.

## 6. 구현 및 검증 기준

1. **차단 범위 명시:** 설정 화면에 ‘이 앱에서 실행하는 작업에 적용’이라고 표시한다. 조직 전체 과금 설정과 별도 항목으로 구분한다.
2. **서버 공통 검증:** UI에서 버튼을 숨기는 것에 그치지 않고 모든 실행 경로의 서버 진입점에서 설정과 한도를 확인한다.
3. **실행 전 한도 확인:** 한도 확인과 실행 예약을 일관되게 처리하고, 중복 이벤트·재시도의 멱등성을 보장한다.
4. **중단 후 대기 작업 처리:** 이미 대기 중인 작업도 실제 실행 직전에 설정을 다시 확인한다. 재개·폐기 정책은 사용자에게 표시한다.
5. **권한 검증:** 앱 관리자 권한을 조직 청구 관리자 권한과 동일하게 취급하지 않는다. 설정 대상 범위까지 서버에서 확인한다.
6. **집계 기준 명시:** 집계 기간과 리셋 기준을 표시한다. 앱 자체 사용 기간을 Atlassian 청구 주기와 동일하다고 가정하지 않는다.
7. **집계·정책 조회 장애:** 차단이 필요한 작업에서 정책을 확인할 수 없을 때의 처리 방식을 정의한다. 확인 실패를 자동 허용으로 취급하지 않는 방향을 검토한다.
8. **최소 검증 시나리오:** OFF 상태의 수동·예약·이벤트 실행, 한도 직전 동시 요청, 중복 재시도, 대기 작업, 권한 없는 설정 변경, 월 경계, 정책 조회 실패를 확인한다.

실제 개발 착수 전 `manifest.yml`, AI 호출 경로, 이벤트·예약·큐 처리, 저장소 및 관리자 권한 모델을 확인해야 한다. 현재 검토만으로 개발 공수와 완성 시점을 확정하지 않는다.

## 7. Atlassian에 확인할 사항

- Rovo credits·Automation steps의 제공량, 실제 사용량, 리셋 시각, 추가 사용 상태와 한도를 조회하는 지원 공개 API가 있는가?
- 미터별 추가 사용 OFF 및 한도 변경 API가 있는가? Forge 또는 OAuth 인증을 지원하는가?
- Automation Rule management API의 Forge·OAuth2 지원 계획은 무엇인가?
- 조직·사이트·제품 관리자 간 조회·변경 권한을 어떤 방식으로 위임할 수 있는가?
- 사용량 집계 지연, 설정 반영 시점, 실행 중 요청의 과금 처리와 관련한 계약은 무엇인가?

## 8. 제품 포지셔닝 및 고객 안내 문구

Atlassian 자체 기능에도 사용량 알림과 조직 과금 한도가 존재한다. 따라서 차별화 요소는 콘텐츠 관리 업무 단위의 실행 제어, 공간·프로젝트별 운영 정책, 변경 이력이다.

권장 안내 문구:

> 콘텐츠 관리 앱에서 제공하는 자동화와 AI 작업의 실행 여부 및 자체 사용 한도를 관리할 수 있습니다. Atlassian 조직 전체의 추가 과금 설정은 Atlassian Administration에서 별도로 관리합니다.

공식 API 지원 확인 전에는 ‘이 앱 하나로 조직 전체의 Rovo·Automation 초과 과금을 차단한다’는 표현을 사용하지 않는다.

## 9. 검토 기록 및 후속 관리

- 결정 제안: 자체 작업 제어를 MVP로 정의하고 조직 과금 제어는 공식 API 확인 후 확장한다.
- 핵심 교훈: 관리자 UI에서 가능한 기능이 Forge 앱에도 API로 제공되는 것은 아니다. API 존재 여부, Forge 지원 여부, 인증 정책을 각각 확인해야 한다.
- 핵심 교훈: Rovo Action 실행 차단과 AI 요청 자체의 과금 차단은 다른 문제다.
- 문서 갱신 조건: Atlassian API·인증 정책 변경, 실제 테넌트 검증 완료, 앱 호출 구조 확인 시 갱신한다.
- 경험 인덱스: [[projects/agent-documents/sources/codex-experiences/codex-experiences--INDEX|INDEX]]
