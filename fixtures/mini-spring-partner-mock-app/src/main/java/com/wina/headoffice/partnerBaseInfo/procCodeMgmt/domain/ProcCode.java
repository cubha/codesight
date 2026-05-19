package com.wina.headoffice.partnerBaseInfo.procCodeMgmt.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWO_POWCD")
public class ProcCode {
    @Id
    private String procCd;
    private String procNm;
}
