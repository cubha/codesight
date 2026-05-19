package com.wina.partner.shipment.controller;

import com.wina.partner.shipment.service.ShipmentService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/shipment")
public class ShipmentController {
    private final ShipmentService service;
    public ShipmentController(ShipmentService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
