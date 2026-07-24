# My Smart Home

Smart eLife를 더 편하게 사용하기 위해 만드는 개인용 스마트홈 프로젝트입니다.

기존 `homebridge-daelim-smarthome`의 검증된 Smart eLife 통신 로직을 기반으로,
브라우저 대시보드와 Apple Watch 단축어에서 조명과 엘리베이터를 제어할 수 있도록
확장하고 있습니다.

> 이 프로젝트는 개인 사용을 목적으로 하며 DL E&C 또는 Smart eLife의 공식
> 프로젝트가 아닙니다.

## 지금 할 수 있는 것

- Smart eLife 이메일·비밀번호 로그인
- ENV를 사용한 서버 자동 로그인
- 세대 기기 및 현재 상태 조회
- 조명 켜기·끄기
- 엘리베이터 호출
- Apple Watch 및 iPhone 단축어용 엘리베이터 API
- 모바일 대응 Next.js 대시보드
- 기기 이름 매핑, 설정, 로그 및 상태 확인
- 기존 Homebridge Smart eLife 기능 유지

LG ThinQ 연동과 추가 자동화는 Smart eLife 기능이 안정화된 후 별도 Provider로
추가할 예정입니다.

## 구성

```text
Browser / Apple Watch Shortcut
              │
       Next.js Dashboard
              │
           REST API
              │
   Existing Smart eLife Client
              │
          Smart eLife
```

Smart eLife 인증과 기기 통신을 새로 구현하지 않고 기존 클라이언트를 그대로
사용합니다. 웹 대시보드는 기존 기능을 호출하기 위한 가벼운 인터페이스입니다.

## 로컬 실행

Node.js 20.19 이상이 필요합니다.

저장소를 받은 뒤 의존성을 설치합니다.

```powershell
npm install
npm --prefix frontend install
```

`frontend/.env` 파일을 만들고 Smart eLife 계정을 입력합니다.

```dotenv
SMART_ELIFE_EMAIL=your-email@example.com
SMART_ELIFE_PASSWORD=your-password
```

`SMART_ELIFE_EMAIL`은 사용자 이름이 아니라 Smart eLife 앱에서 사용하는 이메일
주소입니다.

필요한 경우 아래 값을 추가할 수 있습니다.

```dotenv
SMART_ELIFE_UUID=authorized-device-uuid
```

UUID를 생략하면 이메일을 바탕으로 동일한 값이 자동 생성됩니다. 월패드 인증을
마친 뒤에는 UUID를 변경하지 않는 것이 좋습니다.

개발 서버를 실행합니다.

```powershell
npm run dashboard:dev
```

브라우저에서 `http://localhost:3000`을 열면 됩니다.

## 검사 및 프로덕션 실행

백엔드 빌드, TypeScript, ESLint, Next.js 빌드를 한 번에 검사합니다.

```powershell
npm run check:all
```

로컬 프로덕션 모드로 실행하려면:

```powershell
npm run build:all
npm run dashboard:start
```

개발 서버는 `.next-dev`, 프로덕션 빌드는 `.next`를 사용하므로 동시에 빌드해도
캐시가 충돌하지 않습니다.

## Vercel 배포

1. 이 GitHub 저장소를 Vercel에서 Import합니다.
2. Root Directory를 `frontend`로 지정합니다.
3. **Include source files outside of the Root Directory**를 활성화합니다.
4. 리전은 `icn1`을 사용합니다.
5. Production Environment Variables에 다음 값을 등록합니다.

```text
SMART_ELIFE_EMAIL
SMART_ELIFE_PASSWORD
```

`SMART_ELIFE_UUID`는 선택 사항입니다. 환경변수를 변경한 경우 새 배포를 해야
적용됩니다.

Vercel Function은 사용하지 않을 때 종료될 수 있습니다. 이 프로젝트는 새
인스턴스가 시작되면 ENV 계정으로 자동 로그인하지만, 오랫동안 사용하지 않은 뒤
첫 호출은 평소보다 느릴 수 있습니다.

## Apple Watch 단축어

단축어 앱에서 **URL 콘텐츠 가져오기** 동작을 추가합니다.

```text
URL: https://your-project.vercel.app/api/shortcut/elevator
Method: POST
```

응답 예시:

```json
{
  "ok": true,
  "action": "elevator",
  "message": "Elevator call sent."
}
```

이 단축어를 Apple Watch에 표시하도록 설정하면 손목에서 바로 엘리베이터를
호출할 수 있습니다.

## API

| Method | Endpoint | 기능 |
| --- | --- | --- |
| `GET` | `/api/health` | ENV, 로그인 및 기기 상태 확인 |
| `GET` | `/api/devices` | Smart eLife 기기 조회 |
| `POST` | `/api/elevator` | 대시보드 엘리베이터 호출 |
| `POST` | `/api/shortcut/elevator` | Apple 단축어 엘리베이터 호출 |
| `POST` | `/api/light` | 조명 제어 |
| `GET` | `/api/logs` | 서버 로그 확인 |
| `GET` | `/api/settings` | 현재 설정 확인 |

현재 단축어 API에는 별도의 접근 토큰이 없습니다. 개인용이라도 배포 URL을 공개
저장소, 게시글 또는 스크린샷에 노출하지 않는 것을 권장합니다.

## 프로젝트 방향

우선순위는 다음과 같습니다.

1. Smart eLife 로그인 안정화
2. 엘리베이터 호출
3. 조명 제어
4. 웹 대시보드
5. LG ThinQ 연동
6. 추가 자동화

복잡한 SaaS 구조, 다중 사용자, 조직 및 권한 시스템은 만들지 않습니다. 한 사람이
직접 사용하기 좋은 단순하고 읽기 쉬운 구조를 지향합니다.

## 기반 프로젝트

이 저장소는
[OrigamiDream/homebridge-daelim-smarthome](https://github.com/OrigamiDream/homebridge-daelim-smarthome)
프로젝트의 fork를 기반으로 합니다. Smart eLife 및 Homebridge 구현을 공개해 준
원작자와 기여자들에게 감사드립니다.

원본 프로젝트와 동일하게 GPL-3.0 라이선스를 따릅니다.
