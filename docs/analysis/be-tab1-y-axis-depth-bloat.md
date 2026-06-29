# BE Tab1 — endpoint Y축 비대 현상 분석

작성: 2026-06-29 · 대상: v1.3.x BE Adapter Phase 2 후보
관련 표준: `docs/design/BE-DIAGRAM-STANDARD.md` R-T1.6

## 1. 현상

SpringBoot Tab1 다이어그램에서 컨트롤러별 endpoint(최종 depth)가 Y축으로 수직 적층되어,
endpoint가 많은(=더 깊은) 컨트롤러의 열(column)이 무의미하게 길어지고 전체 캔버스 높이를
그 최장 열에 맞춰 비대하게 만든다. SpringBoot 한정이 아닌 모든 TD 트리 공통 현상.

## 2. 근본 원인 (코드 근거)

| 위치 | 동작 |
|---|---|
| `packages/renderer/src/be/tab1.ts:54` | 전역 `graph TD` (top-down) |
| `packages/renderer/src/be/leaf.ts:41-50` | 각 컨트롤러의 endpoint를 `endpoints_<Ctrl>` **subgraph 안에 개별 노드로** 배치 (`direction TB` + `---` 가시 체인) |
| `packages/renderer/src/helpers/constants.ts:9` | `BE_RENDERING_INIT` rankSpacing:8 — 외부 dagre rank만 통제 |

두 가지가 Y 높이를 키운다:

1. **(지배적) endpoint 적층** — 컨트롤러 1개의 endpoint N개가 N개의 노드로 세로 적층.
   N은 컨트롤러마다 1~40+로 편차가 크다. 이미지의 긴 열들이 이것이다.
2. **(부차적) 단일 자식 패키지 체인** — `wina→partner→matMgmt→decoSheet` 같은 1-자식
   직렬 패키지가 rank를 소모. FE는 v1.2.55 `buildNestedFolderOverviewLines`로 해결했으나
   **BE에는 대응물이 없다.**

dagre TD는 전역 rank를 부여하므로, 한 chunk 안의 **모든** endpoint subgraph가 최장 열
높이의 캔버스를 공유한다 → 짧은 열 옆에 거대한 빈 세로 공간 + 비대한 connector. 
R-T1.8 top-level 청킹은 X 폭발만 완화할 뿐 chunk **내부** Y 불균형은 그대로다.

## 3. 사용자 제안 "X축 배치?" — 직답

축을 회전하는 접근은 **모두 막다른 길**이며, 이미 이 레포에서 실측 폐기되었다.

- **(a) endpoints subgraph를 `direction LR`/grid로** → mermaid v11이 **외부 edge incoming +
  내부 chain** 조합 nested subgraph에서 LR 방향을 시각적으로 무시
  ([[feedback-mermaid-v11-nested-lr-limit]], v1.2.45 12-candidate Playwright 검증).
  같은 조건에서 spacing 옵션도 미반영([[mermaid-v11-nested-subgraph-spacing-edge-incoming]]).
- **(b) 전역 `graph LR`** → 세로→가로로 *교환*일 뿐. 깊은 패키지 트리가 X로 폭발(애초에
  R-T1.8 청킹을 도입한 그 문제로 회귀).
- **결론: 진짜 레버는 "축 회전"이 아니라 "축 위에 materialize하는 양을 줄이는 것."**

## 4. 해결책

### 4.1 (주) endpoint 무손실 collapse — subgraph 폐기

endpoint를 개별 노드 대신 **leaf 컨트롤러 노드 안 multiline 텍스트**로 흡수:

```
📄 DecoSheetController [/api/.../decoSheet]
GET /· GET /:id· POST /· PUT /:id· DELETE /:id
```

- per-endpoint rank gap·`---` 체인·subgraph chrome이 전부 사라져 높이가 급감.
- **두 mermaid 한계를 동시에 회피** — nested subgraph 자체가 없어지므로 LR-무시도
  spacing-불가도 무의미해진다. 이것이 grid/LR 대비 collapse의 결정적 우위.
- 손실 없음(모든 endpoint를 한 노드 안에 나열). Tab1은 개요(overview)이고 BE endpoint는
  **Tab1에만 존재**(BE Tab2=DI 체인, BE Tab3 없음)하므로 절단(truncation)은 기본값이
  될 수 없다 — 무손실 collapse가 기본이어야 한다.

### 4.2 (보완) 단일 자식 패키지 체인 collapse

`a→b→c→d` 1-자식 직렬 패키지를 `a/b/c/d` 한 노드로 압축. FE v1.2.55의 일반화된
트리 평탄화와 동일 원리. "비단 SpringBoot만의 문제 아님"에 대응하는 범용 레버.
지배 케이스(4.1)를 먼저, 깊은 패키지 레포에서 4.2를 함께.

### 4.3 (선택) 병리적 컨트롤러 절단

endpoint 40+ 같은 극단에서만 상위 N개 + `…(+M more)` 표기. **개요 단순화임을 명시**해야
하며(다른 탭에 원본 없음), 기본 동작이 아닌 안전판으로 한정.

## 5. 표준 영향

이것은 버그픽스가 아니라 **R-T1.6의 버전드 amendment**다. R-T1.6은 `endpoints_<Ctrl>`
subgraph를 명시적으로 mandate하고, §2.1 ASCII는 `GET / · GET /:id · POST /` 단일 라인을
보여줘 **표준 내부가 자기모순**이다. 4.1은 이 모순을 compact-line 방향으로 해소한다
(FE-DIAGRAM-STANDARD amendment 관행과 동일하게 버전 명기).

## 6. 우선순위 요약

| 순위 | 레버 | 효과 | 리스크 |
|---|---|---|---|
| 1 | endpoint 무손실 collapse (4.1) | 지배 원인 제거, mermaid 한계 동시 회피 | 낮음 (subgraph 제거) |
| 2 | 단일 자식 패키지 체인 collapse (4.2) | 부차 원인, 범용 | 낮음 |
| — | 축 회전 (LR/grid) | 없음 | 폐기됨 |
| 보조 | 병리 컨트롤러 절단 (4.3) | 극단값 한정 | 데이터 손실(명시 필요) |
