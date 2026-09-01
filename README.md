# 농작업 대행 배차 최적화

필지 주소 등록(엑셀/지도)과 경로 최적화 알고리즘(VRP/2-opt)으로 농작업 대행 방문 순서를 자동 산출하는 웹 서비스입니다. Next.js + VWorld(지도/지오코딩/지적도) + Kakao Mobility(실주행 경로)로 구성되어 있으며 Vercel 배포를 전제로 합니다.

**데이터는 서버 DB에 저장되지 않습니다.** 사무실/차량/작업유형/필지/배차 결과는 모두 브라우저의 `localStorage`에만 저장됩니다(`src/lib/store.ts`, Zustand). 같은 브라우저에서는 새로고침해도 유지되지만, 다른 기기·브라우저와는 공유되지 않고 브라우저 저장소를 지우면 사라집니다. "AI 배차" 최적화 계산도 서버 호출 없이 브라우저에서 바로 실행됩니다(경로 시간 조회만 서버 API를 거칩니다).

## 시작하기 전 준비할 것 (필수)

**1. VWorld API 키** ([vworld.kr](https://www.vworld.kr) 개발자센터에서 발급)
- 지오코딩/지적도 조회용 서버 키 → `VWORLD_API_KEY`
- 지도 타일용 브라우저 키 → `NEXT_PUBLIC_VWORLD_API_KEY`
- VWorld는 키마다 도메인을 화이트리스트로 등록해야 동작하고, 데이터 API는 요청의 Referer 헤더로도 도메인을 검증합니다 → `VWORLD_REFERER`를 등록한 도메인과 일치시키세요(로컬은 기본값 `http://localhost` 그대로 두면 됨).
- 지도는 VWorld의 자체 JS SDK 대신 표준 OpenLayers(`ol`)로 렌더링하고, VWorld는 래스터 타일 이미지 서버(`/req/wmts/...`)로만 사용합니다.

**2. Kakao Mobility REST API 키** ([developers.kakaomobility.com](https://developers.kakaomobility.com), 카카오 디벨로퍼스 앱도 필요)
- 필지 간 실제 도로 주행 시간/거리 계산에 사용 → `KAKAO_MOBILITY_API_KEY`
- 이 키가 없거나 특정 구간의 경로를 못 찾으면 직선거리 기반 추정으로 자동 대체됩니다(하드 실패 없음).
- 무료 티어의 길찾기 API는 지점 쌍(pair)마다 개별 호출이라, 필지가 많으면(현재 배차당 최대 39개) 계산에 다소 시간이 걸릴 수 있습니다.

## 로컬 개발

```bash
cp .env.example .env   # 위 API 키들 채우기
npm install
npm run dev
```

`npm run test` 로 배차 최적화 엔진 단위 테스트를 실행할 수 있습니다 (외부 서비스 없이 동작).

## 사용 흐름

1. `/offices` — 대행 사무실 등록 (주소 검색 또는 지도 핀 선택)
2. 사무실 상세에서 차량/작업자 등록 → 배차 작업(Job) 생성
3. `/jobs/[id]/parcels` — 필지 등록 (엑셀 업로드 또는 지도에서 선택)
4. `/jobs/[id]/dispatch` — "AI 배차 실행" (카카오모빌리티 실주행 경로로 이동시간 조회 후, 브라우저에서 경로 최적화 알고리즘 실행)
5. `/jobs/[id]/results` — 차량별 경로 지도 + 상세 일정
6. `/admin/work-types` — 작업유형별 처리 속도(변수) 조정 (브라우저에 저장)

서버에 남는 API는 전부 아무것도 저장하지 않는 단순 프록시입니다: `/api/offices/geocode`, `/api/parcels/cadastral`, `/api/parcels/excel-import`(VWorld), `/api/travel-matrix`(카카오모빌리티 실주행 경로 일괄 조회).

## 배포 (Vercel)

1. GitHub 저장소로 push
2. Vercel에서 import, 위 API 키 4개(`VWORLD_API_KEY`, `NEXT_PUBLIC_VWORLD_API_KEY`, `VWORLD_REFERER`, `KAKAO_MOBILITY_API_KEY`) 등록 — `VWORLD_REFERER`는 배포 도메인으로 변경
3. 별도 DB 설정 없이 바로 배포 가능
