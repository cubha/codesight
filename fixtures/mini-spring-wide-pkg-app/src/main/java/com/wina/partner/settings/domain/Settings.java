package com.wina.partner.settings.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "settings")
public class Settings {
    @Id @GeneratedValue private Long id;
    private String name;
}
