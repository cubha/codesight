package com.wina.partner.pricing.controller;

import com.wina.partner.pricing.service.PricingService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/pricing")
public class PricingController {
    private final PricingService service;
    public PricingController(PricingService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
