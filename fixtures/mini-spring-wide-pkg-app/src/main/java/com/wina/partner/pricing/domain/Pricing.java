package com.wina.partner.pricing.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "pricing")
public class Pricing {
    @Id @GeneratedValue private Long id;
    private String name;
}
