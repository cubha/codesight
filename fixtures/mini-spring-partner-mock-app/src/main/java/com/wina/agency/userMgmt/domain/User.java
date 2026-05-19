package com.wina.agency.userMgmt.domain;

import javax.persistence.*;

@Entity
@Table(name = "TWA_USER_MST")
public class User {
    @Id
    private String userId;
    private String userName;
    private String email;
}
