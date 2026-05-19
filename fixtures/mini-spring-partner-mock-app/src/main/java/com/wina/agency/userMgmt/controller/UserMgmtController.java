package com.wina.agency.userMgmt.controller;

import com.wina.agency.userMgmt.service.UserMgmtService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/v1/agency/userMgmt")
public class UserMgmtController {
    @Autowired
    private UserMgmtService userMgmtService;

    @GetMapping("/list")
    public Object list() { return userMgmtService.retrieveUserList(); }

    @PostMapping("/save")
    public Object save() { return userMgmtService.saveUser(); }

    @DeleteMapping("/{id}")
    public Object remove() { return userMgmtService.removeUser(); }
}
