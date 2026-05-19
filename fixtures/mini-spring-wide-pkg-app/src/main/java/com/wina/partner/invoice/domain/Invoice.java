package com.wina.partner.invoice.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "invoice")
public class Invoice {
    @Id @GeneratedValue private Long id;
    private String name;
}
