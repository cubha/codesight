package com.wina.partner.inv.controller;

import com.wina.partner.inv.service.InvService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/inv")
public class InvController {
    private final InvService service;
    public InvController(InvService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
