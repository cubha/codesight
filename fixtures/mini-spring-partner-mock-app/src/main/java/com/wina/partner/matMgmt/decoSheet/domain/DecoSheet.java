package com.wina.partner.matMgmt.decoSheet.domain;

import javax.persistence.*;

@Entity
@Table(name = "TB_HODS401")
public class DecoSheet {
    @Id
    private String reqNo;
    private String mtrlCd;
}
