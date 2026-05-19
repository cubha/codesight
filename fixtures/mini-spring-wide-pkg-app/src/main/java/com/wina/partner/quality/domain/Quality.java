package com.wina.partner.quality.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "quality")
public class Quality {
    @Id @GeneratedValue private Long id;
    private String name;
}
