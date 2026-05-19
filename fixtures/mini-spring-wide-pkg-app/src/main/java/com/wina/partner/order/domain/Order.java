package com.wina.partner.order.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "order")
public class Order {
    @Id @GeneratedValue private Long id;
    private String name;
}
