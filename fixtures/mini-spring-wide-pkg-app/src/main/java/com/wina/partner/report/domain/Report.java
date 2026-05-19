package com.wina.partner.report.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "report")
public class Report {
    @Id @GeneratedValue private Long id;
    private String name;
}
