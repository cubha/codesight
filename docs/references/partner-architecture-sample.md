# 파트너 아키텍처 흐름도 — 외부 참조 샘플

> **분류**: 참조 자료 (영감 소스). **렌더러 컨트랙트 아님.**
> **아카이브 일자**: 2026-05-19
> **출처**: 사용자 실무 프로젝트의 수동 큐레이션 산출물 (Spring Boot + React, 약 28 화면, 4 도메인)
> **연관 메모리**: `reference_partner_architecture_sample.md`, `project_v13x_be_phase2_candidates.md`
>
> ---
>
> ## 보관 목적 및 적용 제약 (advisor 검증, 2026-05-19)
>
> 이 자료는 **사람이 큐레이션한 문서 아티팩트**다. codebase-viz는 **AST 결정론적 자동 생성 컨트랙트**이므로 자료의 모든 측면을 1:1 모사할 수 없다.
>
> **자동화 가능 (영감 추출 대상 = v1.3.x BE Adapter Phase 2 후보)**:
> - MyBatis XML statement-level 노드 + Repository.method ↔ statement 매핑 엣지 (현재 mybatis-parser는 TableNode만 emit)
> - API Endpoint와 Controller method 사이 fan-in 엣지 (현재 두 노드는 있으나 엣지 미생성)
> - 외부 시스템 노드 (SAP RFC / RestTemplate / WebClient / FeignClient)
> - DB Table 다중 묶음 cluster 노드 (Tab1/2 leaf 옆 새 view — Tab3 수정 아님)
>
> **자동화 불가 (이 자료에만 유효)**:
> - 엔드포인트 수동 번호 매김 (①②③)
> - XML statement의 의미 그룹 라벨 (`[조회]`, `[저장]`, `[SP 호출]`) — LLM 영역
> - "⚠️ FE API Hook 미발견" 같은 수동 경고
> - 화면(Page) 단위 분리 다이어그램 (985 라우트 프로젝트에서 비현실적)
> - 5층 통합 한 다이어그램 (v1.1.53 trilemma 재현 위험)
>
> **표준과의 충돌 (BE-DIAGRAM-STANDARD.md v1.0, 변경 차단)**:
> - R-T2.2 3-layer DI ↔ 자료 4-layer (XML statement 추가)
> - R-T1.6 endpoint=Controller leaf 내부 subgraph ↔ 자료 분리 fan-in (시각 모델 상호 배타)
> - 색 충돌: 표준 `ssr`(녹색, FE SSR) ↔ 자료 `ctrl`(녹색, BE Controller) — Fullstack pair-analysis silent corruption
> - Tab3 "변경 없음" 박제 ↔ 자료의 cluster table 노드 (Tab1/2 leaf 옆 새 view)
> - IR 확장 필수 (statement-level NodeKind 신규)
>
> → **표준 v1.1 발행 + IR 확장 + 별도 minor bump(v1.3.x BE Adapter Phase 2) 필요**. 현 v1.2.41+ 궤도(T1·T2·T3 UX 폴리시)와 분리.
>
> ---
>
> 이하 원본 자료 (사용자 제공, 2026-05-19):

---

# 파트너 전체 아키텍처 흐름도 — 가시화 (Flowchart)

> Mermaid 렌더링 지원 뷰어(VS Code / GitHub / Confluence) 에서 열어야 차트가 표시됩니다.

---

## 진행 현황

| 도메인 | 상태 | 완료일 |
|---|---|---|
| [가공협력사] 주문생산 계획관리 | ✅ 완료 | 2026-05-19 |
| [가공협력사] 자재관리 | ✅ 완료 | 2026-05-19 |
| [가공협력사] 실적관리 | ✅ 완료 | 2026-05-19 |
| [본사] 협력사관리 | ✅ 완료 | 2026-05-19 |

---

## 범례

