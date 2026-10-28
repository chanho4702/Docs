# CLAUDE.md — moveseye-be

## Project Overview

Zabbix 서버로부터 수집된 데이터를 시각화하는 모니터링 UI/UX 대시보드의 백엔드 API 서버.
Zabbix 서버와 JSON-RPC API 연동을 통해 데이터를 주고받고, moveseye-fe 서버에 데이터를 제공한다.

**현재 구현된 핵심 기능**
- Zabbix 기반 서버/네트워크 모니터링
- 이벤트·알림 관리
- 클라우드 인프라(AWS EC2/VPC) 모니터링
- 사용자·역할 관리

**향후 추가 예정**
- 자산 관리 (`/asset`) — Asset Host (`/asset/hosts`) 구현 중
- 맵뷰, 커스텀 대시보드, GPU 관리

---

## Role

TypeScript, Node.js, NestJS 생태계에 정통한 시니어 백엔드 소프트웨어 엔지니어로서 동작한다.
- 유지보수 용이성과 확장성을 최우선으로 설계한다.
- 엣지 케이스(null 데이터, 권한 없음, 토큰 만료 등)를 항상 고려한 견고한 코드를 작성한다.
- 기존 서비스·가드·인터셉터·데코레이터를 먼저 재사용하고, 중복 구현을 금지한다.
- 코드 제공 전에 아키텍처/패턴 선택 이유를 핵심 위주로 간략히 설명한다.
- 불필요한 인사말·서론 없이 바로 본론과 코드로 진행한다.

---

## Tech Stack

| 구분 | 기술 |
|---|---|
| **Framework** | NestJS 10.3.3 (Express 기반) |
| **Language** | TypeScript 5.3.3 |
| **Database** | PostgreSQL 8.11.3 + TypeORM 0.3.20 |
| **Caching** | Redis (`@liaoliaots/nestjs-redis`, `cache-manager-redis-yet`) |
| **Authentication** | JWT (`@nestjs/jwt` ^10.2.0, `passport-jwt` ^4.0.1) |
| **Authorization** | Role-based (Guards + `@Roles()` decorator) |
| **Background Jobs** | Bull ^4.12.2 + `@nestjs/bull` ^10.1.0 (Redis 기반) |
| **Message Queue** | amqplib ^0.10.3 + amqp-connection-manager |
| **Real-time** | Socket.IO ^4.7.4 + `@socket.io/redis-adapter` |
| **Email** | `@nestjs-modules/mailer` ^2.0.2 + Nodemailer ^6.9.11 |
| **Scheduling** | `@nestjs/schedule` ^4.0.1 |
| **Validation** | class-validator ^0.14.1 + class-transformer ^0.5.1 |
| **API Docs** | `@nestjs/swagger` ^7.3.0 (Bearer auth 지원) |
| **Logging** | Winston ^3.12.0 + `winston-daily-rotate-file` + `nest-winston` |
| **i18n** | `nestjs-i18n` ^10.4.5 |
| **Config** | dotenv ^16.4.5 + `@hapi/joi` ^17.1.1 (env 검증) |
| **AWS** | `@aws-sdk/client-ec2` ^3.787.0, `@aws-sdk/client-cloudwatch` ^3.828.0 |
| **Monitoring** | Zabbix JSON-RPC API (axios ^1.6.7 기반 HTTP 통신) |
| **Notifications** | Novu ^2.0.1, Firebase Admin ^12.0.0, Twilio ^4.23.0 |
| **External Auth** | Google (`google-auth-library`), Apple (`apple-signin`), Azure (`@azure/msal-node`) |
| **Process Manager** | PM2 ^5.4.1 |
| **Testing** | Jest 29.7.0 + ts-jest 29.1.2 + Supertest ^6.3.4 + `@nestjs/testing` |
| **Code Quality** | ESLint 8 + Prettier 3 + Husky ^9 + commitlint |

**Path Alias**: `@/*` → `src/*`

---

## Directory Structure

