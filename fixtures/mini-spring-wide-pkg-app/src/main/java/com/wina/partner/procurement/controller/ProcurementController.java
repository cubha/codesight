package com.wina.partner.procurement.controller;

import com.wina.partner.procurement.service.ProcurementService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/procurement")
public class ProcurementController {
    private final ProcurementService service;
    public ProcurementController(ProcurementService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
