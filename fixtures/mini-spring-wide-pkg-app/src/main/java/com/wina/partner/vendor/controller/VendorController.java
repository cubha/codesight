package com.wina.partner.vendor.controller;

import com.wina.partner.vendor.service.VendorService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/vendor")
public class VendorController {
    private final VendorService service;
    public VendorController(VendorService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
