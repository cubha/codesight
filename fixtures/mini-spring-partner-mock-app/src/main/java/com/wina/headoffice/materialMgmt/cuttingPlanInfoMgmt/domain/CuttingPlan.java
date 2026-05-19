package com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWO_MOLD_CUTING_NRM")
public class CuttingPlan {
    @Id
    private String moldCd;
    private String nrmCd;
}
