package com.wina.partner.campaign.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "campaign")
public class Campaign {
    @Id @GeneratedValue private Long id;
    private String name;
}