```mermaid
flowchart LR
    classDef fe    fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api   fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl  fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc   fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map   fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml   fill:#922b21,color:#fff,stroke:#641d17
    classDef db    fill:#2c3e50,color:#fff,stroke:#1a252f

    A["🖥️ FE 화면"]:::fe
    B["📡 API Endpoint"]:::api
    C["⚙️ Controller"]:::ctrl
    D["🔧 ServiceImpl"]:::svc
    E["🗂️ Repository"]:::map
    F["📄 XML Query"]:::xml
    G[("🗄️ DB Table")]:::db

    A --> B --> C --> D --> E --> F --> G
```

---

## 1. 주문생산 계획관리 (ordProdPlanMgmt)

### 1-0. 전체 구조 개요

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17

    subgraph SCREENS["🖥️ 화면 (7개)"]
        direction TB
        P1["주문내역출력"]:::fe
        P2["부자재주문접수"]:::fe
        P3["주문내역별 실적조회"]:::fe
        P4["주문진행(미출)현황조회"]:::fe
        P5["주문취소요청승인"]:::fe
        P6["납기변경요청 승인"]:::fe
        P7["주문별 납기변경 이력 조회"]:::fe
    end

    subgraph CTRLS["⚙️ Controller (4개)"]
        direction TB
        C1["ProdOrdSpecController"]:::ctrl
        C2["SubMatOrdRcptController"]:::ctrl
        C3["OrdProdRsltbyCrtController"]:::ctrl
        C4["UnshippedOrdController"]:::ctrl
        C5["DueDateReqController"]:::ctrl
    end

    subgraph XMLS["📄 XML (5개)"]
        direction TB
        X1["prodOrdSpec.xml"]:::xml
        X2["subMatOrdRcpt.xml"]:::xml
        X3["ordProdRsltbyCrt.xml"]:::xml
        X4["unshippedOrd.xml"]:::xml
        X5["dueDateReq.xml"]:::xml
    end

    P1 --> C1 --> X1
    P2 --> C2 --> X2
    P3 --> C3 --> X3
    P4 --> C4 --> X4
    P5 --> C5 --> X5
    P6 --> C5
    P7 --> C5
```

---

### 1-1. 주문내역출력

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    PAGE["🖥️ ord-spec-print-page.tsx\n📁 ordProdPlanMgmt/ordRcvMgmt/ordSpecPrint"]:::fe

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/prodOrdSpec/...)"]
        direction LR
        A1["① GET /list\n목록 조회"]:::api
        A2["② GET /production-instruction\n생산지시서 엑셀"]:::api
        A3["③ GET /handle-info\n핸들정보 엑셀"]:::api
        A4["④ GET /glass-order\n유리발주내역서 엑셀"]:::api
        A5["⑤ GET /material-summary\n소요자재집계표 엑셀"]:::api
        A6["⑥ GET /barcode-excel\n바코드 엑셀"]:::api
    end

    CTRL["⚙️ ProdOrdSpecController"]:::ctrl
    SVC["🔧 ProdOrdSpecServiceImpl"]:::svc
    MAP["🗂️ ProdOrdSpecRepository"]:::map

    subgraph XMLG["📄 prodOrdSpec.xml"]
        direction TB
        X1["retrieveProdOrdSpecList"]:::xml
        X2["retrievePrdoOrderSpecForIdctExcel\nretrievePrdoLdctList"]:::xml
        X3["retrieveEstMtrlExcel1 / 2 / H"]:::xml
        X4["retrieveGlasOrdnPrvsExcel\nretrieveGlasOrdnPrvsExcelList"]:::xml
        X5["retrieveEstMtrlExcelH\nretrieveEstMtrlExcel"]:::xml
        X6["retreiveOrdNoByItemListBcd\nupdateWryLabelYnPlan\nupdateWryLabelBcdCdPlan ...]"]:::xml
    end

    DB1[("🗄️ VI_ORDER_H · TWE_ORD_H\nTWE_ORD_I · TWE_WRY_SN\nTWE_WRY_SN_DTL · TWC_ENGY_LBL_SN_RGST")]:::db
    DB2[("🗄️ TWE_ORD_I\nTWE_ORD_I_HOSEH · TWE_WIND_LOC_BSMF")]:::db

    PAGE --> APIS
    A1 & A2 & A3 & A4 & A5 & A6 --> CTRL
    CTRL --> SVC --> MAP
    MAP --> X1 & X2 & X3 & X4 & X5 & X6
    X1 --> DB1
    X2 & X3 & X4 & X5 & X6 --> DB2
```