```
src/
├── app.module.ts                   # 루트 모듈 (전체 모듈 임포트)
├── app.controller.ts               # 헬스체크 엔드포인트
├── app.service.ts                  # 헬스체크 서비스
├── main.ts                         # 부트스트랩 (Swagger, 마이그레이션, 인터셉터 등록)
├── response.interceptor.ts         # 전역 응답 인터셉터 (Redis syncTime 주입)
├── transform.interceptor.ts        # 전역 변환 인터셉터 (class-transformer 직렬화)
│
├── common/                         # @Global() 공유 인프라
│   ├── classes/
│   │   ├── api-result.ts           # 표준 API 응답 래퍼 ApiResult<T>
│   │   ├── api-error.ts            # 커스텀 에러 클래스 (HttpException 확장)
│   │   ├── pagination.dto.ts       # 페이지네이션 DTO (BasePageDto, PaginationResponseDto<T>)
│   │   ├── search-filter.base.dto.ts
│   │   └── date-filter.dto.ts
│   ├── constants/
│   │   ├── constants.ts            # Redis 키, OTP 설정, 이메일 템플릿 플레이스홀더 등
│   │   ├── errors.ts               # ErrorCode enum (85+ 에러 코드)
│   │   └── zabbix-item-key.ts      # Zabbix 메트릭 키 매핑
│   ├── decorators/                 # @Roles(), @Header(), @EmailValidator()
│   ├── exceptions.filter.ts        # 전역 HTTP 예외 필터 (ApiResult 포맷으로 표준화)
│   ├── functions/                  # 유틸리티 함수
│   ├── services/
│   │   ├── config.service.ts       # 환경변수 관리 (Joi 검증, 그룹별 getter)
│   │   ├── common.service.ts       # 공통 유틸 서비스
│   │   ├── redis.service.ts        # Redis 클라이언트 래퍼 (get/set/del/hset/hget)
│   │   ├── encrypt.service.ts      # 암호화/복호화 서비스
│   │   └── logger.service.ts       # Winston 로거 서비스
│   ├── typeorm/                    # DB 공통 유틸
│   └── utils.ts                    # 순수 유틸 함수 (byte변환, 집계, severity매핑 등)
│
├── database/                       # TypeORM 설정 및 엔티티
│   ├── database.module.ts          # TypeOrmModule.forRootAsync() (named: 'DB_DMOVE')
│   ├── models/                     # 15개 TypeORM 엔티티
│   │   ├── user.entity.ts          # UserRole, UserStatus, UserPlatform enum 포함
│   │   ├── role.entity.ts
│   │   ├── permission-schema.entity.ts
│   │   ├── user-group.entity.ts
│   │   ├── host-group.entity.ts
│   │   ├── event-problem.entity.ts
│   │   ├── notification.entity.ts
│   │   ├── setting.entity.ts
│   │   └── ...
│   └── migrations/                 # TypeORM 마이그레이션 (timestamp 기반)
│
├── auth/                           # @Global() JWT 인증/인가
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   ├── jwt.strategy.ts             # PassportStrategy (Redis 토큰 검증, 분산 락)
│   ├── guards/
│   │   ├── jwt-auth.guard.ts       # JWT 검증 + x-visitor-id 헤더 확인
│   │   ├── jwt-public-auth.guard.ts
│   │   ├── roles.guard.ts          # RBAC 가드 (SUPER_ADMIN 우회)
│   │   └── microservice.guard.ts
│   ├── decorators/
│   │   └── user.decorator.ts       # @CurrentUser() 파라미터 데코레이터
│   ├── dtos/
│   │   ├── token-user-info.dto.ts  # TokenUserInfo 인터페이스
│   │   └── requests/
│   └── services/
│       └── auth.service.ts
│
├── user/                           # @Global() 사용자·그룹 관리
│   ├── user.controller.ts
│   ├── user.module.ts
│   ├── user.schedule.ts            # @nestjs/schedule 크론 작업
│   ├── services/
│   │   ├── user.service.ts
│   │   ├── otp.service.ts
│   │   ├── user-group.service.ts
│   │   └── host-group.service.ts
│   └── dtos/
│
├── admin/                          # @Global() 관리자 기능
│   ├── user/                       # 관리자 사용자 관리
│   └── role/                       # 역할 관리
│
├── host/                           # @Global() 호스트 모니터링
│   ├── host.controller.ts
│   ├── host.service.ts             # 호스트 집계 서비스 (대형)
│   ├── cpu/                        # CPU 메트릭
│   ├── memory/                     # 메모리 메트릭
│   ├── disk/                       # 디스크 메트릭
│   ├── network/                    # 네트워크 메트릭
│   ├── interface/                  # 네트워크 인터페이스
│   ├── response-time/              # 응답 시간
│   └── event/                      # 호스트 이벤트
│
├── event/                          # 이벤트·알림 관리
│   ├── event.controller.ts
│   ├── event.service.ts
│   └── event-sync-service.ts       # Zabbix 이벤트 동기화
│
├── zabbix/                         # @Global() Zabbix API 통합
│   ├── zabbix.module.ts            # 13개 서비스 export
│   ├── zabbix.types.ts             # JSON-RPC 요청/응답 타입
│   └── services/
│       ├── zabbix.service.ts       # 기본 Zabbix API 클라이언트 (JSON-RPC 2.0)
│       ├── zabbix-user.service.ts  # 사용자 인증 및 토큰 관리
│       ├── zabbix-host.service.ts
│       ├── zabbix-item.service.ts
│       ├── zabbix-history.service.ts
│       ├── zabbix-trend.service.ts
│       ├── zabbix-event.service.ts
│       ├── zabbix-problem.service.ts
│       ├── zabbix-trigger.service.ts
│       └── zabbix-token.service.ts
│
├── zabbix-sync/                    # Zabbix 사용자/그룹/호스트 동기화
│   └── services/zabbix-sync.service.ts
│
├── aws/                            # AWS CloudWatch & EC2 통합
│   ├── aws.controller.ts
│   ├── aws.service.ts
│   └── dtos/
│
├── setting/                        # 앱 설정 관리
├── email/                          # Bull 큐 기반 이메일 처리
│   ├── email.processor.ts          # @nestjs/bull 큐 프로세서
│   └── email.listener.ts           # 이벤트 리스너
│
└── i18n/                           # 국제화 (nestjs-i18n)
    └── en/                         # 영어 번역 파일

test/
├── app.e2e-spec.ts                 # E2E 테스트 (supertest)
└── jest-e2e.json                   # E2E Jest 설정
```

