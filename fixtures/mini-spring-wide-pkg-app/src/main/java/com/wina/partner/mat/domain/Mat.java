package com.wina.partner.mat.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "mat")
public class Mat {
    @Id @GeneratedValue private Long id;
    private String name;
}
