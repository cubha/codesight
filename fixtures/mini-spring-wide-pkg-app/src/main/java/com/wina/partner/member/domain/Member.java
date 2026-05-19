package com.wina.partner.member.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "member")
public class Member {
    @Id @GeneratedValue private Long id;
    private String name;
}
