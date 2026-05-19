package com.wina.agency.contractMgmt.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWA_CONTRACT_MST")
public class Contract {
    @Id
    private String contractNo;
    private String partnerCd;
    private String startDate;
}
