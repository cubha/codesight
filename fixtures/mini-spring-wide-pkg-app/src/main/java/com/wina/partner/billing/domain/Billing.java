package com.wina.partner.billing.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "billing")
public class Billing {
    @Id @GeneratedValue private Long id;
    private String name;
}
