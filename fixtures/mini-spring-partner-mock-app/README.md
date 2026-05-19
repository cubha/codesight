# mini-spring-partner-mock-app — v1.2.40 BE 트리 시각 검증 fixture

**용도**: v1.2.40에서 ship된 BE Tab1/Tab2 트리 다이어그램 표준(`docs/design/BE-DIAGRAM-STANDARD.md`)이 실제로 X축 dept 트리노드 + Y축 하위항목 표시를 잘 하는지 시각 검증.

페어 fixture: `fixtures/mini-react-partner-mock-app` (React Router)

## 구조

```
com.wina
├── partner               (3 도메인)
│   ├── ordProdPlanMgmt.prodOrdSpec
│   ├── matMgmt.decoSheet
│   └── perfMgmt.transStmt
├── agency                (2 도메인, 신규)
│   ├── userMgmt
│   └── contractMgmt
└── headoffice            (2 도메인)
    ├── partnerBaseInfo.procCodeMgmt
    └── materialMgmt.cuttingPlanInfoMgmt
```

각 도메인 5층: Controller + Service(iface) + ServiceImpl + Repository(@Mapper iface) + MyBatis XML + JPA Entity

## v1.2.40 표준 검증 포인트

| 규칙 | 확인 결과 (`.codebase-viz/rendering.md`) |
|---|---|
| R-T1.2 공통 prefix strip | `📁 src/main/java/com.wina` 헤더 (✅) |
| R-T1.4 트리 노드 | `pkg_<name>` + `-->` edges (✅) |
| R-T1.5 leaf Controller | `📄 ControllerName [/api/prefix]` (✅) |
| R-T1.6 endpoint subgraph | `subgraph endpoints_<Ctrl>` + METHOD /suffix (✅) |
| R-T1.8 top-level chunking | 3 chunks: partner/agency/headoffice (✅) |
| R-T1.9 elk.mrtree opt-in | `config: layout: elk.mrtree` (✅) |
| R-T2.2 Tab2 DI 체인 | leaf에 Controller→Service→Repository 수직 (확인 시 screen-component.md) |
