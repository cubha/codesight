package com.wina.partner.decoSheet.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "decoSheet")
public class Decosheet {
    @Id @GeneratedValue private Long id;
    private String name;
}
