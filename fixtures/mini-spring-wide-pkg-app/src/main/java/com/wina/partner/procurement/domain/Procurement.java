package com.wina.partner.procurement.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "procurement")
public class Procurement {
    @Id @GeneratedValue private Long id;
    private String name;
}