---

### 1-2. 부자재주문접수

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    subgraph PAGES["🖥️ 화면 구조  (목록 → 상세 전환)"]
        direction LR
        PL["sub-mtrl-prd-ord-spec-page.tsx\n목록"]:::fe
        PD["sub-mtrl-prd-ord-spec-dtl-page.tsx\n상세"]:::fe
    end

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/subMatOrdRcpt/...)"]
        direction TB
        A1["① GET /list\n목록 조회"]:::api
        A2["② POST /excel\n목록 엑셀"]:::api
        A3["③ GET /{ordNo}\n상세 조회"]:::api
        A4["④ PUT /accept\n주문접수 처리"]:::api
        A5["⑤ PUT /cancel\n주문접수취소 처리"]:::api
        A6["⑥ POST /{ordNo}/items/excel\n상세 품목 엑셀"]:::api
        A7["⑦ GET /{ordNo}/items/{igNo}/sub\n하부 품목 조회"]:::api
    end

    CTRL["⚙️ SubMatOrdRcptController"]:::ctrl
    SVC["🔧 SubMatOrdRcptServiceImpl"]:::svc
    MAP["🗂️ SubMatOrdRcptRepository"]:::map

    subgraph XMLG["📄 subMatOrdRcpt.xml"]
        direction LR
        XQ["retrieveSubMatOrdRcptList\nretrieveSubMatOrdRcptCount"]:::xml
        XD["retrieveSubMatOrdRcptDetail\nretrieveCutingPlnNoYN\nretrieveMtrlWnedYN · retrieveMtrlOrdYN\nretrieveSubMatOrdRcptItemList\nretrieveSubMatOrdRcptItemSubList"]:::xml
        XW["updateSubMatOrdRcptAccept\nupdateSubMatOrdRcptCancel"]:::xml
    end

    DB[("🗄️ TWE_ORD_H · TWE_ORD_I\nTWO_CUTING_PLN_MST · TWO_MTRL_WNED")]:::db

    PAGES --> APIS
    A1 & A2 --> CTRL
    A3 & A6 & A7 --> CTRL
    A4 & A5 --> CTRL
    CTRL --> SVC --> MAP
    MAP --> XQ & XD & XW --> DB