---

## Architecture & Coding Rules

### 1. 응답 포맷

모든 API 응답은 `src/common/classes/api-result.ts`의 `ApiResult<T>` 래퍼를 사용한다.

```typescript
// 성공 응답
return ApiResult.success(data, '메시지');

// 에러 응답
throw new ApiError(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND);
```

- 예외 필터(`exceptions.filter.ts`)가 전역에서 `HttpException`을 잡아 `ApiResult` 포맷으로 표준화한다.
- 대부분의 에러는 HTTP 200으로 반환하며, `Unauthorized`/`Forbidden`만 실제 상태 코드를 반환한다.
- `ErrorCode` enum(`src/common/constants/errors.ts`)의 코드를 사용한다. 새 에러 코드는 반드시 여기에 추가한다.

### 2. 모듈 구조 패턴

```
module-name/
├── module-name.module.ts       # DI 설정
├── module-name.controller.ts   # HTTP 라우트 (@ApiTags, @UseGuards 포함)
├── module-name.service.ts      # 비즈니스 로직
├── module-name.schedule.ts     # 선택적: 크론 작업
├── dtos/
│   ├── request/                # @IsNotEmpty 등 class-validator 사용
│   └── response/               # @ApiProperty() 포함 응답 DTO
└── services/                   # 대형 모듈은 서비스 분리
```

- **@Global() 모듈**: `common`, `auth`, `user`, `admin`, `zabbix`, `host` — 이 모듈의 서비스는 `imports` 없이 주입 가능
- **비Global 모듈**: 사용 전 반드시 해당 모듈을 `imports`에 추가

### 3. 컨트롤러 패턴

