package com.wina.partner.vendor.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "vendor")
public class Vendor {
    @Id @GeneratedValue private Long id;
    private String name;
}