```

---

### 1-3. 주문내역별 실적조회

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    subgraph PAGES["🖥️ 화면 구조  (목록 → 상세 전환)"]
        direction LR
        PL["prd-ord-achv-crt-page.tsx\n목록"]:::fe
        PD["prd-ord-achv-crt-dtl-page.tsx\n상세"]:::fe
    end

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/ordProdRsltbyCrt/...)"]
        direction LR
        A1["① GET /list\n목록 조회"]:::api
        A2["② POST /excel\n목록 엑셀"]:::api
        A3["③ POST /multiBatch\n일괄 생산+입고(멀티)"]:::api
        A4["④ GET /{ordNo}\n상세 조회"]:::api
        A5["⑤ POST /production\n생산실적 생성"]:::api
        A6["⑥ POST /receiving\n입고 생성"]:::api
        A7["⑦ POST /batch\n일괄 생산+입고(단건)"]:::api
        A8["⑧ POST /{ordNo}/items/excel\n상세 품목 엑셀"]:::api
    end

    CTRL["⚙️ OrdProdRsltbyCrtController"]:::ctrl
    SVC["🔧 OrdProdRsltbyCrtServiceImpl"]:::svc
    MAP["🗂️ OrdProdRsltbyCrtRepository"]:::map

    subgraph XMLG["📄 ordProdRsltbyCrt.xml"]
        direction TB
        XR["[조회]\nretrieveOrdProdRsltbyCrtList\nretrieveOrdProdRsltbyCrtCount\nretrieveOrdProdRsltbyCrtDetail\nretrieveOrdProdRsltbyCrtItemList\nretrieveOrdProdRsltbyCrtAllItemList"]:::xml
        XP["[생산]\nretrievePrdDt\nretrievePrdArslNoList\ninsertWeldPrdArslBatch"]:::xml
        XI["[입고 — 프로시저 전환]\ninsertBsmfWhsn · insertGlasWhot\ninsertMtrlWhot · insertMtrlWhotDtlBatch\ninsertMtrlIv · insertMtrlIvBcd\nupdateWeldPrdPlnDtlStatusBatch\nupdateOrdIStatus · insertEngyLblSnRgst\nupdateEngyLblSnIssStatus ...]"]:::xml
    end

    DB1[("🗄️ TWE_ORD_H · TWE_ORD_I\nTWO_PRD_PLN · TWO_WELD_PRD_PLN\nTWE_WRY_SN · TWC_ENGY_LBL_SN_RGST")]:::db
    DB2[("🗄️ TWO_WELD_PRD_ARSL\nTWO_BSMF_WHSN · TWO_MTRL_IV_BCD\nTWO_GLAS_WHOT · TWO_MTRL_WHOT\nTWO_MTRL_WHOT_DTL · TWO_MTRL_IV\nTWO_WELD_PRD_PLN · TWE_WRY_SN_DTL\nTWC_ENGY_LBL_SN_RGST · TWC_ENGY_LBL_SN_ISS")]:::db

    PAGES --> APIS
    A1 & A2 & A4 & A8 --> CTRL
    A3 & A5 & A6 & A7 --> CTRL
    CTRL --> SVC --> MAP
    MAP --> XR & XP & XI
    XR --> DB1
    XP & XI --> DB2
```

---

### 1-4. 주문진행(미출)현황조회

> ⚠️ FE API Hook 미발견 — BE URL은 `/v1/partner/ordProdPlanMgmt/unshippedOrd/` 확인됨. FE 연결 재확인 필요.

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f
    classDef warn fill:#f39c12,color:#fff,stroke:#d68910

    PAGE["🖥️ prdo-ord-stat-page.tsx\n📁 ordPerfByDtlMgmt/openOrdStatSearch"]:::fe
    WARN["⚠️ FE API Hook\n미발견 — 재확인 필요"]:::warn

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/unshippedOrd/...)"]
        direction LR
        A1["① GET /list\n미출 주문 목록 조회"]:::api
        A2["② POST /excel\n미출 주문 엑셀"]:::api
    end

    CTRL["⚙️ UnshippedOrdController"]:::ctrl
    SVC["🔧 UnshippedOrdServiceImpl"]:::svc
    MAP["🗂️ UnshippedOrdRepository"]:::map

    subgraph XMLG["📄 unshippedOrd.xml"]
        X1["retrieveOrderStatList\nretrieveOrderStatListCount"]:::xml
    end

    DB[("🗄️ TWE_ORD_H · TWE_ORD_I\nT_OFFICE_ORDER_H · TWE_WINS_PFL_WT")]:::db

    PAGE -.->|"Hook 연결 재확인"| WARN
    PAGE --> APIS
    A1 & A2 --> CTRL --> SVC --> MAP --> X1 --> DB
