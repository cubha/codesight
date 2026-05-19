package com.wina.agency.main.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "main")
public class Main {
    @Id @GeneratedValue private Long id;
    private String name;
}