```typescript
@ApiTags('module-name')
@Controller('api/v1/module-name')
@UseGuards(RolesGuard, JwtAuthGuard)
export class ModuleController {
  constructor(private readonly moduleService: ModuleService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async getList(
    @CurrentUser() user: TokenUserInfo,
    @Query(new ValidationPipe({ transform: true })) query: GetListDto,
  ): Promise<ApiResult<PaginationResponseDto<ItemDto>>> {
    const data = await this.moduleService.getList(user, query);
    return ApiResult.success(data);
  }
}
```

### 4. 서비스 레이어 패턴

```typescript
@Injectable()
export class ModuleService {
  constructor(
    @InjectRepository(MyEntity, 'DB_DMOVE')
    private readonly myRepo: Repository<MyEntity>,
    private readonly zabbixHostService: ZabbixHostService, // @Global() 모듈
    private readonly redisService: RedisService,           // @Global() 모듈
  ) {}
}
```

- DB 레포지토리 주입 시 반드시 named connection `'DB_DMOVE'`를 명시한다.
- Zabbix 데이터는 직접 HTTP 호출이 아닌 `src/zabbix/services/` 서비스를 통해서만 접근한다.

### 5. Zabbix API 통합 패턴

```typescript
// zabbix.service.ts의 제네릭 메서드를 활용
const result = await this.zabbixService.sendRequest<RequestType, ResponseType>(
  'host.get',
  params,
  authToken,
);
```

- Zabbix API는 JSON-RPC 2.0 프로토콜을 사용한다.
- Super Admin 토큰은 Redis에 캐시되며 키는 `ZABBIX::Super_Admin`이다.
- 토큰 갱신 시 경쟁 조건 방지를 위해 Redis 기반 분산 락을 사용한다.

### 6. 인증·인가 패턴

```typescript
// 인증 필요 + 역할 제한
@UseGuards(RolesGuard, JwtAuthGuard)
@Roles(UserRole.ADMIN)

// 인증 선택적 (공개 라우트)
@UseGuards(JwtPublicAuthGuard)

// 현재 사용자 추출
async myEndpoint(@CurrentUser() user: TokenUserInfo) {}
```

- `JwtAuthGuard`는 JWT 검증 외에 `x-visitor-id` 헤더와 Redis 세션을 대조 검증한다.
- `SUPER_ADMIN` 역할은 모든 `@Roles()` 체크를 우회한다.
- `TokenUserInfo` 타입: `src/auth/dtos/token-user-info.dto.ts`

### 7. DTO 작성 규칙

```typescript
// Request DTO
export class CreateItemDto {
  @ApiProperty({ description: '항목 이름' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  limit?: number;
}

// Response DTO
export class ItemResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  constructor(partial: Partial<ItemResponseDto>) {
    Object.assign(this, partial);
  }
}
```

- 요청 DTO: `class-validator` 데코레이터 + `@ApiProperty()` 필수
- 응답 DTO: 생성자에서 외부 데이터(Zabbix 등)를 매핑하는 패턴 사용
- 페이지네이션: `src/common/classes/pagination.dto.ts`의 `BasePageDto` 상속

### 8. 페이지네이션 패턴

```typescript
// Request DTO
export class GetListDto extends BasePageDto {
  @ApiPropertyOptional()
  @IsOptional()
  keyword?: string;
}

// Response
return ApiResult.success(
  new PaginationResponseDto({ items: data, total: count }),
);
```

### 9. 설정 관리

- 환경변수는 `src/common/services/config.service.ts`의 `ConfigService`를 통해서만 접근한다.
- 컴포넌트에서 직접 `process.env`를 참조하지 않는다.
- 새 환경변수 추가 시 `ConfigService`의 Joi 스키마와 getter에 함께 추가한다.

### 10. Redis 캐싱 패턴

```typescript
await this.redisService.set<MyType>('cache-key', data, { EX: 900 });
const cached = await this.redisService.get<MyType>('cache-key');
await this.redisService.del('cache-key');
```

- 캐시 키는 `src/common/constants/constants.ts`에 상수로 정의한다.
- Zabbix 토큰 만료: 15분. Redis 세션 키: `USER_LOGIN_KEY`, `REDIS_USER_API_TOKEN`

### 11. 데이터베이스 마이그레이션

