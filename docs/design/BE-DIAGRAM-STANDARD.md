# BE Diagram Standard (v1.0)

작성: 2026-05-19 · 사용자 합의: v1.2.40 작업 진입 전

## 0. 배경

v1.2.2/v1.2.3 BE 어댑터 표준화에서 도입된 Tab1/Tab2 BE 전용 렌더러가 실제 대용량 Spring Boot 프로젝트(985 routes / 422 tables)에서 두 가지 한계 노출:

1. **Tab2 단순 X축 나열**: 컨트롤러 30+ 도메인이 한 줄에 펼쳐져 X축 폭발. 패키지 계층·연관관계 미표현.
2. **Tab1 nested subgraph(박스 in 박스)**: 깊은 패키지를 컨테이너 중첩으로 표현하나 트리 직관성 부족.

본 표준은 BE Tab1/Tab2 시각화를 사용자가 제시한 트리 다이어그램 구조로 통일하기 위한 단일 진실 소스다.

## 1. 표현 원칙

1. **레이아웃**: `graph TD` (top-down). 동일 depth = X축으로 나란히, 부모→자식 관계 = Y축으로 아래.
2. **노드 = 실체**: 패키지·컨트롤러·서비스·리포지토리 모두 노드로 표현. subgraph는 의미 있는 컨테이너로 제한적 사용(예: leaf의 DI 체인 묶음, DB ER).
3. **간선 = 관계**: 부모-자식(패키지 계층)·DI 주입은 명시적 edge로. 추정 관계는 dashed edge(`-.->`).

## 2. Tab1 — Rendering Architecture (BE)

### 2.1 구조

```
┌─────────────────────────────────────────────┐
│ 📁 src/main/java/com.<공통 prefix>            │  (헤더 annotation)
│                                              │
│                  wina                        │  (top-level node)
│        ┌──────────┼──────────┐               │
│      partner    agency    headoffice         │  (depth 1, X축)
│        │                                      │
│  ┌─────┴───────┐                              │
│ matMgmt   ordProdPlanMgmt                    │  (depth 2)
│   │                                           │
│ decoSheet                                     │  (depth 3)
│   │                                           │
│ 📄 DecoSheetController [/api/.../decoSheet]   │  (leaf)
│   └─ [endpoint subgraph]                      │
│       GET / · GET /:id · POST /               │
└─────────────────────────────────────────────┘
```

### 2.2 규칙

| 규칙 | 정의 |
|---|---|
| **R-T1.1 패키지 추출** | `src/main/{java,kotlin}/` 자동 감지 후 파일명 제외한 segments 추출. |
| **R-T1.2 공통 prefix strip** | 모든 Controller가 공유하는 LCP(예: `com.wina`) 자동 strip. strip된 경로는 다이어그램 상단 헤더 노드(`📁 src/main/java/com.wina`)로 1회 표시. |
| **R-T1.3 suffix strip** | 마지막 segment가 모두 `controller(s)`(case-insensitive)이면 strip. Spring 패키지 컨벤션 반영. |
| **R-T1.4 트리 노드** | 각 패키지 segment = 사각형 노드(`pkg["wina"]`). 부모-자식은 명시적 edge(`-->`). |
| **R-T1.5 leaf 노드** | Controller 파일 = `📄 ControllerName [/api/prefix]` 노드. URL prefix는 path-segment LCP로 자동 추출. |
| **R-T1.6 endpoints** | Controller leaf 옆/아래에 subgraph(`endpoints_<ControllerName>`)로 묶어 표시. 항목 = `METHOD /suffix` (suffix만, prefix 중복 제거). |
| **R-T1.7 클래스** | leaf Controller = `:::ssr`(녹색, 서버 렌더), 패키지 노드 = `:::pkg`(중립 회색, 신규 클래스 추가). |

### 2.3 X축 폭발 방지

| 규칙 | 정의 |
|---|---|
| **R-T1.8 top-level 청크** | top-level 패키지(R-T1.2 strip 후 첫 depth 노드, 예: `partner`/`agency`/`headoffice`)별로 별도 다이어그램 chunk 분할. viewer row-mode가 chunk별 zoom/pan을 이미 지원. |
| **R-T1.9 elk mrtree(보조)** | `@mermaid-js/layout-elk`가 `mrtree` 알고리즘을 노출하는 경우 적용. 빌드 확인 필수. 미지원 시 기본 dagre + R-T1.8 chunking으로 대체. |

