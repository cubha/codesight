package com.wina.partner.billing.controller;

import com.wina.partner.billing.service.BillingService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/billing")
public class BillingController {
    private final BillingService service;
    public BillingController(BillingService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