- 엔티티 변경 시 반드시 마이그레이션 파일을 생성한다. `synchronize: true` 사용 금지.
- 마이그레이션 파일명: `timestamp-DescriptiveName.ts`
- 모든 엔티티는 named connection `'DB_DMOVE'`를 사용한다.

### 12. TypeScript 규칙

- `any` 타입 사용 지양. 불가피한 경우 주석으로 이유 명시.
- 매직 넘버 사용 금지. `src/common/constants/`의 상수 또는 enum 사용.
- 에러 코드는 `ErrorCode` enum(`src/common/constants/errors.ts`) 사용.
- `strictNullChecks: false`, `noImplicitAny: false` (tsconfig.json 기준)

---

## Testing Requirements

### 환경 구성

- **단위 테스트**: `src/**/*.spec.ts` 패턴, Jest 설정은 `package.json` 내 `jest` 섹션
- **E2E 테스트**: `test/**/*.e2e-spec.ts` 패턴, `test/jest-e2e.json` 설정
- 테스트 실행 환경: `testEnvironment: 'node'`

### 단위 테스트 패턴

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MyService } from './my.service';
import { MyEntity } from '@/database/models/my.entity';

describe('MyService', () => {
  let service: MyService;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MyService,
        {
          provide: getRepositoryToken(MyEntity, 'DB_DMOVE'),
          useValue: mockRepository,
        },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<MyService>(MyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return list successfully', async () => {
    mockRepository.find.mockResolvedValue([{ id: 1, name: 'test' }]);
    const result = await service.getList();
    expect(result).toHaveLength(1);
  });

  it('should handle empty result', async () => {
    mockRepository.find.mockResolvedValue([]);
    const result = await service.getList();
    expect(result).toEqual([]);
  });

  it('should throw ApiError when item not found', async () => {
    mockRepository.findOne.mockResolvedValue(null);
    await expect(service.getById(999)).rejects.toThrow(ApiError);
  });
});
```

### E2E 테스트 패턴

```typescript
import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '@/app.module';

describe('MyController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => await app.close());

  it('GET /api/v1/my-resource returns 200 with SUCCESS status', () => {
    return request(app.getHttpServer())
      .get('/api/v1/my-resource')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('SUCCESS');
      });
  });
});
```

### 필수 Mock 패턴

```typescript
// Repository mock — named connection 'DB_DMOVE' 필수
{ provide: getRepositoryToken(MyEntity, 'DB_DMOVE'), useValue: mockRepo }

// ConfigService mock
{ provide: ConfigService, useValue: { port: 3000, zabbixConfig: { apiUrl: '' } } }

// Zabbix 서비스 mock
{ provide: ZabbixHostService, useValue: { getHosts: jest.fn() } }
```

### 테스트 작성 기준

- 핵심 비즈니스 로직(데이터 집계, Zabbix 연동, 권한 처리) 구현 시 **반드시 테스트 코드를 함께 제공**한다.
- 예외·에러 처리(빈 데이터, 토큰 만료, API 실패)를 검증하는 케이스를 **필수 포함**한다.
- 테스트 구조 예시:
  ```typescript
  describe('MyService', () => {
    it('returns list data correctly', () => { /* happy path */ });
    it('handles empty Zabbix response gracefully', () => { /* edge case */ });
    it('throws ApiError when entity not found', () => { /* error case */ });
    it('uses Redis cache on second call', () => { /* caching behavior */ });
  });
  ```

---

## Commands

```bash
npm run start:dev      # 개발 서버 시작 (watch 모드, http://localhost:3000)
npm run start:prod     # 프로덕션 시작 (node dist/main)
npm run start:pm2      # PM2 프로세스 매니저로 시작
npm run build          # 프로덕션 빌드 (NestJS CLI)
npm run lint           # ESLint 검사
npm run lint:fix       # ESLint 자동 수정
npm run format         # Prettier 포맷 적용
npm test               # Jest 단위 테스트 실행
npm run test:watch     # Jest watch 모드
npm run test:cov       # 커버리지 리포트 생성
npm run test:e2e       # E2E 테스트 실행
npm run migration:create -- --name=Name  # TypeORM 마이그레이션 생성
npm run migration:revert                 # 마지막 마이그레이션 롤백
```
