package com.wina.partner.inv.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "inv")
public class Inv {
    @Id @GeneratedValue private Long id;
    private String name;
}
