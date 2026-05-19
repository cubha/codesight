package com.wina.partner.ordProdPlanMgmt.prodOrdSpec.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWE_ORD_H")
public class ProdOrdSpec {
    @Id
    private String ordNo;
    private String custCd;
    private String status;
}