```

---

### 1-5. 주문취소요청승인

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    PAGE["🖥️ ord-cancel-req-conf-page.tsx\n📁 dlvReqMgmt/ordCanReqAprv"]:::fe

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/dueDateReq/...)"]
        direction LR
        A1["① GET /list\n목록 조회"]:::api
        A2["② POST /excel\n목록 엑셀"]:::api
        A3["③ POST /conf\n취소요청 승인 처리"]:::api
    end

    CTRL["⚙️ DueDateReqController"]:::ctrl
    SVC["🔧 DueDateReqServiceImpl"]:::svc
    MAP["🗂️ DueDateReqRepository"]:::map

    subgraph XMLG["📄 dueDateReq.xml"]
        direction LR
        XR["[조회]\nretrieveDueDateReqList"]:::xml
        XW["[처리]\nupdateDueDateReqConf\ninsertOrderAlterHistory"]:::xml
    end

    DB1[("🗄️ TWE_ORD_I · TWE_ORD_ALTR_REQ\nTWE_ORD_H · TB_GU106 · TOPICS.KVTWT\nTWB_MDL_HICY_MGMT · TWA_MARA_HICY_MGMT\nTWB_PRTO_MST · V_TWC_CSMR_MST\nT_OFFICE_ORDER_H")]:::db
    DB2[("🗄️ TWE_ORD_ALTR_REQ\nTWE_ORD_ALTR_REQ_HIST")]:::db

    PAGE --> APIS
    A1 & A2 --> CTRL
    A3 --> CTRL
    CTRL --> SVC --> MAP
    MAP --> XR --> DB1
    MAP --> XW --> DB2
```

---

### 1-6. 납기변경요청 승인

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    subgraph PAGES["🖥️ 화면 구조  (목록 → 상세 전환)"]
        direction LR
        PL["ord-dely-dt-chg-apv-page.tsx\n목록"]:::fe
        PD["ord-dely-dt-chg-apv-dtl-page.tsx\n상세"]:::fe
    end

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/dueDateReq/ordAlterReqConf/...)"]
        direction LR
        A1["① GET /list\n목록 조회"]:::api
        A2["② POST /conf\n납기변경 승인 처리"]:::api
        A3["③ GET /dtl/list\n상세 조회"]:::api
    end

    CTRL["⚙️ DueDateReqController"]:::ctrl
    SVC["🔧 DueDateReqServiceImpl"]:::svc
    MAP["🗂️ DueDateReqRepository"]:::map

    subgraph XMLG["📄 dueDateReq.xml"]
        direction LR
        XL["[조회]\nretrieveDueDateReqList\n(reqScnCd=101 파라미터)"]:::xml
        XD["[상세]\nretrieveDueDateReqDtlList"]:::xml
        XW["[처리]\nupdateOrdAlterReqConf\ninsertOrderAlterHistory"]:::xml
    end

    DB1[("🗄️ TWE_ORD_I · TWE_ORD_ALTR_REQ")]:::db
    DB2[("🗄️ TWE_ORD_ALTR_REQ\nTWE_ORD_ALTR_REQ_HIST")]:::db

    PAGES --> APIS
    A1 --> CTRL
    A2 --> CTRL
    A3 --> CTRL
    CTRL --> SVC --> MAP
    MAP --> XL --> DB1
    MAP --> XD --> DB1
    MAP --> XW --> DB2
```

---

### 1-7. 주문별 납기변경 이력 조회

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    PAGE["🖥️ ord-dely-dt-chg-his-page.tsx\n📁 dlvReqMgmt/ordDelyDtChgHis"]:::fe

    subgraph APIS["📡 API Endpoints  (/v1/partner/ordProdPlanMgmt/dueDateReq/ordAlterReqConf/hist/...)"]
        direction LR
        A1["① GET /list\n납기변경 이력 목록 조회"]:::api
    end

    CTRL["⚙️ DueDateReqController"]:::ctrl
    SVC["🔧 DueDateReqServiceImpl"]:::svc
    MAP["🗂️ DueDateReqRepository"]:::map

    subgraph XMLG["📄 dueDateReq.xml"]
        X1["retrieveDueDateReqHistList\nretrieveDueDateReqHistListCount"]:::xml
    end

    DB[("🗄️ TWE_ORD_ALTR_REQ_HIST\nTWE_ORD_I · TWE_ORD_ALTR_REQ")]:::db

    PAGE --> APIS
    A1 --> CTRL --> SVC --> MAP --> X1 --> DB
```

