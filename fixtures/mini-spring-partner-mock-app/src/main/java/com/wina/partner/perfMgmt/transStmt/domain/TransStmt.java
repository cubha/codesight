package com.wina.partner.perfMgmt.transStmt.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWO_WINS_COM_WHOT_DTL")
public class TransStmt {
    @Id
    private String dlvNo;
    private String custCd;
}
