package com.wina.partner.loyalty.controller;

import com.wina.partner.loyalty.service.LoyaltyService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/loyalty")
public class LoyaltyController {
    private final LoyaltyService service;
    public LoyaltyController(LoyaltyService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
