package com.wina.partner.stock.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "stock")
public class Stock {
    @Id @GeneratedValue private Long id;
    private String name;
}
