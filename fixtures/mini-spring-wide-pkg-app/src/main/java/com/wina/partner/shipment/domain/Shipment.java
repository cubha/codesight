package com.wina.partner.shipment.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "shipment")
public class Shipment {
    @Id @GeneratedValue private Long id;
    private String name;
}