## 3. Tab2 — Screen–Component (BE)

### 3.1 구조

Tab1과 동일한 패키지 트리 위에, leaf를 단순 Controller 노드가 아닌 **`Controller → Service → Repository` 수직 DI 체인 subgraph**로 확장.

```
…  ←  (Tab1과 동일한 패키지 트리)
   │
 📄 DecoSheetController
   │
 ┌─[ DI ]─────────────────────┐
 │  Controller                 │  ┐
 │      ↓                       │  │
 │  Service                     │  │  (수직 체인, Y축)
 │      ↓                       │  │
 │  Repository                  │  ┘
 └─────────────────────────────┘
```

### 3.2 규칙

| 규칙 | 정의 |
|---|---|
| **R-T2.1 베이스 트리** | Tab1과 동일한 패키지 트리 구조 + 동일 chunking 정책(R-T1.8) 적용. |
| **R-T2.2 leaf DI 체인** | Controller leaf 자리에 `Controller → Service → Repository` 수직 subgraph(`di_<ControllerName>`). 각 단계는 별도 노드 + `-->` edge(verified) 또는 `-.->` (inferred). |
| **R-T2.3 leaf 정렬** | 같은 패키지 leaf 내부 DI 체인은 항상 Controller(상)→Repository(하). edge 방향은 호출 방향과 일치. |
| **R-T2.4 cross-package DI** | 한 도메인의 Service가 다른 도메인의 Repository를 주입받는 경우(드물지만 발생) → leaf 외부에 dashed edge로 cross-package edge 추가. 라벨에 `cross-pkg` 표기. |
| **R-T2.5 누락 표시** | DI 체인에서 Service 또는 Repository가 없으면 해당 위치에 `(none)` placeholder 노드(`:::muted`). Less is More 원칙 보존 — 추정으로 채우지 않음. |
| **R-T2.6 클래스** | Controller=`:::ssr`, Service=`:::unk`(회색), Repository=`:::ssg`(보라). 기존 색 체계 유지. |

## 4. Tab3 — DB–Screen (BE)

**변경 없음.** ER 다이어그램(`erDiagram`)은 표준 표 형식이 산업 표준이며, v1.2.2에서 적용된 MySQL Workbench 스타일 테마(헤더 어두운 청회색 + td 밝은 배경) 유지.

## 5. FE 다이어그램과의 관계

본 표준은 **BE 어댑터(`adapterCategory: 'BE'`)에만 적용**. FE 어댑터(`'FE'` / `'Fullstack'`)는 URL 기반 라우트 그룹핑 + Wave 1 nested subgraph 정책을 유지(v1.1.6 T4 그대로).

## 6. 변경 영향 범위

| 변경 대상 | 파일 | 회귀 위험 |
|---|---|---|
| Tab1 BE | `packages/renderer/src/mermaid-renderer.ts` (`buildBeRenderingDiagram` 재구현) | BE 전용 분기이므로 FE 회귀 0 |
| Tab2 BE | `packages/renderer/src/mermaid-renderer.ts` (`buildBeArchitectureDiagram` 재구현) | BE 전용 분기이므로 FE 회귀 0 |
| chunking | `packages/renderer/src/mermaid-renderer.ts` (`buildWithChunkFallback` BE 가드는 v1.2.3에서 적용됨, top-level 패키지 단위 새 chunking 함수 추가) | FE 미영향 |
| elk mrtree | `packages/extension/media/viewer.html` (mermaid init 검토) | mermaid 기본 dagre로 fallback 가능 |
| 테스트 | `packages/renderer/src/mermaid-renderer.test.ts` BE Tab1/2 케이스 갱신 + 회귀 fixture(`mini-spring-deep-pkg-app`) 활용 | snapshot 갱신 필요 |

## 7. 미해결·검토 사항

- **elk mrtree 가용성**: `@mermaid-js/layout-elk` 빌드가 어떤 ELK 알고리즘을 노출하는지 실제 확인 후 적용 가능 여부 결정.
- **leaf endpoint subgraph 가독성**: 한 Controller에 endpoint 10+ 개일 때 subgraph가 다시 X축 폭발할 수 있음. 필요 시 endpoint도 수직 나열 또는 별도 chunk 옵션 검토.
- **viewer collapse/expand**: 트리 노드 click으로 자식 패키지 접기/펴기 UX는 v1.2.40 범위 밖. 후속 작업.
