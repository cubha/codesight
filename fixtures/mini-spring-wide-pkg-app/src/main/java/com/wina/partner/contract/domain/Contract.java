package com.wina.partner.contract.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "contract")
public class Contract {
    @Id @GeneratedValue private Long id;
    private String name;
}