---

## 2. 자재관리 (matMgmt)

### 2-0. 전체 구조 개요

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17

    subgraph SCREENS["🖥️ 화면 (9개)"]
        direction TB
        P1["자재발주내역조회"]:::fe
        P2["에너지라벨 챙김관리"]:::fe
        P3["데코시트절단요청"]:::fe
        P4["데코시트발주"]:::fe
        P5["데코시트입고"]:::fe
        P6["보강재절단요청"]:::fe
        P7["보강재주문내역조회"]:::fe
        P8["자재 미입고 내역조회"]:::fe
        P9["자재발주입고내역조회"]:::fe
    end

    subgraph CTRLS["⚙️ Controller (5개)"]
        direction TB
        C1["MatPurcOrdController"]:::ctrl
        C2["EnergyLabelController"]:::ctrl
        C3["DecoSheetController"]:::ctrl
        C4["ReinfCutReqController"]:::ctrl
        C5["MatInboundController"]:::ctrl
    end

    subgraph XMLS["📄 XML (5개)"]
        direction TB
        X1["matPurcOrd.xml"]:::xml
        X2["energyLabel.xml"]:::xml
        X3["decoSheet.xml"]:::xml
        X4["reinfCutReq.xml"]:::xml
        X5["matInbound.xml"]:::xml
    end

    P1 --> C1 --> X1
    P2 --> C2 --> X2
    P3 --> C3 --> X3
    P4 --> C3
    P5 --> C3
    P6 --> C4 --> X4
    P7 --> C4
    P8 --> C5 --> X5
    P9 --> C5
