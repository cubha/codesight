package com.wina.partner.loyalty.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "loyalty")
public class Loyalty {
    @Id @GeneratedValue private Long id;
    private String name;
}
