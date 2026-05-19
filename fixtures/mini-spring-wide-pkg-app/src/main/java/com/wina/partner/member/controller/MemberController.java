package com.wina.partner.member.controller;

import com.wina.partner.member.service.MemberService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/member")
public class MemberController {
    private final MemberService service;
    public MemberController(MemberService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