```

---

### 2-1. 자재발주내역조회

```mermaid
flowchart TD
    classDef fe   fill:#1a5276,color:#fff,stroke:#0d2b4e
    classDef api  fill:#1a6fa8,color:#fff,stroke:#124f7a
    classDef ctrl fill:#1e6b37,color:#fff,stroke:#144d27
    classDef svc  fill:#6c3483,color:#fff,stroke:#4a235a
    classDef map  fill:#ba4a00,color:#fff,stroke:#7d3200
    classDef xml  fill:#922b21,color:#fff,stroke:#641d17
    classDef db   fill:#2c3e50,color:#fff,stroke:#1a252f

    subgraph PAGES["🖥️ 화면 구조  (탭 2개)"]
        direction LR
        PL["retrieve-mtrl-ording-page.tsx\n📁 matMgmt/matPurcOrdMgmt/matPurcOrdSearch"]:::fe
        T1["mat-purc-ord-search-tab\n발주조회"]:::fe
        T2["mat-purc-ord-register-tab\n발주등록"]:::fe
        PL --> T1
        PL --> T2
    end

    subgraph APIS["📡 API Endpoints  (/v1/partner/matMgmt/matPurcOrd/...)"]
        direction TB
        A1["① GET /list\n발주 목록 조회"]:::api
        A2["② POST /excel\n발주 목록 엑셀"]:::api
        A3["③ GET /need/list\n소요 리스트 조회"]:::api
        A4["④ POST /need/excel\n소요 엑셀"]:::api
        A5["⑤ POST /estMtrl/excel\n소요자재집계표 엑셀"]:::api
        A6["⑥ POST /save\n발주 저장"]:::api
        A7["⑦ POST /send\n발주 전송(SAP)"]:::api
        A8["⑧ DELETE /delete\n발주 삭제"]:::api
        A9["⑨ GET /bond\n여신잔액 조회"]:::api
        A10["⑩ GET /rifa/uploadedFileInfo\n보강재 파일정보"]:::api
        A11["⑪ POST /rifa/fileInfo\n보강재 엑셀"]:::api
        A12["⑫ POST /rifa/upload\n보강재 파일 업로드"]:::api
    end

    CTRL["⚙️ MatPurcOrdController"]:::ctrl
    SVC["🔧 MatPurcOrdServiceImpl"]:::svc
    MAP["🗂️ MatPurcOrdRepository"]:::map

    subgraph XMLG["📄 matPurcOrd.xml"]
        direction TB
        XR["[조회]\nretrieveMatPurcOrdList\nretrieveMatPurcOrdListCount\nretrieveMatPurcOrdNeedList\nretrieveNeedRifaList / Info / FileInfo"]:::xml
        XS["[저장/삭제]\nretrieveMatPurcOrdSeq / MaxIno / DtlCount\ninsertMatPurcOrdMst / Dtl\nupdateMatPurcOrdDtl\ndeleteMatPurcOrdMst / Dtl"]:::xml
        XT["[전송/여신]\nupdateMatPurcOrdMstSap\nupdateMatPurcOrdDtlChk / DtlPo\nretrieveMatPurcOrdBond"]:::xml
        XSP["[SP 호출 + 보강재 처리]\ncallCreateMtrlOrdData (SP_SAVE_MRP_AT_POMST)\nselectMtrlWnedQtyDataList\ninsertMtrlOrdDtlFromWned\nupdateBtmPlnMfrHisStatus · updateOrdIStatus\nupdateNeedRifaFileInfo"]:::xml
    end

    DB1[("🗄️ TWO_MTRL_ORD · TWO_MTRL_ORD_DTL\nTWO_MTRL_WNED_QTY · TWO_MTRL_WNED_QTY_DTL")]:::db
    DB2[("🗄️ TB_GU106 · TWO_APIM_LMT_ADJ\nTWC_ORD_BILL · TWC_SO_CNCL · TOPICS.KNA1")]:::db
    DB3[("🗄️ TWO_CUTING_PLN_MST · TWO_IV_CTRL_MTRL\nTWS_BTM_PLN_MFR_HIS · TWE_ORD_I\nTOPICS.PROF_MOLD_M · TOPICS.A703")]:::db
    SAP[("☁️ SAP RFC\nzRfcOem09.executeCreatePurchaseOrder")]:::db

    PAGES --> APIS
    A1 & A2 & A3 & A4 & A5 --> CTRL
    A6 & A7 & A8 & A9 & A10 & A11 & A12 --> CTRL
    CTRL --> SVC --> MAP
    A7 -.SAP 호출.-> SAP
    MAP --> XR & XS & XT & XSP
    XR --> DB1
    XT --> DB2
    XSP --> DB3
    XS --> DB1
```

---

### 2-2 ~ 2-9, 3-1 ~ 3-8, 4-1 ~ 4-4 (총 19개 다이어그램)

원본은 2026-05-19 codebase-viz 세션 사용자 메시지에 보존. 패턴이 위 1-1 ~ 2-1과 동일하게 반복(`FE Page → API Endpoints subgraph → Controller → ServiceImpl → Repository → XML statement group → DB Table cluster`)되므로 영감 추출에는 위 샘플로 충분.

추가 패턴 변형 케이스만 발췌:
- **viewMode 컨테이너** (2-3, 2-4, 2-9): 한 페이지 컴포넌트가 viewMode prop으로 목록↔등록↔상세 분기. FE 라우트는 1개지만 논리 화면 다수
- **외부 시스템 노드 (SAP RFC)** (3-2, 3-4, 3-5, 3-6, 3-7): `☁️ SAP RFC\nZ_RFC_EPS30` 같은 별도 분류 노드, dashed edge로 호출 관계 표시
- **DB만 vs DB+SAP 혼합** (3-5 미출현황조회): SAP backOrderList → DB perfStatusDetail join 흐름
- **Master/Detail 그리드** (3-1 거래명세표): 한 페이지에 두 그리드 동시 표시, API endpoint도 master·detail 분리

> 위 4종 패턴은 v1.3.x BE Adapter Phase 2 설계 시 별도 처리 케이스로 검토할 가치 있음.

