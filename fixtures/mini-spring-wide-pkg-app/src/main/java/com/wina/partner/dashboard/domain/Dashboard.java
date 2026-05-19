package com.wina.partner.dashboard.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "dashboard")
public class Dashboard {
    @Id @GeneratedValue private Long id;
    private String name;
}
