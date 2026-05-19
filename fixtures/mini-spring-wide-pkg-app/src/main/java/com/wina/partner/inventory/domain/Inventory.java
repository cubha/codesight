package com.wina.partner.inventory.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "inventory")
public class Inventory {
    @Id @GeneratedValue private Long id;
    private String name;
}
